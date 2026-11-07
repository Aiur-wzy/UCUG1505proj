export interface ScoringBall { x:number; y:number; radius:number; ownerId:'A'|'B'; inPlay:boolean }
export interface SquareHouse { x: number; y: number; halfSize: number }
/** True disk/square intersection, including rounded corner contact and epsilon. */
export function touchesHouse(ball: ScoringBall, house: SquareHouse, epsilon = 1): boolean {
  const dx = Math.max(0, Math.abs(ball.x - house.x) - house.halfSize);
  const dy = Math.max(0, Math.abs(ball.y - house.y) - house.halfSize);
  return ball.inPlay && Math.hypot(dx, dy) <= ball.radius + epsilon;
}
export function scoreCurling(balls:ScoringBall[], house:SquareHouse, epsilon=1) {
  const distances = { A:[] as number[], B:[] as number[] };
  for (const ball of balls) {
    const d = Math.hypot(ball.x-house.x, ball.y-house.y);
    if (touchesHouse(ball, house, epsilon)) distances[ball.ownerId].push(d);
  }
  const nearestA = Math.min(...distances.A), nearestB = Math.min(...distances.B);
  const score = {A:0,B:0};
  if (nearestA===Infinity && nearestB===Infinity) return score;
  if (Math.abs(nearestA-nearestB)<=epsilon) return score;
  const winner = nearestA < nearestB ? 'A' : 'B';
  const rival = winner==='A' ? nearestB : nearestA;
  score[winner] = distances[winner].filter(d=>d<rival-epsilon).length;
  return score;
}
