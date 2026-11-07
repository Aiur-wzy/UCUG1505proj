import type { CommandType, ResultReason } from '../shared/contract';
import { clampShot } from '../game/physics/shotMath';
import { InputHost } from './inputHost';
import type { CommandPayloads } from './inputHost';

export const resultMessages: Record<ResultReason, string> = {
  OK: '', VERSION_MISMATCH: '输入版本不匹配，请重新加载。', SESSION_MISMATCH: '这条操作属于上一局。',
  STALE_CONTEXT: '回合已更新，请重新操作。', INACTIVE_SOURCE: '请先接管瞄准。', INPUT_DISABLED: '请等待当前投掷结束。',
  WRONG_PHASE: '请按选球、瞄准、锁定、发射的顺序操作。', INVALID_PAYLOAD: '输入参数无效。', STALE_INPUT: '输入已过期，请重新操作。',
  OUT_OF_STOCK: '这种球已用完。', TRACKING_UNREADY: '手套尚未就绪，仍可用键鼠操作。', PREVIEW_UNREADY: '请先调整瞄准。',
  ACTION_DISABLED: '这个手套动作尚未开启，请用键盘确认。', ID_REUSE: '重复的操作编号，已阻止执行。',
};
export class KeyboardInput {
  constructor(private host: InputHost, private canvas: HTMLCanvasElement, private notice: (text: string) => void) {
    canvas.tabIndex = 0; canvas.setAttribute('aria-label', '投掷场地。数字选球，方向键瞄准，Enter 锁定，空格发射，Esc 取消。');
    window.addEventListener('keydown', this.onKey);
    canvas.addEventListener('pointerdown', this.onFocus);
    canvas.addEventListener('pointermove', this.onPointer);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }
  send<T extends CommandType>(type: T, payload: CommandPayloads[T]): void {
    try { const result = this.host.submit(this.host.command<T>(type, payload)); if (!result.accepted) this.notice(resultMessages[result.reason]); }
    catch (error) { console.error('Shot command failed', error); this.notice('投掷未能创建，库存已保留。请重试本局。'); }
  }
  focus(): void { this.canvas.focus({ preventScroll: true }); }
  private onFocus = () => this.focus();
  private onKey = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input,textarea,select,button,a,[contenteditable="true"],[role="button"]')) return;
    const context = this.host.getContext();
    if (!context.inputEnabled || context.scene !== 'play') return;
    const isArrow = event.key.startsWith('Arrow');
    if (event.repeat && !isArrow) return;
    const ballIndex = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    if (ballIndex < 0 && !['Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) return;
    event.preventDefault();
    if (ballIndex >= 0) {
      const ball = context.ballOptions[ballIndex];
      if (context.phase === 'select' && ball) this.send('SELECT_BALL', { ballTypeId: ball.id });
    } else if (event.key === 'Enter') this.send('ARM_SHOT', {});
    else if (event.key === ' ') this.send('FIRE', {});
    else if (event.key === 'Escape') this.send('CANCEL_SHOT', {});
    else if (isArrow) {
      // Explicit arrows may take over a motion lock; keyboard-owned locks stay frozen.
      if (context.previewSource === 'motion') this.host.setPreviewSource('keyboard');
      if (this.host.getContext().phase !== 'adjust') return;
      const shot = this.host.getContext().previewShot!;
      this.send('PREVIEW_SHOT', clampShot({ aimDeg: shot.aimDeg + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0),
        power01: shot.power01 + (event.key === 'ArrowUp' ? 0.05 : event.key === 'ArrowDown' ? -0.05 : 0) }));
    }
  };
  private onPointer = (event: PointerEvent) => {
    const state = this.host.getSnapshot(), context = state.context;
    if (!context.inputEnabled || context.phase !== 'adjust' || context.previewSource !== 'keyboard' || !state.origin) return;
    const bounds = this.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * 1000, y = (event.clientY - bounds.top) / bounds.height * 700;
    this.send('PREVIEW_SHOT', clampShot({ aimDeg: Math.atan2(x - state.origin.x, state.origin.y - y) * 180 / Math.PI, power01: context.previewShot!.power01 }));
  };
  private onWheel = (event: WheelEvent) => {
    const context = this.host.getContext();
    if (!context.inputEnabled || !['adjust', 'armed'].includes(context.phase)) return;
    event.preventDefault();
    if (context.previewSource === 'motion') this.host.setPreviewSource('keyboard');
    const latest = this.host.getContext();
    if (latest.phase === 'adjust') this.send('PREVIEW_SHOT', clampShot({ ...latest.previewShot!, power01: latest.previewShot!.power01 - Math.sign(event.deltaY) * 0.05 }));
  };
  destroy(): void {
    window.removeEventListener('keydown', this.onKey);
    this.canvas.removeEventListener('pointerdown', this.onFocus); this.canvas.removeEventListener('pointermove', this.onPointer); this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
