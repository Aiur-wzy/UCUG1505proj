import defaults from '../shared/defaults.json';
import type { CalibrationResult, ControlCommand, ControlContext, FeedbackReason, InteractionFeedback, MotionController, MotionHost, PlayerId } from '../shared/contract';
import type { VisionConfig } from '../shared/vision-worker';
import { colorConfig } from './colors';
import { CalibrationSampler, makeProfile } from './calibration';
import type { CalibrationStep } from './calibration';
import { trackingIdentity } from './frameGate';
import { MotionGestures } from './gestures';
import { mapPair } from './mapping';
import { PairTracker } from './tracking';
import { PairSmoother, RearmGate } from './smoothing';
import type { CalibrationProfile, GloveMode, HandPair, Observation } from './types';
import { CalibrationPanel } from './ui/calibrationPanel';
import { VisionClient } from './visionClient';
import type { VisionResult } from './visionClient';
import workerUrl from '/generated/vision.worker.js?url';
import opencvUrl from '/vendor/opencv/opencv-4.13.0.js?url';

const reasons: Partial<Record<FeedbackReason, string>> = {
  COLOR_MISSING: '没有找到两只手套，请回到画面中', AMBIGUOUS_BLOBS: '颜色身份不明确，请分开双手并移开同色干扰',
  PAIR_TOO_CLOSE: '两只手套太近，请保持分离', POSITION_JUMP: '位置变化过快，请回到近距离重新就绪',
  CALIBRATION_REQUIRED: '需要完成当前玩家的校准', FRAME_TIMEOUT: '画面已过期，暂停体感输入',
};
interface CalibrationSession {
  player: PlayerId; resolve: (result: CalibrationResult) => void;
  values: Partial<Record<CalibrationStep, { angle: number; distance: number }>>;
  recording: CalibrationStep | null; sampler: CalibrationSampler;
}
export class GloveController implements MotionController {
  private host: MotionHost | null = null;
  private context: ControlContext | null = null;
  private panel: CalibrationPanel | null = null;
  private vision: VisionClient | null = null;
  private mode: GloveMode = 'red-green';
  private config = colorConfig(this.mode);
  private profiles = new Map<PlayerId, CalibrationProfile>();
  private tracker = new PairTracker();
  private smoother = new PairSmoother();
  private rearm = new RearmGate();
  private gestures = new MotionGestures();
  private calibrationSession: CalibrationSession | null = null;
  private startPromise: Promise<void> | null = null;
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((error: Error) => void) | null = null;
  private generation = 0;
  private sequence = 0;
  private clockTimer: ReturnType<typeof setInterval> | undefined;
  private abort: AbortController | null = null;
  private lastFrameAt = -Infinity;
  readonly diagnostics = {
    frame: null as VisionResult | null, observation: null as Observation | null,
    fault: null as string | null, feedback: null as InteractionFeedback | null,
    commands: [] as { command: ControlCommand; accepted: boolean; reason: string }[],
    profileVersions: {} as Partial<Record<PlayerId, number>>,
  };
  get simulator(): CalibrationPanel['synthetic'] | null { return this.panel?.synthetic ?? null; }
  get visionStats(): VisionClient['stats'] | null { return this.vision?.stats ?? null; }
  setContext(context: ControlContext): void {
    const previous = this.context;
    this.context = structuredClone(context);
    if (!previous || trackingIdentity(previous) !== trackingIdentity(context)) {
      if (previous && this.calibrationSession) this.cancelCalibration('玩家、回合或输入来源已改变，请重新校准');
      this.resetTracking();
    }
    if (!previous || previous.sessionId !== context.sessionId || previous.contextId !== context.contextId) this.gestures.reset();
    // No submit/report here: the host can be synchronously publishing this notification.
  }
  start(host: MotionHost): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.vision?.running) return Promise.resolve();
    if (this.panel || this.vision) this.stop();
    this.mode = 'red-green'; this.config = colorConfig(this.mode); this.profiles.clear();
    this.diagnostics.profileVersions = {};
    this.host = host; this.setContext(host.getContext());
    const generation = ++this.generation;
    this.startPromise = new Promise((resolve, reject) => { this.resolveStart = resolve; this.rejectStart = reject; });
    this.panel = new CalibrationPanel(host.cameraMount, {
      start: camera => { void this.startSource(camera, generation); }, stop: () => this.stop(),
      recalibrate: () => this.recalibrateCurrent(),
      configure: (mode, config) => this.configure(mode, config), capture: step => this.capture(step),
      save: sign => this.saveCalibration(sign), cancel: () => this.cancelCalibration('玩家取消了校准'),
    });
    this.vision = new VisionClient(this.config, { workerUrl, opencvUrl, now: () => host.now(), context: () => this.context!,
      result: result => this.process(result), fault: (reason, detail) => {
        this.diagnostics.fault = detail; this.resetTracking(); this.panel?.clearObservation(); this.panel?.status(detail);
        this.report(host.now(), false, false, false, reason, 'error'); this.cancelCalibration(detail);
      } });
    this.abort = new AbortController();
    window.addEventListener('pagehide', () => this.stop(), { signal: this.abort.signal });
    this.clockTimer = setInterval(() => {
      if (this.vision?.running && Number.isFinite(this.lastFrameAt) && host.now() - this.lastFrameAt > defaults.transport.maxSampleAgeMs) {
        this.resetTracking(); this.panel?.clearObservation(); this.panel?.status(reasons.FRAME_TIMEOUT!);
        this.report(host.now(), false, false, false, 'FRAME_TIMEOUT', 'lost'); this.lastFrameAt = -Infinity;
      }
    }, 100);
    this.report(host.now(), false, false, false, 'CALIBRATION_REQUIRED', 'starting');
    return this.startPromise;
  }
  private async startSource(camera: boolean, generation: number): Promise<void> {
    if (!this.panel || !this.vision || this.vision.running) return;
    const panel = this.panel;
    panel.starting(); panel.source(camera);
    try {
      await this.vision.start(camera ? { element: panel.video } : { element: panel.canvas, draw: panel.synthetic.draw }, camera);
      if (generation !== this.generation) return;
      panel.status('识别已启动，等待校准');
      this.resolveStart?.(); this.resolveStart = null; this.rejectStart = null; this.startPromise = null;
    } catch (error) {
      if (generation !== this.generation) return;
      panel.status(`启动失败：${String(error)}`);
      this.rejectStart?.(error instanceof Error ? error : new Error(String(error)));
      this.resolveStart = null; this.rejectStart = null; this.startPromise = null;
    }
  }
  calibrate(playerId: PlayerId): Promise<CalibrationResult> {
    if (!this.vision?.running || !this.panel) return Promise.resolve({ playerId, ok: false, profileVersion: 0, reason: '请先启动视觉输入' });
    this.cancelCalibration('开始新的校准'); this.resetTracking();
    this.panel.calibration(playerId);
    return new Promise(resolve => { this.calibrationSession = { player: playerId, resolve, values: {}, recording: null, sampler: new CalibrationSampler() }; });
  }
  private recalibrateCurrent(): void {
    const player = this.context?.activePlayerId;
    if (player && this.vision?.running && !this.calibrationSession) {
      void this.calibrate(player).then(result => { if (!result.ok) this.panel?.status(result.reason ?? '校准已取消'); });
      if (this.host) this.report(this.host.now(), false, false, false, 'CALIBRATION_REQUIRED', 'calibrating');
    }
  }
  private configure(mode: GloveMode, config: VisionConfig): void {
    this.mode = mode; this.config = config; this.profiles.clear(); this.diagnostics.profileVersions = {};
    this.resetTracking(); this.vision?.updateConfig(config);
    if (this.host) this.report(this.host.now(), false, false, false, 'CALIBRATION_REQUIRED', 'calibrating');
    if (this.calibrationSession) {
      this.calibrationSession.values = {}; this.calibrationSession.recording = null; this.calibrationSession.sampler.reset();
      this.panel?.calibration(this.calibrationSession.player);
    } else this.recalibrateCurrent();
    this.panel?.status('颜色设置已更新；请重新完成三步校准');
  }
  private capture(step: CalibrationStep): void {
    const c = this.calibrationSession; if (!c) return;
    c.recording = step; c.sampler.reset(); delete c.values[step];
    this.panel?.startStep(step);
    this.panel?.progress(0, '请保持双手静止约 1 秒；缺手或干扰会重新计时');
  }
  private draft(sign: 1 | -1): CalibrationProfile | null {
    const c = this.calibrationSession;
    if (!c || !c.values.neutral || !c.values.close || !c.values.far) return null;
    return makeProfile(c.player, (this.profiles.get(c.player)?.version ?? 0) + 1, this.mode, this.config,
      c.values.neutral.angle, c.values.close.distance, c.values.far.distance, sign);
  }
  private saveCalibration(sign: 1 | -1): void {
    const c = this.calibrationSession; if (!c) return;
    try {
      if (c.recording) throw new Error('请等待当前采样完成');
      const profile = this.draft(sign); if (!profile) throw new Error('需要先完成三个校准姿势');
      this.profiles.set(c.player, profile); this.diagnostics.profileVersions[c.player] = profile.version;
      this.calibrationSession = null; this.panel?.finishCalibration(); this.resetTracking();
      c.resolve({ playerId: c.player, ok: true, profileVersion: profile.version, reason: null });
    } catch (error) { this.panel?.progress(0, error instanceof Error ? error.message : String(error)); }
  }
  private cancelCalibration(reason: string): void {
    const c = this.calibrationSession; if (!c) return;
    this.calibrationSession = null; this.panel?.finishCalibration(); this.resetTracking();
    c.resolve({ playerId: c.player, ok: false, profileVersion: this.profiles.get(c.player)?.version ?? 0, reason });
  }
  private resetTracking(): void {
    this.tracker.reset(); this.smoother.reset(); this.rearm.reset(); this.gestures.reset();
    this.calibrationSession?.sampler.reset(); this.diagnostics.observation = null;
  }
  private process(result: VisionResult): void {
    const host = this.host, context = this.context, panel = this.panel;
    if (!host || !context || !panel) return;
    const atMs = result.token.sampleAtMs;
    this.lastFrameAt = atMs; this.diagnostics.frame = result;
    const tracked = this.tracker.update(result.candidates, this.mode, this.config.width, atMs);
    if (!tracked.valid) {
      this.smoother.reset(); this.rearm.reset(); this.gestures.reset(); this.calibrationSession?.sampler.reset();
      if (this.calibrationSession?.recording) panel.progress(0, '手套对暂不可用；恢复后重新计时');
      this.diagnostics.observation = null; panel.display(result, null, null); panel.status(reasons[tracked.reason] ?? tracked.reason);
      this.report(atMs, false, !!(context.activePlayerId && this.profiles.has(context.activePlayerId)), false, tracked.reason, this.calibrationSession ? 'calibrating' : 'lost'); return;
    }
    const pair = this.smoother.update(tracked.pair, atMs);
    this.collectCalibration(tracked.pair, atMs);
    let profile = context.activePlayerId ? this.profiles.get(context.activePlayerId) : undefined;
    if (this.calibrationSession) {
      try { profile = this.draft(panel.sign) ?? undefined; } catch { profile = undefined; }
    }
    const observation = profile ? mapPair(pair, profile, atMs, context.limits) : null;
    if (observation && !this.calibrationSession) observation.rearmed = this.rearm.update(atMs, observation.r);
    this.diagnostics.observation = observation;
    panel.display(result, pair, observation);
    if (this.calibrationSession) {
      this.report(atMs, true, false, false, 'CALIBRATION_REQUIRED', 'calibrating');
      panel.status('校准中：记录三种姿势，再检查方向与力度读数'); return;
    }
    if (!observation) { panel.status('当前玩家尚未校准，请点击游戏中的“重新校准”'); this.report(atMs, true, false, false, 'CALIBRATION_REQUIRED', 'lost'); return; }
    const gesture = this.gestures.update(context, observation);
    panel.slots(context.ballOptions, gesture.focusedBallId, gesture.holdProgress01);
    panel.status(observation.rearmed ? context.previewSource === 'motion' ? '手套已就绪 · 实时调整方向和力度 · 键鼠确认投掷' : '当前由键鼠控制；手套仍在追踪' : '请先保持可见，再将双手收至校准近距离并保持约 1 秒');
    this.report(atMs, true, true, observation.rearmed, 'NONE', 'ready', gesture.holdProgress01, gesture.focusedBallId);
    // report may open/close the motion gate synchronously. Do not relabel this old sample.
    const latest = host.getContext();
    if (latest.sessionId !== context.sessionId || latest.contextId !== context.contextId || !gesture.intent) return;
    const command = { protocolVersion: '1.1' as const, sessionId: context.sessionId, contextId: context.contextId,
      commandId: `glove-${this.generation}-${++this.sequence}`, source: 'motion' as const, atMs, ...gesture.intent };
    try {
      const receipt = host.submit(command);
      this.diagnostics.commands.push({ command, accepted: receipt.accepted, reason: receipt.reason });
      if (this.diagnostics.commands.length > 200) this.diagnostics.commands.shift();
      if (!receipt.accepted) this.gestures.reset();
    } catch (error) {
      this.gestures.reset(); this.diagnostics.fault = String(error); panel.status(`游戏未接受本次输入：${String(error)}`);
    }
  }
  private collectCalibration(pair: HandPair, atMs: number): void {
    const c = this.calibrationSession; if (!c?.recording) return;
    const progress = c.sampler.add(pair, atMs);
    this.panel?.progress(progress, `正在采样：${Math.round(progress * 100)}%`);
    if (progress < 1) return;
    try {
      c.values[c.recording] = c.sampler.finish(); this.panel?.completedStep(c.recording); c.recording = null;
      let message = '已记录。请进行下一步。';
      if (c.values.neutral && c.values.close && c.values.far) { this.draft(this.panel!.sign); message = '三个姿势已记录。转动、拉开双手检查读数，确认后保存。'; }
      this.panel?.progress(1, message);
    } catch (error) { c.recording = null; this.panel?.progress(0, String(error instanceof Error ? error.message : error)); }
  }
  private report(atMs: number, validPair: boolean, calibrated: boolean, rearmed: boolean, reason: FeedbackReason,
    tracking: InteractionFeedback['tracking'], holdProgress01 = 0, focusedBallId: string | null = null): void {
    if (!this.host || !this.context) return;
    const c = this.context;
    const feedback: InteractionFeedback = { protocolVersion: '1.1', sessionId: c.sessionId, contextId: c.contextId,
      source: 'motion', atMs, playerId: c.activePlayerId, tracking, validPair, calibrated, rearmed, reason, holdProgress01, focusedBallId };
    this.diagnostics.feedback = feedback; this.host.report(feedback);
  }
  stop(): void {
    this.generation++; clearInterval(this.clockTimer); this.abort?.abort(); this.abort = null;
    if (this.host) this.report(this.host.now(), false, false, false, 'NONE', 'stopped');
    this.vision?.stop(); this.vision = null;
    this.rejectStart?.(new DOMException('输入启动已取消', 'AbortError'));
    this.rejectStart = null; this.resolveStart = null; this.startPromise = null;
    this.cancelCalibration('视觉输入已停止'); this.resetTracking(); this.lastFrameAt = -Infinity;
    this.panel?.destroy(); this.panel = null; this.host = null;
  }
}
export function createMotionController(): MotionController { return new GloveController(); }
