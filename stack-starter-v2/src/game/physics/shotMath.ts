import defaults from '../../shared/defaults.json';
import type { ShotValues } from '../../shared/contract';
import type { BallSnapshot, Point } from '../core/gameState';

export const clampShot = (shot: ShotValues): ShotValues => ({ aimDeg: Math.max(-50, Math.min(50, shot.aimDeg)), power01: Math.max(0, Math.min(1, shot.power01)) });
export function launchVelocity(shot: ShotValues): Point {
  const angle = shot.aimDeg * Math.PI / 180;
  const speed = defaults.physics.launchSpeedMin + (defaults.physics.launchSpeedMax - defaults.physics.launchSpeedMin) * shot.power01;
  return { x: Math.sin(angle) * speed, y: -Math.cos(angle) * speed };
}
export function findLaunchOrigin(balls: BallSnapshot[]): Point | null {
  const y = defaults.world.launch.y, radius = defaults.world.ballRadius;
  const x = defaults.world.launchCandidatesX.find(candidate => balls.every(ball => !ball.inPlay || Math.hypot(candidate - ball.x, y - ball.y) >= radius + ball.radius + 2));
  return x === undefined ? null : { x, y };
}
export const isOutOfPlay = (ball: Pick<BallSnapshot, 'x' | 'y' | 'radius'>) => ball.x + ball.radius < 0 || ball.y + ball.radius < 0 || ball.x - ball.radius > defaults.world.width || ball.y - ball.radius > defaults.world.height;

export interface PredictedPath { points: Point[]; end: Point; event: 'stop' | 'collision' | 'out' }
/** Free sliding only; stop at the first contact. No secondary collisions/effects are predicted. */
export function predictPath(origin: Point, shot: ShotValues, balls: BallSnapshot[]): PredictedPath {
  const points: Point[] = [{ ...origin }];
  let position = { ...origin }, velocity = launchVelocity(shot);
  for (let step = 0; step < 600; step++) {
    velocity = { x: velocity.x * (1 - defaults.physics.frictionAir), y: velocity.y * (1 - defaults.physics.frictionAir) };
    const next = { x: position.x + velocity.x, y: position.y + velocity.y };
    let firstHit = Infinity;
    const a = velocity.x ** 2 + velocity.y ** 2;
    for (const ball of balls.filter(ball => ball.inPlay)) {
      const dx = position.x - ball.x, dy = position.y - ball.y;
      const b = 2 * (dx * velocity.x + dy * velocity.y);
      const c = dx * dx + dy * dy - (ball.radius + defaults.world.ballRadius) ** 2;
      const discriminant = b * b - 4 * a * c;
      const t = c <= 0 ? 0 : discriminant >= 0 && a > 0 ? (-b - Math.sqrt(discriminant)) / (2 * a) : Infinity;
      if (t >= 0 && t <= 1) firstHit = Math.min(firstHit, t);
    }
    let edge = Infinity;
    if (next.x < 0) edge = Math.min(edge, -position.x / velocity.x);
    if (next.x > defaults.world.width) edge = Math.min(edge, (defaults.world.width - position.x) / velocity.x);
    if (next.y < 0) edge = Math.min(edge, -position.y / velocity.y);
    if (next.y > defaults.world.height) edge = Math.min(edge, (defaults.world.height - position.y) / velocity.y);
    if (Math.min(firstHit, edge) <= 1) {
      const t = Math.min(firstHit, edge), end = { x: position.x + velocity.x * t, y: position.y + velocity.y * t };
      points.push(end);
      return { points, end, event: firstHit <= edge ? 'collision' : 'out' };
    }
    position = next;
    if (step % 4 === 0) points.push({ ...position });
    if (Math.hypot(velocity.x, velocity.y) < defaults.physics.settleLinearSpeed) break;
  }
  points.push(position);
  return { points, end: position, event: 'stop' };
}
