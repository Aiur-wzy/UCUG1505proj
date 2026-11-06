/** Flock and Flick input contract 1.1. Definitions only; no game implementation. */
export type ProtocolVersion = '1.1';
export type PlayerId = 'A' | 'B';
export type InputSource = 'keyboard' | 'motion';
export type Scene = 'menu' | 'calibration' | 'play' | 'result';
export type Phase = 'inactive' | 'select' | 'adjust' | 'armed' | 'resolving';
export type CommandType = 'SELECT_BALL' | 'PREVIEW_SHOT' | 'ARM_SHOT' | 'FIRE' | 'CANCEL_SHOT';

export interface ShotValues {
  /** Degrees, 0 = up the field; positive = clockwise/right. Default range [-50, 50]. */
  aimDeg: number;
  /** Dimensionless [0, 1]. Converted to launch speed by the game, not the input module. */
  power01: number;
}
export interface BallOption {
  id: string;
  label: string;
  remaining: number;
}
export interface ControlContext {
  protocolVersion: ProtocolVersion;
  sessionId: string;
  /** Increment on phase, player, source, inventory/option or input-gate changes. */
  contextId: number;
  turnId: number;
  scene: Scene;
  phase: Phase;
  activePlayerId: PlayerId | null;
  /** Exclusive owner of continuous previews. Keyboard discrete commands remain available. */
  previewSource: InputSource;
  /** Game availability, independent of tracking quality. */
  inputEnabled: boolean;
  /** Gate for motion commands only. */
  motionEnabled: boolean;
  allowedCommands: CommandType[];
  /** Motion feature switches; keyboard equivalents are always retained. */
  motionActionsEnabled: CommandType[];
  ballOptions: BallOption[];
  selectedBallId: string | null;
  /** Current visible preview. ARM_SHOT snapshots this value in the game. */
  previewShot: ShotValues | null;
  /** Non-null exactly while phase is armed; held authoritatively by the game. */
  lockedShot: ShotValues | null;
  limits: { aimMinDeg: number; aimMaxDeg: number; powerMin01: 0; powerMax01: 1 };
}
interface CommandEnvelope {
  protocolVersion: ProtocolVersion;
  sessionId: string;
  contextId: number;
  commandId: string;
  source: InputSource;
  /** Monotonic milliseconds from host.now(), at the newest contributing sample. */
  atMs: number;
}
export type ControlCommand = CommandEnvelope & (
  | { type: 'SELECT_BALL'; payload: { ballTypeId: string } }
  | { type: 'PREVIEW_SHOT'; payload: ShotValues }
  | { type: 'ARM_SHOT'; payload: Record<string, never> }
  | { type: 'FIRE'; payload: Record<string, never> }
  | { type: 'CANCEL_SHOT'; payload: Record<string, never> }
);
export type ResultReason = 'OK' | 'VERSION_MISMATCH' | 'SESSION_MISMATCH'
  | 'STALE_CONTEXT' | 'INACTIVE_SOURCE' | 'INPUT_DISABLED' | 'WRONG_PHASE'
  | 'INVALID_PAYLOAD' | 'STALE_INPUT' | 'OUT_OF_STOCK' | 'TRACKING_UNREADY'
  | 'PREVIEW_UNREADY' | 'ACTION_DISABLED' | 'ID_REUSE';
export interface CommandResult {
  commandId: string;
  accepted: boolean;
  reason: ResultReason;
  duplicate: boolean;
  /** Resulting context at original processing time; setContext remains authoritative. */
  contextId: number;
  phase: Phase;
  shotId?: string;
}
export type TrackingState = 'starting' | 'calibrating' | 'ready' | 'lost' | 'error' | 'stopped';
export type FeedbackReason = 'NONE' | 'CAMERA_DENIED' | 'CAMERA_MISSING'
  | 'COLOR_MISSING' | 'AMBIGUOUS_BLOBS' | 'PAIR_TOO_CLOSE'
  | 'POSITION_JUMP' | 'CALIBRATION_REQUIRED' | 'PROFILE_MISMATCH'
  | 'VISION_INIT_FAILED' | 'WORKER_FAILED' | 'FRAME_TIMEOUT';
export interface InteractionFeedback {
  protocolVersion: ProtocolVersion;
  sessionId: string;
  contextId: number;
  source: 'motion';
  atMs: number;
  playerId: PlayerId | null;
  tracking: TrackingState;
  validPair: boolean;
  calibrated: boolean;
  /** Neutral pose completed for this session, turn, player and source. Latched until invalidated. */
  rearmed: boolean;
  reason: FeedbackReason;
  /** [0,1], display only; never authorizes a shot. */
  holdProgress01: number;
  focusedBallId: string | null;
}
export interface CalibrationResult {
  playerId: PlayerId;
  ok: boolean;
  profileVersion: number;
  reason: string | null;
}
export interface MotionHost {
  now(): number;
  getContext(): ControlContext;
  submit(command: ControlCommand): CommandResult;
  report(feedback: InteractionFeedback): void;
  /** Owned by game; its calibration/diagnostic contents are owned by motion. */
  cameraMount: HTMLElement;
}
export interface MotionController {
  /** Called by a user click. Resolves after camera startup, before calibration. */
  start(host: MotionHost): Promise<void>;
  /** May arrive before start. Must reset gesture candidates on a new contextId. */
  setContext(context: ControlContext): void;
  calibrate(playerId: PlayerId): Promise<CalibrationResult>;
  /** Cancels pending calibration, clears timers, and stops all camera tracks. */
  stop(): void;
}
export declare function createMotionController(): MotionController;
