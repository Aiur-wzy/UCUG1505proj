import { describe,it,expect } from 'vitest';
import { scoreCurling, touchesHouse } from '../src/core/scoring';
import fixtures from './fixtures.json';
describe('curling scoring boundary fixtures',()=>{
  for (const c of fixtures.scoringCases) it(c.id,()=>{
    expect(scoreCurling(c.balls.map(b=>({...b,ownerId:b.ownerId as 'A'|'B'})), c.house, c.epsilon)).toEqual(c.expectedScore);
  });
});
describe('square house geometry', () => {
  const house = { x: 500, y: 180, halfSize: 130 };
  const ball = (x: number, y: number) => ({ x, y, radius: 18, ownerId: 'A' as const, inPlay: true });
  it('admits inside corners that were outside the former circular house', () => {
    expect(scoreCurling([ball(625, 305)], house)).toEqual({ A: 1, B: 0 });
  });
  it('uses disk-square distance at the corners, not a larger bounding square', () => {
    expect(touchesHouse(ball(643, 323), house)).toBe(true);
    expect(touchesHouse(ball(644, 324), house)).toBe(false);
    expect(touchesHouse(ball(649, 180), house)).toBe(true);
    expect(touchesHouse(ball(649.01, 180), house)).toBe(false);
  });
  it('still ranks eligible balls by Euclidean distance from the centre', () => {
    expect(scoreCurling([ball(580, 260), { ...ball(610, 180), ownerId: 'B' }], house)).toEqual({ A: 0, B: 1 });
  });
});
