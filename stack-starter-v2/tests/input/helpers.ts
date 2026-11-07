import type { CommandType, InteractionFeedback, InputSource, Phase } from '../../src/shared/contract';
import type { BallSnapshot, PhysicsPort, ShotRequest } from '../../src/game/core/gameState';
import { InputHost } from '../../src/input/inputHost';
import type { CommandPayloads } from '../../src/input/inputHost';

export function harness(source: InputSource = 'keyboard') {
  let time = 1000, sessions = 0;
  const shots: ShotRequest[] = [], rolledBack: string[] = [];
  let failSpawn = false, paused = false;
  const physics: PhysicsPort = {
    spawn(shot) { shots.push(structuredClone(shot)); if (failSpawn) throw new Error('simulated partial spawn'); },
    rollback(id) { rolledBack.push(id); const index = shots.findIndex(shot => shot.shotId === id); if (index >= 0) shots.splice(index, 1); },
    reset() { shots.length = 0; }, setPaused(value) { paused = value; },
  };
  const host = new InputHost({ cameraMount: {} as HTMLElement, physics, now: () => time, sessionId: () => `test-${++sessions}` });
  host.start('solo', 0, source);
  const report = (patch: Partial<InteractionFeedback> = {}) => {
    const c = host.getContext();
    host.report({ protocolVersion: '1.1', sessionId: c.sessionId, contextId: c.contextId, source: 'motion', atMs: time, playerId: c.activePlayerId,
      tracking: 'ready', validPair: true, calibrated: true, rearmed: true, reason: 'NONE', holdProgress01: 0, focusedBallId: null, ...patch });
  };
  const ready = () => { report(); report(); };
  const send = <T extends CommandType>(type: T, payload: CommandPayloads[T], from: InputSource = 'keyboard') => {
    time += 1;
    if (from === 'motion') ready();
    return host.submit(host.command<T>(type, payload, from));
  };
  const finish = (balls: BallSnapshot[] = []) => { const c = host.getContext(); return host.completeShot(c.sessionId, host.getSnapshot().currentShotId!, balls); };
  const toPhase = (phase: Phase) => {
    if (phase === 'select') return;
    send('SELECT_BALL', { ballTypeId: 'normal' }); send('PREVIEW_SHOT', { aimDeg: 12, power01: 0.6 }, source);
    if (phase === 'adjust') return;
    send('ARM_SHOT', {});
    if (phase === 'armed') return;
    send('FIRE', {});
  };
  return { host, shots, rolledBack, report, ready, send, finish, toPhase, now: () => time,
    setTime: (value: number) => { time = value; }, advance: (value: number) => { time += value; host.tick(); },
    fail: () => { failSpawn = true; }, isPaused: () => paused };
}
