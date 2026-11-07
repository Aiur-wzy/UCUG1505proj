import defaults from '../../shared/defaults.json';
import type { InteractionFeedback } from '../../shared/contract';
import type { InputHost } from '../../input/inputHost';
import type { KeyboardInput } from '../../input/keyboard';
import type { PlayScene } from '../scenes/PlayScene';
import type { PhysicsWorld } from '../physics/physicsWorld';

declare global { interface Window { __flockDebug?: { host: InputHost; world: PhysicsWorld; input: KeyboardInput; stepFrames(count: number): void; inspect(): unknown } } }
export function installDebug(host: InputHost, scene: PlayScene, input: KeyboardInput, root: HTMLElement, signal: AbortSignal): void {
  let feedbackMode: 'ready' | 'lost' | 'silent' = 'silent';
  let lastFire: ReturnType<InputHost['command']> | null = null;
  const log = root.querySelector<HTMLElement>('#debug-state')!;
  const report = () => {
    if (feedbackMode === 'silent') return;
    const c = host.getContext();
    const feedback: InteractionFeedback = { protocolVersion: '1.1', sessionId: c.sessionId, contextId: c.contextId, source: 'motion', atMs: host.now(), playerId: c.activePlayerId,
      tracking: feedbackMode, validPair: feedbackMode === 'ready', calibrated: true, rearmed: feedbackMode === 'ready', reason: feedbackMode === 'ready' ? 'NONE' : 'COLOR_MISSING', holdProgress01: 0, focusedBallId: null };
    host.report(feedback); host.report({ ...feedback, contextId: host.getContext().contextId });
  };
  const interval = setInterval(() => { report(); log.textContent = JSON.stringify({ context: host.getContext(), effects: scene.world.balls.map(ball => ({ id: ball.id, phase: ball.effect.phase, activations: ball.effect.activations, inPlay: ball.inPlay })) }, null, 2); }, 100);
  root.addEventListener('click', event => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-debug]')?.dataset.debug;
    if (action === 'ready') { host.setPreviewSource('motion'); feedbackMode = 'ready'; report(); }
    if (action === 'lost') { feedbackMode = 'lost'; report(); }
    if (action === 'silent') feedbackMode = 'silent';
    if (action === 'select') { report(); host.submit(host.command('SELECT_BALL', { ballTypeId: 'normal' }, 'motion')); }
    if (action === 'preview') { report(); host.submit(host.command('PREVIEW_SHOT', { aimDeg: 12, power01: 0.6 }, 'motion')); }
    if (action === 'replay' && lastFire) host.submit(lastFire);
    if (action) input.focus();
  }, { signal });
  const originalSubmit = host.submit.bind(host);
  host.submit = command => { const result = originalSubmit(command); if (command.type === 'FIRE' && result.accepted && !result.duplicate) lastFire = structuredClone(command); return result; };
  window.__flockDebug = { host, world: scene.world, input,
    stepFrames(count) { for (let i = 0; i < Math.min(3600, Math.max(0, count)); i++) scene.world.update(defaults.physics.stepMs); },
    inspect: () => ({ state: host.getSnapshot(), balls: scene.world.snapshot(), effects: scene.world.balls.map(ball => ({ id: ball.id, ...ball.effect, sticky: ball.sticky })), fps: scene.game.loop.actualFps }),
  };
  signal.addEventListener('abort', () => clearInterval(interval), { once: true });
}
