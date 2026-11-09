import defaults from '../shared/defaults.json';
import type { ControlContext, FeedbackReason } from '../shared/contract';
import type { FrameToken, VisionConfig, VisionRequest, VisionResponse } from '../shared/vision-worker';
import { acceptFrame, sameFrame } from './frameGate';

export type VisionResult = Extract<VisionResponse, { kind: 'RESULT' }>;
export interface VisionSource { element: HTMLVideoElement | HTMLCanvasElement; draw?: () => void }
interface Options {
  workerUrl: string; opencvUrl: string;
  now: () => number; context: () => ControlContext;
  result: (result: VisionResult) => void;
  fault: (reason: FeedbackReason, detail: string) => void;
  createWorker?: () => Worker;
  capture?: (source: HTMLVideoElement | HTMLCanvasElement) => Promise<ImageBitmap>;
  getMedia?: () => Promise<MediaStream>;
}
const aborted = (): DOMException => new DOMException('视觉输入已停止', 'AbortError');
export class VisionClient {
  private worker: Worker | null = null;
  private source: VisionSource | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private generation = 0;
  private configVersion = 1;
  private configured = 0;
  private frameId = 0;
  private accepted = 0;
  private flight: FrameToken | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private initTimer: ReturnType<typeof setTimeout> | undefined;
  private initResolve: (() => void) | null = null;
  private initReject: ((error: Error) => void) | null = null;
  private cancelStart: ((error: Error) => void) | null = null;
  private pending: Promise<void> | null = null;
  private initialized = false;
  private lastVideoTime = -1;
  private lastVideoAt = 0;
  readonly stats = { received: 0, dropped: 0, skipped: 0, processingMs: 0, latencyMs: 0, maxInFlight: 0 };
  constructor(private config: VisionConfig, private options: Options) {}
  get running(): boolean { return !!this.source && !!this.worker; }
  start(source: VisionSource, useCamera = false): Promise<void> {
    if (this.pending) return this.pending;
    if (this.running) return Promise.resolve();
    const generation = ++this.generation;
    const cancel = new Promise<never>((_, reject) => { this.cancelStart = reject; });
    const setup = async () => {
      await this.initialize();
      if (generation !== this.generation) throw aborted();
      if (useCamera) {
        const getMedia = this.options.getMedia ?? (() => {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('此浏览器不能使用摄像头，请使用 localhost 或 HTTPS');
          return navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } });
        });
        const stream = await getMedia();
        if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); throw aborted(); }
        this.stream = stream;
        const video = source.element as HTMLVideoElement;
        this.video = video; video.srcObject = stream;
        await video.play();
        if (generation !== this.generation) throw aborted();
        stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
          if (generation === this.generation) this.fail('CAMERA_MISSING', '摄像头连接已断开，请手动重试');
        }, { once: true }));
        this.lastVideoAt = this.options.now(); this.lastVideoTime = -1;
      }
      this.source = source;
      this.timer = setInterval(() => { void this.sample(); }, 1000 / defaults.vision.targetHz);
      void this.sample();
    };
    const pending = Promise.race([setup(), cancel]).catch((error: unknown) => {
      if (generation === this.generation) {
        const name = error instanceof Error ? error.name : '';
        this.fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'CAMERA_DENIED' : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'CAMERA_MISSING' : 'VISION_INIT_FAILED', String(error));
      }
      throw error;
    }).finally(() => { if (this.pending === pending) { this.pending = null; this.cancelStart = null; } });
    this.pending = pending;
    return pending;
  }
  private initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.initResolve = resolve; this.initReject = reject;
      const worker = this.options.createWorker?.() ?? new Worker(new URL(this.options.workerUrl, document.baseURI));
      this.worker = worker;
      worker.onerror = event => { if (worker === this.worker) this.fail('WORKER_FAILED', event.message || 'Worker 执行失败'); };
      worker.onmessageerror = () => { if (worker === this.worker) this.fail('WORKER_FAILED', 'Worker 消息无法读取'); };
      worker.onmessage = (event: MessageEvent<VisionResponse>) => { if (worker === this.worker) this.receive(event.data); };
      this.post({ kind: 'INIT', protocol: '1.0', generation: this.generation, configVersion: this.configVersion,
        config: this.config, opencvUrl: new URL(this.options.opencvUrl, document.baseURI).href });
      this.initTimer = setTimeout(() => this.fail('VISION_INIT_FAILED', 'OpenCV 初始化超过 15 秒，请检查本地资源后重试'), defaults.vision.initTimeoutMs);
    });
  }
  updateConfig(config: VisionConfig): void {
    this.config = structuredClone(config); this.configVersion++; this.configured = 0;
    if (this.initialized) this.configure();
  }
  private configure(): void {
    this.post({ kind: 'CONFIG', generation: this.generation, configVersion: this.configVersion, config: this.config });
    clearTimeout(this.initTimer);
    this.initTimer = setTimeout(() => this.fail('WORKER_FAILED', '颜色配置未获得确认，请重试'), defaults.vision.initTimeoutMs);
  }
  private post(request: VisionRequest): void { this.worker?.postMessage(request); }
  private receive(message: VisionResponse): void {
    if ((message.kind === 'RESULT' ? message.token.generation : message.generation) !== this.generation) return;
    if (message.kind === 'READY') {
      if (message.protocol !== '1.0') { this.fail('VISION_INIT_FAILED', 'Worker 协议版本不匹配'); return; }
      this.initialized = true;
      if (message.configVersion !== this.configVersion) { this.configure(); return; }
      this.configured = message.configVersion; clearTimeout(this.initTimer);
      this.initResolve?.(); this.initResolve = null; this.initReject = null;
    } else if (message.kind === 'CONFIGURED') {
      if (message.configVersion !== this.configVersion) return;
      this.configured = message.configVersion; clearTimeout(this.initTimer);
      this.initResolve?.(); this.initResolve = null; this.initReject = null;
    } else if (message.kind === 'RESULT') {
      if (!sameFrame(this.flight, message.token)) { this.stats.dropped++; return; }
      this.flight = null; clearTimeout(this.watchdog);
      if (!acceptFrame(message.token, this.options.context(), this.generation, this.configVersion, this.accepted, this.options.now())) { this.stats.dropped++; return; }
      this.accepted = message.token.frameId;
      this.stats.received++; this.stats.processingMs = message.processingMs;
      this.stats.latencyMs = this.options.now() - message.token.sampleAtMs;
      this.options.result(message);
    } else if (message.kind === 'ERROR') {
      this.fail(message.code === 'INIT_FAILED' ? 'VISION_INIT_FAILED' : 'WORKER_FAILED', message.message);
    }
  }
  private async sample(): Promise<void> {
    if (!this.worker || !this.source || this.configured !== this.configVersion) return;
    if (this.flight) { this.stats.skipped++; return; }
    const source = this.source, worker = this.worker, c = this.options.context();
    if (this.video) {
      if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) {
        if (this.options.now() - this.lastVideoAt > defaults.vision.frameWatchdogMs) this.fail('FRAME_TIMEOUT', '摄像头没有提供新画面，请重试');
        return;
      }
      this.lastVideoTime = this.video.currentTime; this.lastVideoAt = this.options.now();
    }
    source.draw?.();
    const token: FrameToken = { generation: this.generation, configVersion: this.configVersion, frameId: ++this.frameId,
      sessionId: c.sessionId, contextId: c.contextId, turnId: c.turnId, playerId: c.activePlayerId,
      source: c.previewSource, sampleAtMs: this.options.now() };
    this.flight = token; this.stats.maxInFlight = Math.max(this.stats.maxInFlight, 1);
    this.watchdog = setTimeout(() => { if (sameFrame(this.flight, token)) this.fail('FRAME_TIMEOUT', '图像采集或识别超过 1 秒，请手动重试'); }, defaults.vision.frameWatchdogMs);
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await (this.options.capture?.(source.element) ?? createImageBitmap(source.element));
      if (worker !== this.worker || !sameFrame(this.flight, token) ||
        !acceptFrame(token, this.options.context(), this.generation, this.configVersion, this.accepted, this.options.now())) {
        bitmap.close(); bitmap = null;
        if (sameFrame(this.flight, token)) { this.flight = null; clearTimeout(this.watchdog); }
        this.stats.dropped++; return;
      }
      const request: VisionRequest = { kind: 'FRAME', token, bitmap };
      worker.postMessage(request, [bitmap]); bitmap = null;
    } catch (error) {
      bitmap?.close();
      if (worker === this.worker && sameFrame(this.flight, token)) this.fail('WORKER_FAILED', `图像采集失败：${String(error)}`);
    }
  }
  private fail(reason: FeedbackReason, detail: string): void { this.stop(new Error(detail)); this.options.fault(reason, detail); }
  stop(error: Error = aborted()): void {
    this.generation++;
    clearInterval(this.timer); clearTimeout(this.watchdog); clearTimeout(this.initTimer);
    this.cancelStart?.(error); this.cancelStart = null;
    this.initReject?.(error); this.initResolve = null; this.initReject = null;
    this.worker?.terminate(); this.worker = null;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; this.video = null; }
    this.source = null; this.flight = null; this.configured = 0; this.initialized = false; this.pending = null;
  }
}
