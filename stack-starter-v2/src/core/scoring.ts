export interface ScoringBall { x:number; y:number; radius:number; ownerId:'A'|'B'; inPlay:boolean }
export function scoreCurling(balls:ScoringBall[], house:{x:number;y:number;radius:number}, epsilon=1) {
  const distances = { A:[] as number[], B:[] as number[] };
  for (const ball of balls) {
    const d = Math.hypot(ball.x-house.x, ball.y-house.y);
    if (ball.inPlay && d <= house.radius+ball.radius+epsilon) distances[ball.ownerId].push(d);
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
