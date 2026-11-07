import defaults from '../../shared/defaults.json';
import type { Level } from '../config/levels';
import type { BallSnapshot, GameResult } from './gameState';

export function scoreSolo(balls: BallSnapshot[], level: Level): number {
  return balls.filter(ball => ball.inPlay).reduce((total, ball) => {
    const distance = Math.max(Math.abs(ball.x - defaults.world.house.x), Math.abs(ball.y - defaults.world.house.y));
    const points = level.zoneHalfSizes.reduce((best, halfSize, index) => distance <= halfSize ? Math.max(best, level.zonePoints[index]) : best, 0);
    return total + points;
  }, 0);
}
export function soloResult(balls: BallSnapshot[], level: Level): GameResult {
  const score = scoreSolo(balls, level);
  return { score: { A: score, B: 0 }, winner: score >= level.target ? 'A' : null, passed: score >= level.target, target: level.target };
}
