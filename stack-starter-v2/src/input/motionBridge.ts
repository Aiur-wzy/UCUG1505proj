import type { MotionController } from '../shared/contract';
import type { InputHost } from './inputHost';

type ControllerModule = { createMotionController(): MotionController };
// B adds this module. A owns lifecycle wiring, never camera pixels or gestures.
const modules = import.meta.glob<ControllerModule>('../motion/controller.ts');
export class MotionBridge {
  readonly available = Object.keys(modules).length > 0;
  private controller: MotionController | null = null;
  private unsubscribe: (() => void) | null = null;
  private generation = 0;
  constructor(private host: InputHost, private notice: (message: string) => void) {}
  async start(): Promise<void> {
    const context = this.host.getContext();
    if (context.phase === 'resolving' || !['play', 'calibration'].includes(context.scene)) return;
    this.stop(); const generation = this.generation;
    const load = modules['../motion/controller.ts'];
    if (!load) { this.notice('手套模块尚未接入。当前可使用完整键鼠玩法。'); return; }
    this.host.setPreviewSource('motion'); this.host.setCalibrating(true);
    let controller: MotionController | null = null;
    try {
      const module = await load();
      if (generation !== this.generation) return;
      controller = module.createMotionController(); this.controller = controller;
      this.unsubscribe = this.host.onContext(context => controller!.setContext(context));
      await controller.start(this.host);
      if (generation !== this.generation) { controller.stop(); return; }
      for (const player of this.host.getSnapshot().mode === 'duel' ? ['A', 'B'] as const : ['A'] as const) {
        const result = await controller.calibrate(player);
        if (generation !== this.generation) { controller.stop(); return; }
        if (!result.ok) throw new Error(result.reason ?? '校准未完成');
      }
      this.host.setCalibrating(false); this.notice('手套校准完成。也可以随时使用 Enter、空格和 Esc。');
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop(); this.host.setCalibrating(false);
      this.notice(`手套尚未就绪：${error instanceof Error ? error.message : String(error)}。可以切回键鼠继续。`);
    }
  }
  stop(): void { this.generation++; this.unsubscribe?.(); this.unsubscribe = null; this.controller?.stop(); this.controller = null; }
}
