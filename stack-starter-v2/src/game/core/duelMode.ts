import defaults from '../../shared/defaults.json';
import { scoreCurling } from '../../core/scoring';
import type { PlayerId } from '../../shared/contract';
import type { BallSnapshot, GameResult } from './gameState';

export const otherPlayer = (player: PlayerId): PlayerId => player === 'A' ? 'B' : 'A';
export function duelResult(balls: BallSnapshot[]): GameResult {
  const score = scoreCurling(balls, defaults.world.house, defaults.world.scoreEpsilon);
  return { score, winner: score.A === score.B ? null : score.A > score.B ? 'A' : 'B', passed: false, target: null };
}
