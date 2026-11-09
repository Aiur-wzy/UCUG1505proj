import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisionClient } from '../../src/motion/visionClient';
import { colorConfig } from '../../src/motion/colors';
import type { VisionRequest, VisionResponse } from '../../src/shared/vision-worker';
import { context } from './helpers';

class FakeWorker {
  onmessage: ((event: MessageEvent<VisionResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: VisionRequest[] = [];
  terminate = vi.fn();
  postMessage(request: VisionRequest): void {
    this.requests.push(request);
    if (request.kind === 'INIT') queueMicrotask(() => this.emit({ kind: 'READY', protocol: '1.0', generation: request.generation, configVersion: request.configVersion, opencvVersion: '4.13.0' }));
    if (request.kind === 'CONFIG') queueMicrotask(() => this.emit({ kind: 'CONFIGURED', generation: request.generation, configVersion: request.configVersion }));
  }
  emit(message: VisionResponse): void { this.onmessage?.({ data: message } as MessageEvent<VisionResponse>); }
  frames(): Extract<VisionRequest, { kind: 'FRAME' }>[] { return this.requests.filter((r): r is Extract<VisionRequest, { kind: 'FRAME' }> => r.kind === 'FRAME'); }
  complete(): void { const frame = this.frames().at(-1)!; this.emit({ kind: 'RESULT', token: frame.token, processingMs: 3, candidates: { anchor: [], guide: [] } }); }
}
const source = { element: {} as HTMLCanvasElement };
let clients: VisionClient[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('document', { baseURI: 'http://localhost/' }); });
afterEach(() => { clients.forEach(client => client.stop()); clients = []; vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture(capture = vi.fn(async () => ({ close: vi.fn() } as unknown as ImageBitmap)), getMedia?: () => Promise<MediaStream>) {
  const workers: FakeWorker[] = [], result = vi.fn(), fault = vi.fn(); let active = context();
  const client = new VisionClient(colorConfig('red-green'), { workerUrl: '/worker.js', opencvUrl: '/opencv.js', now: () => Date.now(), context: () => active, result, fault, capture, getMedia,
    createWorker: () => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; } });
  clients.push(client); return { client, workers, result, fault, capture, changeContext: () => { active = context({ contextId: 2 }); } };
}
describe('vision async resource lifetime', () => {
  it('keeps bitmap creation inside the single in-flight slot, closes late bitmaps after stop', async () => {
    let finish!: (bitmap: ImageBitmap) => void;
    const capture = vi.fn(() => new Promise<ImageBitmap>(resolve => { finish = resolve; }));
    const f = fixture(capture); await f.client.start(source); await vi.advanceTimersByTimeAsync(200);
    expect(capture).toHaveBeenCalledTimes(1); expect(f.workers[0].frames()).toHaveLength(0);
    const close = vi.fn(); f.client.stop(); finish({ close } as unknown as ImageBitmap); await Promise.resolve();
    expect(close).toHaveBeenCalledOnce(); expect(f.workers[0].frames()).toHaveLength(0);
  });
  it('drops old contexts but releases their corresponding flight; configuration changes wait for their ACK', async () => {
    const f = fixture(); await f.client.start(source); await vi.advanceTimersByTimeAsync(1);
    f.changeContext(); f.workers[0].complete(); expect(f.result).not.toHaveBeenCalled();
    f.client.updateConfig(colorConfig('green-green')); await vi.advanceTimersByTimeAsync(60);
    expect(f.workers[0].frames()).toHaveLength(2);
    expect(f.workers[0].frames()[1].token).toMatchObject({ contextId: 2, configVersion: 2 });
    f.workers[0].complete(); expect(f.result).toHaveBeenCalledOnce();
  });
  it('ignores old-worker results without releasing a new generation flight', async () => {
    const f = fixture(); await f.client.start(source); await vi.advanceTimersByTimeAsync(1); const old = f.workers[0];
    f.client.stop(); await f.client.start(source); await vi.advanceTimersByTimeAsync(1);
    old.complete(); await vi.advanceTimersByTimeAsync(150);
    expect(f.workers[1].frames()).toHaveLength(1); expect(f.result).not.toHaveBeenCalled();
  });
  it('watchdog includes bitmap acquisition, terminates once and does not auto-restart', async () => {
    const f = fixture(vi.fn(() => new Promise<ImageBitmap>(() => {})));
    await f.client.start(source); await vi.advanceTimersByTimeAsync(1100);
    expect(f.fault).toHaveBeenCalledWith('FRAME_TIMEOUT', expect.any(String));
    expect(f.workers[0].terminate).toHaveBeenCalledOnce(); await vi.advanceTimersByTimeAsync(5000); expect(f.workers).toHaveLength(1);
  });
  it('stop cancels a pending camera start; permission resolving late immediately closes its tracks', async () => {
    let resolveMedia!: (stream: MediaStream) => void;
    const f = fixture(undefined, () => new Promise(resolve => { resolveMedia = resolve; }));
    const video = { play: vi.fn(async () => {}), pause: vi.fn(), srcObject: null } as unknown as HTMLVideoElement;
    const pending = f.client.start({ element: video }, true); const outcome = pending.catch(error => error.name);
    expect(f.client.start({ element: video }, true)).toBe(pending);
    await vi.advanceTimersByTimeAsync(1); f.client.stop(); expect(await outcome).toBe('AbortError');
    const stop = vi.fn(); resolveMedia({ getTracks: () => [{ stop }] } as unknown as MediaStream); await Promise.resolve(); await Promise.resolve();
    expect(stop).toHaveBeenCalledOnce(); expect(video.play).not.toHaveBeenCalled();
  });
});
