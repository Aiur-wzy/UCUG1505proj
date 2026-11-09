import defaults from '../../shared/defaults.json';
import type { CommandResult, CommandType, ControlCommand, ControlContext, InteractionFeedback, MotionHost, Phase, PlayerId } from '../../shared/contract';
const allowed: Record<Phase, CommandType[]> = { inactive: [], select: ['SELECT_BALL'], adjust: ['PREVIEW_SHOT', 'ARM_SHOT', 'CANCEL_SHOT'], armed: ['FIRE', 'CANCEL_SHOT'], resolving: [] };
/** Standalone diagnostic host. No Phaser, physics, game score or camera implementation. */
export class MockHost implements MotionHost {
  feedback: InteractionFeedback | null = null;
  readonly commands: { command: ControlCommand; receipt: CommandResult }[] = [];
  private sequence = 0;
  private armedAt = 0;
  private context: ControlContext = {
    protocolVersion: '1.1', sessionId: crypto.randomUUID(), contextId: 1, turnId: 1,
    scene: 'calibration', phase: 'inactive', activePlayerId: 'A', previewSource: 'motion',
    inputEnabled: false, motionEnabled: false, allowedCommands: [],
    motionActionsEnabled: ['SELECT_BALL', 'PREVIEW_SHOT'],
    ballOptions: [{ id: 'normal', label: '普通', remaining: 1 }, { id: 'repel', label: '排斥', remaining: 1 }, { id: 'attract', label: '吸引', remaining: 1 }, { id: 'sticky', label: '粘黏', remaining: 1 }],
    selectedBallId: null, previewShot: null, lockedShot: null, limits: { ...defaults.shotLimits, powerMin01: 0, powerMax01: 1 },
  };
  constructor(readonly cameraMount: HTMLElement, private changed: (context: ControlContext) => void) {}
  now(): number { return performance.now(); }
  getContext(): ControlContext { return structuredClone(this.context); }
  private publish(): void {
    const c = this.context; c.contextId++;
    c.inputEnabled = c.scene === 'play' && c.phase !== 'resolving';
    c.allowedCommands = c.inputEnabled ? [...allowed[c.phase]] : [];
    this.changed(this.getContext());
  }
  play(): void { this.context.scene = 'play'; this.context.phase = 'select'; this.publish(); }
  player(player: PlayerId): void { this.context.activePlayerId = player; this.context.turnId++; this.context.phase = 'select'; this.context.selectedBallId = null; this.context.previewShot = null; this.context.lockedShot = null; this.context.motionEnabled = false; this.feedback = null; this.publish(); }
  source(): void { this.context.previewSource = this.context.previewSource === 'motion' ? 'keyboard' : 'motion'; this.context.motionEnabled = false; if (this.context.phase === 'armed') { this.context.phase = 'adjust'; this.context.lockedShot = null; } this.publish(); }
  next(): void { this.player(this.context.activePlayerId ?? 'A'); }
  report(feedback: InteractionFeedback): void {
    const c = this.context;
    if (feedback.contextId !== c.contextId || feedback.sessionId !== c.sessionId || feedback.playerId !== c.activePlayerId) return;
    this.feedback = feedback;
    const ready = c.previewSource === 'motion' && feedback.tracking === 'ready' && feedback.validPair && feedback.calibrated && feedback.rearmed;
    if (ready === c.motionEnabled) return;
    if (!ready && c.phase === 'armed') { c.phase = 'adjust'; c.lockedShot = null; }
    c.motionEnabled = ready; this.publish();
  }
  tick(): void {
    const c = this.context;
    if (c.motionEnabled && this.feedback && this.now() - this.feedback.atMs > defaults.transport.maxFeedbackAgeMs) {
      c.motionEnabled = false; if (c.phase === 'armed') { c.phase = 'adjust'; c.lockedShot = null; } this.publish();
    }
    if (c.phase === 'armed' && this.now() - this.armedAt >= defaults.gesture.armedTimeoutMs) { c.phase = 'adjust'; c.lockedShot = null; this.publish(); }
  }
  keyboard(type: CommandType, ballTypeId = 'normal'): CommandResult {
    const c = this.context;
    return this.submit({ protocolVersion: '1.1', sessionId: c.sessionId, contextId: c.contextId,
      commandId: `lab-keyboard-${++this.sequence}`, source: 'keyboard', atMs: this.now(), type,
      payload: type === 'SELECT_BALL' ? { ballTypeId } : {} } as ControlCommand);
  }
  submit(command: ControlCommand): CommandResult {
    const c = this.context;
    let reason: CommandResult['reason'] = command.sessionId !== c.sessionId ? 'SESSION_MISMATCH' : command.contextId !== c.contextId ? 'STALE_CONTEXT' : !c.inputEnabled ? 'INPUT_DISABLED' : !c.allowedCommands.includes(command.type) ? 'WRONG_PHASE' : 'OK';
    if (reason === 'OK' && command.source === 'motion') {
      if (c.previewSource !== 'motion') reason = 'INACTIVE_SOURCE';
      else if (!c.motionEnabled) reason = 'TRACKING_UNREADY';
      else if (!c.motionActionsEnabled.includes(command.type)) reason = 'ACTION_DISABLED';
    }
    if (reason === 'OK' && command.type === 'SELECT_BALL' && !c.ballOptions.some(b => b.id === command.payload.ballTypeId && b.remaining > 0)) reason = 'OUT_OF_STOCK';
    if (reason === 'OK') {
      switch (command.type) {
        case 'SELECT_BALL': c.selectedBallId = command.payload.ballTypeId; c.previewShot = { aimDeg: 0, power01: 0 }; c.phase = 'adjust'; this.publish(); break;
        case 'PREVIEW_SHOT': c.previewShot = { ...command.payload }; break;
        case 'ARM_SHOT': c.lockedShot = c.previewShot ? { ...c.previewShot } : null; c.phase = 'armed'; this.armedAt = this.now(); this.publish(); break;
        case 'FIRE': c.phase = 'resolving'; c.ballOptions.find(b => b.id === c.selectedBallId)!.remaining--; c.lockedShot = null; this.publish(); break;
        case 'CANCEL_SHOT': if (c.phase === 'armed') c.phase = 'adjust'; else { c.phase = 'select'; c.selectedBallId = null; c.previewShot = null; } c.lockedShot = null; this.publish(); break;
      }
    }
    const receipt: CommandResult = { commandId: command.commandId, accepted: reason === 'OK', reason, duplicate: false, contextId: c.contextId, phase: c.phase };
    this.commands.push({ command: structuredClone(command), receipt }); if (this.commands.length > 200) this.commands.shift();
    return receipt;
  }
}
