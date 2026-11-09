import type { FeedbackReason, PlayerId, ShotValues } from '../shared/contract';
import type { VisionConfig } from '../shared/vision-worker';

export type GloveMode = 'red-green' | 'green-green';
/** Mirrored display coordinates; BOTH axes are divided by image width. */
export interface Point { x: number; y: number }
export interface HandPair { anchor: Point; guide: Point }
export type PairResult = { valid: true; pair: HandPair; reason: 'NONE' }
  | { valid: false; reason: FeedbackReason };
export interface CalibrationProfile {
  playerId: PlayerId; version: number; mode: GloveMode; config: VisionConfig;
  theta0Deg: number; dClose: number; dFar: number; sign: 1 | -1;
}
export interface Observation extends ShotValues {
  atMs: number; r: number; midpoint: Point; pair: HandPair; rearmed: boolean;
}
export const clamp = (n: number, low = 0, high = 1): number => Math.max(low, Math.min(high, n));
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
