import defaults from '../../shared/defaults.json';
import type { ShotValues } from '../../shared/contract';
import type { BallSnapshot, Point } from '../core/gameState';

export const clampShot = (shot: ShotValues): ShotValues => ({ aimDeg: Math.max(defaults.shotLimits.aimMinDeg, Math.min(defaults.shotLimits.aimMaxDeg, shot.aimDeg)), power01: Math.max(0, Math.min(1, shot.power01)) });
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
export const isOutOfPlay = (ball: Pick<BallSnapshot, 'x' | 'y' | 'radius'>) => ball.y - ball.radius > defaults.world.height;

export interface PredictedPath { points: Point[]; bounces: Point[]; end: Point; event: 'stop' | 'collision' | 'out' }
/** Debug only: free sliding and three walls; stop at the first bird contact. */
export function predictPath(origin: Point, shot: ShotValues, balls: BallSnapshot[]): PredictedPath {
  const points: Point[] = [{ ...origin }], bounces: Point[] = [];
  const radius = defaults.world.ballRadius;
  let position = { ...origin }, velocity = launchVelocity(shot);
  for (let step = 0; step < 600; step++) {
    velocity = { x: velocity.x * (1 - defaults.physics.frictionAir), y: velocity.y * (1 - defaults.physics.frictionAir) };
    let remaining = 1;
    for (let segment = 0; segment < 4 && remaining > 1e-8; segment++) {
      const move = { x: velocity.x * remaining, y: velocity.y * remaining };
      let firstHit = Infinity;
      const a = move.x ** 2 + move.y ** 2;
      for (const ball of balls.filter(ball => ball.inPlay)) {
        const dx = position.x - ball.x, dy = position.y - ball.y;
        const b = 2 * (dx * move.x + dy * move.y), c = dx * dx + dy * dy - (ball.radius + radius) ** 2;
        const discriminant = b * b - 4 * a * c;
        const t = c <= 0 ? 0 : discriminant >= 0 && a > 0 ? (-b - Math.sqrt(discriminant)) / (2 * a) : Infinity;
        if (t >= 0 && t <= 1) firstHit = Math.min(firstHit, t);
      }
      const wallX = move.x < 0 ? (radius - position.x) / move.x : move.x > 0 ? (defaults.world.width - radius - position.x) / move.x : Infinity;
      const wallY = move.y < 0 ? (radius - position.y) / move.y : Infinity;
      const exit = move.y > 0 ? (defaults.world.height + radius - position.y) / move.y : Infinity;
      const wall = Math.min(wallX, wallY), t = Math.min(1, firstHit, wall, exit);
      position = { x: position.x + move.x * t, y: position.y + move.y * t };
      if (firstHit <= t || exit <= t) {
        points.push({ ...position });
        return { points, bounces, end: position, event: firstHit <= exit ? 'collision' : 'out' };
      }
      if (wall <= t) {
        points.push({ ...position }); bounces.push({ ...position });
        if (wallX <= wall + 1e-8) velocity.x *= -defaults.physics.wallRestitution;
        if (wallY <= wall + 1e-8) velocity.y *= -defaults.physics.wallRestitution;
        remaining *= 1 - t;
      } else remaining = 0;
    }
    if (step % 4 === 0) points.push({ ...position });
    if (Math.hypot(velocity.x, velocity.y) < defaults.physics.settleLinearSpeed) break;
  }
  points.push(position);
  return { points, bounces, end: position, event: 'stop' };
}
