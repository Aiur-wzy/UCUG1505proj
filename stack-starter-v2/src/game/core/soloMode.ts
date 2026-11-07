import defaults from '../../shared/defaults.json';
import type { Level } from '../config/levels';
import type { BallSnapshot, GameResult } from './gameState';

export function scoreSolo(balls: BallSnapshot[], level: Level): number {
  return balls.filter(ball => ball.inPlay).reduce((total, ball) => {
    const distance = Math.hypot(ball.x - defaults.world.house.x, ball.y - defaults.world.house.y);
    const points = level.zoneRadii.reduce((best, radius, index) => distance <= radius ? Math.max(best, level.zonePoints[index]) : best, 0);
    return total + points;
  }, 0);
}
export function soloResult(balls: BallSnapshot[], level: Level): GameResult {
  const score = scoreSolo(balls, level);
  return { score: { A: score, B: 0 }, winner: score >= level.target ? 'A' : null, passed: score >= level.target, target: level.target };
}
