import defaults from '../shared/defaults.json';
import type { CommandResult, CommandType, ControlCommand, ControlContext, InputSource, InteractionFeedback, MotionHost, Phase, PlayerId, ResultReason } from '../shared/contract';
import { ballDefinitions, isBallType } from '../game/config/ballDefinitions';
import { levels } from '../game/config/levels';
import type { BallSnapshot, GameState, Mode, PhysicsPort, ShotRequest } from '../game/core/gameState';
import { initialInventories, matchResult, nextPlayer, totalShots } from '../game/core/modeRules';
import { otherPlayer } from '../game/core/duelMode';
import { findLaunchOrigin } from '../game/physics/shotMath';

const allowed: Record<Phase, CommandType[]> = {
  inactive: [], select: ['SELECT_BALL'], adjust: ['PREVIEW_SHOT', 'ARM_SHOT', 'CANCEL_SHOT'],
  armed: ['FIRE', 'CANCEL_SHOT'], resolving: [],
};
const commandTypes = new Set(Object.values(allowed).flat());
const clone = <T>(value: T): T => structuredClone(value);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
// Property order must not change the meaning of an otherwise identical retry.
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${fingerprint(value[key])}`).join(',')}}`;
  return typeof value === 'number' && !Number.isFinite(value) ? String(value) : JSON.stringify(value) ?? 'undefined';
}
export interface HostOptions {
  cameraMount: HTMLElement;
  physics: PhysicsPort;
  now?: () => number;
  sessionId?: () => string;
}
export type CommandPayloads = { [Command in ControlCommand as Command['type']]: Command['payload'] };
export class InputHost implements MotionHost {
  readonly cameraMount: HTMLElement;
  private state: GameState;
  private clock: () => number;
  private makeSession: () => string;
  private physics: PhysicsPort;
  private listeners = new Set<(state: GameState) => void>();
  private contextListeners = new Set<(context: ControlContext) => void>();
  private cache = new Map<string, { signature: string; result: CommandResult }>();
  private failedCommands = new Map<string, { signature: string; error: Error }>();
  private sequence = 0;
  private shotSequence = 0;
  private lastPreviewAt = -Infinity;
  private previewContext = -1;
  private armedAt = 0;
  private publishing = false;
  private disposed = false;

  constructor(options: HostOptions) {
    this.cameraMount = options.cameraMount;
    this.clock = options.now ?? (() => performance.now());
    this.makeSession = options.sessionId ?? (() => crypto.randomUUID());
    this.physics = options.physics;
    this.state = {
      context: { protocolVersion: '1.1', sessionId: this.makeSession(), contextId: 0, turnId: 1,
        scene: 'menu', phase: 'inactive', activePlayerId: null, previewSource: 'keyboard', inputEnabled: false, motionEnabled: false,
        allowedCommands: [], motionActionsEnabled: defaults.defaultMotionActionsEnabled as CommandType[], ballOptions: [], selectedBallId: null,
        previewShot: null, lockedShot: null, limits: { aimMinDeg: -50, aimMaxDeg: 50, powerMin01: 0, powerMax01: 1 } },
      mode: 'solo', levelIndex: 0, firstPlayer: 'A', inventories: initialInventories(), origin: null,
      balls: [], currentShotId: null, shotsTaken: 0, paused: false, result: null, feedback: null, diagnostic: null,
    };
  }
  now(): number { return this.clock(); }
  getContext(): ControlContext { return clone(this.state.context); }
  getSnapshot(): GameState { return clone(this.state); }
  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener);
  }
  onContext(listener: (context: ControlContext) => void): () => void {
    this.contextListeners.add(listener);
    this.publishing = true;
    try { listener(this.getContext()); }
    catch (error) { this.contextListeners.delete(listener); throw error; }
    finally { this.publishing = false; }
    return () => this.contextListeners.delete(listener);
  }
  private publish(changedContext = true): void {
    const context = this.state.context;
    if (changedContext) {
      context.contextId++;
      this.lastPreviewAt = -Infinity; this.previewContext = -1;
    }
    context.inputEnabled = !this.disposed && context.scene === 'play' && !this.state.paused && context.phase !== 'resolving' && this.state.origin !== null;
    context.allowedCommands = context.inputEnabled ? [...allowed[context.phase]] : [];
    context.ballOptions = context.activePlayerId ? ballDefinitions.map(ball => ({ id: ball.id, label: ball.label, remaining: this.state.inventories[context.activePlayerId!][ball.id] })) : [];
    this.publishing = true;
    try {
      if (changedContext) for (const listener of this.contextListeners) {
        try { listener(this.getContext()); } catch (error) { console.error('Motion setContext failed', error); }
      }
      for (const listener of this.listeners) {
        try { listener(this.getSnapshot()); } catch (error) { console.error('Game view failed', error); }
      }
    } finally { this.publishing = false; }
  }
  start(mode: Mode, levelIndex = 0, source: InputSource = 'keyboard', firstPlayer: PlayerId = 'A'): void {
    if (this.disposed) return;
    this.physics.reset(); this.physics.setPaused(false);
    this.cache.clear(); this.failedCommands.clear(); this.shotSequence = 0;
    this.state.mode = mode; this.state.levelIndex = Math.max(0, Math.min(levels.length - 1, levelIndex));
    this.state.firstPlayer = mode === 'solo' ? 'A' : firstPlayer;
    this.state.inventories = initialInventories(); this.state.balls = []; this.state.shotsTaken = 0;
    this.state.result = null; this.state.currentShotId = null; this.state.paused = false; this.state.diagnostic = null;
    Object.assign(this.state.context, { sessionId: this.makeSession(), contextId: 0, turnId: 1, scene: 'play', phase: 'select',
      activePlayerId: this.state.firstPlayer, previewSource: source, selectedBallId: null, previewShot: null, lockedShot: null });
    this.clearTracking(); this.chooseOrigin(); this.publish();
  }
  retry(): void {
    this.start(this.state.mode, this.state.levelIndex, this.state.context.previewSource,
      this.state.mode === 'duel' && this.state.result ? otherPlayer(this.state.firstPlayer) : this.state.firstPlayer);
  }
  nextLevel(): boolean {
    if (this.state.mode !== 'solo' || !this.state.result?.passed || this.state.levelIndex >= levels.length - 1) return false;
    this.start('solo', this.state.levelIndex + 1, this.state.context.previewSource); return true;
  }
  menu(): void {
    this.physics.reset(); this.physics.setPaused(false); this.cache.clear(); this.failedCommands.clear();
    this.state.paused = false; this.state.balls = []; this.state.result = null; this.state.currentShotId = null; this.state.diagnostic = null;
    Object.assign(this.state.context, { sessionId: this.makeSession(), scene: 'menu', phase: 'inactive', activePlayerId: null, lockedShot: null, previewShot: null, selectedBallId: null });
    this.clearTracking(); this.publish();
  }
  setCalibrating(value: boolean): void {
    if (this.state.context.phase === 'resolving') return;
    this.state.context.scene = value ? 'calibration' : 'play';
    this.state.context.phase = value ? 'inactive' : this.state.context.selectedBallId ? 'adjust' : 'select';
    this.state.context.lockedShot = null; this.clearTracking(); this.publish();
  }
  setPaused(paused: boolean): void {
    if (this.state.context.scene !== 'play' || this.state.paused === paused) return;
    this.state.paused = paused; this.physics.setPaused(paused);
    if (this.state.context.phase === 'armed') { this.state.context.phase = 'adjust'; this.state.context.lockedShot = null; }
    this.clearTracking(); this.publish();
  }
  setPreviewSource(source: InputSource): boolean {
    if (this.state.context.phase === 'resolving') return false;
    if (this.state.context.previewSource === source) return true;
    this.state.context.previewSource = source;
    if (this.state.context.phase === 'armed') { this.state.context.phase = 'adjust'; this.state.context.lockedShot = null; }
    this.clearTracking(); this.publish(); return true;
  }
  setMotionActions(actions: CommandType[]): void {
    const next = [...new Set(actions.filter(action => commandTypes.has(action)))];
    if (fingerprint(next) === fingerprint(this.state.context.motionActionsEnabled)) return;
    this.state.context.motionActionsEnabled = next; this.publish();
  }
  private clearTracking(): void { this.state.feedback = null; this.state.context.motionEnabled = false; }
  private chooseOrigin(): void {
    this.state.origin = findLaunchOrigin(this.state.balls);
    if (!this.state.origin) this.state.diagnostic = '发射线已被占满，请重试本局。';
  }
  diagnostic(message: string): void { this.state.diagnostic = message; this.publish(false); }
  completeShot(sessionId: string, shotId: string, balls: BallSnapshot[]): boolean {
    if (this.disposed || this.state.paused || this.state.context.sessionId !== sessionId || this.state.context.phase !== 'resolving' || this.state.currentShotId !== shotId) return false;
    this.state.balls = clone(balls); this.state.currentShotId = null;
    this.state.context.selectedBallId = null; this.state.context.previewShot = null;
    this.clearTracking();
    if (this.state.shotsTaken >= totalShots(this.state.mode)) {
      this.state.result = matchResult(this.state.mode, balls, this.state.levelIndex);
      this.state.context.scene = 'result'; this.state.context.phase = 'inactive';
    } else {
      this.state.context.turnId++;
      this.state.context.activePlayerId = nextPlayer(this.state.mode, this.state.context.activePlayerId!);
      this.state.context.phase = 'select'; this.chooseOrigin();
    }
    this.publish(); return true;
  }
  private fresh(atMs: number, limit: number): boolean { const age = this.now() - atMs; return age <= limit && age >= -defaults.transport.futureToleranceMs; }
  private trackingReady(): boolean {
    const feedback = this.state.feedback;
    return this.state.context.previewSource === 'motion' && !this.state.paused && !!feedback &&
      this.fresh(feedback.atMs, defaults.transport.maxFeedbackAgeMs) && feedback.tracking === 'ready' &&
      feedback.validPair && feedback.calibrated && feedback.rearmed;
  }
  private updateMotionGate(): boolean {
    const enabled = this.trackingReady(), wasEnabled = this.state.context.motionEnabled;
    if (enabled === wasEnabled) return false;
    this.state.context.motionEnabled = enabled;
    if (wasEnabled && !enabled && this.state.context.phase === 'armed') {
      this.state.context.phase = 'adjust'; this.state.context.lockedShot = null;
    }
    return true;
  }
  report(feedback: InteractionFeedback): void {
    if (this.disposed || this.publishing || !record(feedback)) return;
    const c = this.state.context;
    if (feedback.protocolVersion !== '1.1' || feedback.sessionId !== c.sessionId || feedback.contextId !== c.contextId || feedback.playerId !== c.activePlayerId || feedback.source !== 'motion' || c.previewSource !== 'motion') return;
    if (!finite(feedback.atMs) || !this.fresh(feedback.atMs, defaults.transport.maxFeedbackAgeMs) || (this.state.feedback && feedback.atMs < this.state.feedback.atMs)) return;
    if (![feedback.validPair, feedback.calibrated, feedback.rearmed].every(value => typeof value === 'boolean') || !finite(feedback.holdProgress01) || feedback.holdProgress01 < 0 || feedback.holdProgress01 > 1) return;
    this.state.feedback = clone(feedback);
    this.publish(this.updateMotionGate());
  }
  tick(): void {
    if (this.disposed) return;
    let changed = this.updateMotionGate();
    if (this.state.context.phase === 'armed' && this.now() - this.armedAt >= defaults.gesture.armedTimeoutMs) {
      this.state.context.phase = 'adjust'; this.state.context.lockedShot = null; changed = true;
    }
    if (changed) this.publish();
  }
  command<T extends CommandType>(type: T, payload: CommandPayloads[T], source: InputSource = 'keyboard'): ControlCommand {
    const c = this.state.context;
    return { protocolVersion: '1.1', sessionId: c.sessionId, contextId: c.contextId,
      commandId: `${source}-${c.sessionId}-${++this.sequence}`, source, atMs: this.now(), type, payload } as ControlCommand;
  }
  submit(command: ControlCommand): CommandResult {
    if (this.publishing) throw new Error('Do not submit recursively from a state/context notification. Wait for a new input sample.');
    const raw: unknown = command;
    const receipt = (reason: ResultReason, shotId?: string): CommandResult => ({
      commandId: record(raw) && typeof raw.commandId === 'string' ? raw.commandId : '', accepted: reason === 'OK', reason,
      duplicate: false, contextId: this.state.context.contextId, phase: this.state.context.phase, ...(shotId ? { shotId } : {}),
    });
    if (!record(raw)) return receipt('INVALID_PAYLOAD');
    if (raw.protocolVersion !== '1.1') return receipt('VERSION_MISMATCH');
    if (typeof raw.sessionId !== 'string' || typeof raw.commandId !== 'string' || !raw.commandId || !Number.isSafeInteger(raw.contextId) || !finite(raw.atMs) || !commandTypes.has(raw.type as CommandType) || !['keyboard', 'motion'].includes(raw.source as string) || !record(raw.payload)) return receipt('INVALID_PAYLOAD');
    if (command.sessionId !== this.state.context.sessionId) return receipt('SESSION_MISMATCH');
    const signature = fingerprint(command), cached = this.cache.get(command.commandId), failed = this.failedCommands.get(command.commandId);
    if (cached) return signature === cached.signature ? { ...cached.result, duplicate: true } : receipt('ID_REUSE');
    if (failed) { if (signature !== failed.signature) return receipt('ID_REUSE'); throw failed.error; }
    const finish = (reason: ResultReason, shotId?: string) => {
      const result = receipt(reason, shotId);
      if (command.type !== 'PREVIEW_SHOT') this.cache.set(command.commandId, { signature, result: { ...result } });
      return result;
    };
    this.tick();
    const c = this.state.context;
    if (command.contextId !== c.contextId) return finish('STALE_CONTEXT');
    if ((command.type === 'PREVIEW_SHOT' && command.source !== c.previewSource) || (command.source === 'motion' && c.previewSource !== 'motion')) return finish('INACTIVE_SOURCE');
    if (command.source === 'motion' && !c.motionActionsEnabled.includes(command.type)) return finish('ACTION_DISABLED');
    if (!c.inputEnabled || this.disposed) return finish('INPUT_DISABLED');
    if (command.source === 'motion' && (!c.motionEnabled || this.state.feedback?.contextId !== c.contextId || !this.trackingReady())) return finish('TRACKING_UNREADY');
    if (!allowed[c.phase].includes(command.type)) return finish('WRONG_PHASE');
    if (!this.fresh(command.atMs, defaults.transport.maxSampleAgeMs)) return finish('STALE_INPUT');
    const payload = command.payload;
    if (command.type === 'PREVIEW_SHOT') {
      if (Object.keys(payload).length !== 2 || !finite(command.payload.aimDeg) || !finite(command.payload.power01) || command.payload.aimDeg < -50 || command.payload.aimDeg > 50 || command.payload.power01 < 0 || command.payload.power01 > 1) return finish('INVALID_PAYLOAD');
      if (command.atMs <= this.lastPreviewAt) return finish('STALE_INPUT');
      c.previewShot = { ...command.payload }; this.lastPreviewAt = command.atMs; this.previewContext = c.contextId;
      this.publish(false); return finish('OK');
    }
    if (command.type === 'SELECT_BALL') {
      if (Object.keys(payload).length !== 1 || typeof command.payload.ballTypeId !== 'string' || !isBallType(command.payload.ballTypeId)) return finish('INVALID_PAYLOAD');
      if (this.state.inventories[c.activePlayerId!][command.payload.ballTypeId] <= 0) return finish('OUT_OF_STOCK');
      c.selectedBallId = command.payload.ballTypeId; c.previewShot ??= { aimDeg: 0, power01: 0.58 }; c.phase = 'adjust';
    } else {
      if (Object.keys(payload).length !== 0) return finish('INVALID_PAYLOAD');
      if (command.type === 'ARM_SHOT') {
        if (!c.previewShot || (command.source === 'motion' && (this.previewContext !== c.contextId || !this.fresh(this.lastPreviewAt, defaults.transport.maxSampleAgeMs)))) return finish('PREVIEW_UNREADY');
        c.lockedShot = { ...c.previewShot }; c.phase = 'armed'; this.armedAt = this.now();
      } else if (command.type === 'CANCEL_SHOT') {
        if (c.phase === 'armed') c.phase = 'adjust';
        else { c.phase = 'select'; c.selectedBallId = null; }
        c.lockedShot = null;
      } else if (command.type === 'FIRE') {
        if (!c.lockedShot || !c.selectedBallId || !isBallType(c.selectedBallId) || !this.state.origin) return finish('PREVIEW_UNREADY');
        if (this.state.inventories[c.activePlayerId!][c.selectedBallId] <= 0) return finish('OUT_OF_STOCK');
        const shotId = `${c.sessionId}-shot-${++this.shotSequence}`;
        const shot: ShotRequest = { ...c.lockedShot, shotId, sessionId: c.sessionId, ownerId: c.activePlayerId!, typeId: c.selectedBallId, origin: { ...this.state.origin } };
        try { this.physics.spawn(shot); }
        catch (cause) {
          this.physics.rollback(shotId);
          const error = cause instanceof Error ? cause : new Error(String(cause));
          this.failedCommands.set(command.commandId, { signature, error });
          this.diagnostic('这次投掷未能创建，请重试本局。库存未扣除。');
          throw error;
        }
        this.state.inventories[c.activePlayerId!][c.selectedBallId]--;
        this.state.shotsTaken++; this.state.currentShotId = shotId; c.lockedShot = null; c.phase = 'resolving';
        this.publish(); return finish('OK', shotId);
      }
    }
    this.publish(); return finish('OK');
  }
  destroy(): void {
    this.disposed = true; this.physics.reset(); this.cache.clear(); this.failedCommands.clear();
    this.contextListeners.clear(); this.listeners.clear(); this.clearTracking();
  }
}
