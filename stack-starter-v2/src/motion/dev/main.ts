import { GloveController } from '../controller';
import { MockHost } from './mockHost';
import type { CommandType } from '../../shared/contract';
import type { SyntheticSettings } from './synthetic';
import './page.css';

const mount = document.querySelector<HTMLElement>('#motion-mount')!;
const output = document.querySelector<HTMLElement>('#lab-state')!;
const notice = document.querySelector<HTMLElement>('#lab-notice')!;
const vector = document.querySelector<HTMLCanvasElement>('#lab-vector')!;
let controller: GloveController, host: MockHost;
let generation = 0;
const abort = new AbortController();
async function begin(): Promise<void> {
  controller?.stop(); const current = ++generation;
  controller = new GloveController();
  host = new MockHost(mount, context => controller.setContext(context));
  controller.setContext(host.getContext()); notice.textContent = '选择模拟画面或摄像头，然后按步骤校准。';
  try {
    await controller.start(host);
    const players = document.querySelector<HTMLInputElement>('#calibrate-b')!.checked ? ['A', 'B'] as const : ['A'] as const;
    for (const player of players) {
      const result = await controller.calibrate(player);
      if (current !== generation) return;
      if (!result.ok) throw new Error(result.reason ?? '校准取消');
    }
    host.play(); notice.textContent = '已进入合同调试。这里显示输入与回执，不模拟游戏物理。';
  } catch (error) { if (current === generation) notice.textContent = `${String(error)}。点击“重开输入会话”重试。`; }
}
document.querySelector('#restart-lab')!.addEventListener('click', () => { void begin(); }, { signal: abort.signal });
document.querySelectorAll<HTMLElement>('[data-command]').forEach(button => button.addEventListener('click', () => { host.keyboard(button.dataset.command as CommandType); (document.activeElement as HTMLElement)?.blur(); }, { signal: abort.signal }));
document.querySelector('#next-turn')!.addEventListener('click', () => host.next(), { signal: abort.signal });
document.querySelector('#switch-player')!.addEventListener('click', () => host.player(host.getContext().activePlayerId === 'A' ? 'B' : 'A'), { signal: abort.signal });
document.querySelector('#switch-source')!.addEventListener('click', () => host.source(), { signal: abort.signal });
window.addEventListener('keydown', event => {
  if ((event.target as HTMLElement)?.closest('input,select,textarea,button,a') || event.repeat) return;
  const keys: Record<string, CommandType> = { Enter: 'ARM_SHOT', ' ': 'FIRE', Escape: 'CANCEL_SHOT' };
  if (keys[event.key]) { event.preventDefault(); host.keyboard(keys[event.key]); }
}, { signal: abort.signal });
const timer = setInterval(() => {
  if (!host) return; host.tick();
  const c = host.getContext(), d = controller.diagnostics;
  output.textContent = JSON.stringify({ phase: c.phase, player: c.activePlayerId, source: c.previewSource, motionEnabled: c.motionEnabled,
    contextId: c.contextId, selectedBallId: c.selectedBallId, preview: c.previewShot, locked: c.lockedShot,
    feedback: d.feedback, stats: controller.visionStats, lastCommand: host.commands.at(-1) }, null, 2);
  const ctx = vector.getContext('2d')!; ctx.clearRect(0, 0, 300, 230);
  ctx.fillStyle = '#e2eadb'; ctx.fillRect(0, 0, 300, 230);
  ctx.strokeStyle = '#bfd0bc'; ctx.lineWidth = 1;
  for (let i = 0; i < 300; i += 25) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 230); ctx.stroke(); }
  const shot = c.lockedShot ?? c.previewShot ?? d.observation;
  if (shot) {
    const rad = shot.aimDeg * Math.PI / 180, length = 45 + shot.power01 * 125;
    const x = 150 + Math.sin(rad) * length, y = 200 - Math.cos(rad) * length;
    ctx.strokeStyle = c.lockedShot ? '#bb763e' : '#2e6753'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(150, 200); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - Math.sin(rad - 0.45) * 18, y + Math.cos(rad - 0.45) * 18); ctx.lineTo(x, y); ctx.lineTo(x - Math.sin(rad + 0.45) * 18, y + Math.cos(rad + 0.45) * 18); ctx.stroke();
  }
}, 100);
declare global { interface Window { __motionLab: {
  inspect(): { context: ReturnType<MockHost['getContext']>; diagnostics: GloveController['diagnostics']; stats: GloveController['visionStats']; commands: MockHost['commands'] };
  setSynthetic(settings: Partial<SyntheticSettings>): void;
  stop(): void;
} } }
window.__motionLab = {
  inspect: () => structuredClone({ context: host.getContext(), diagnostics: controller.diagnostics, stats: controller.visionStats, commands: host.commands }),
  setSynthetic: settings => { controller.simulator?.set(settings); }, stop: () => controller.stop(),
};
void begin();
const dispose = () => { generation++; controller?.stop(); abort.abort(); clearInterval(timer); delete (window as Partial<Window>).__motionLab; };
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
