import { describe,it,expect } from 'vitest';
import { scoreCurling } from '../src/core/scoring';
import fixtures from './fixtures.json';
describe('curling scoring boundary fixtures',()=>{
  for (const c of fixtures.scoringCases) it(c.id,()=>{
    expect(scoreCurling(c.balls.map(b=>({...b,ownerId:b.ownerId as 'A'|'B'})), c.house, c.epsilon)).toEqual(c.expectedScore);
  });
});
