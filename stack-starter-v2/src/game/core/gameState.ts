import type { ControlContext, InteractionFeedback, PlayerId, ShotValues } from '../../shared/contract';
import type { BallTypeId, Inventory } from '../config/ballDefinitions';

export type Mode = 'solo' | 'duel';
export interface Point { x: number; y: number }
export interface BallSnapshot extends Point {
  id: string; ownerId: PlayerId; typeId: BallTypeId; radius: number; inPlay: boolean;
}
export interface ShotRequest extends ShotValues {
  shotId: string; sessionId: string; ownerId: PlayerId; typeId: BallTypeId; origin: Point;
}
export interface GameResult {
  score: { A: number; B: number }; winner: PlayerId | null; passed: boolean; target: number | null;
}
export interface GameState {
  context: ControlContext;
  mode: Mode;
  levelIndex: number;
  firstPlayer: PlayerId;
  inventories: Record<PlayerId, Inventory>;
  origin: Point | null;
  balls: BallSnapshot[];
  currentShotId: string | null;
  shotsTaken: number;
  paused: boolean;
  result: GameResult | null;
  feedback: InteractionFeedback | null;
  diagnostic: string | null;
}
/** The host owns this port; implementations must roll back a partial spawn on failure. */
export interface PhysicsPort {
  spawn(shot: ShotRequest): void;
  rollback(shotId: string): void;
  reset(): void;
  setPaused(paused: boolean): void;
}
