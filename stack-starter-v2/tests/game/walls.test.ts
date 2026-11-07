import { expect, it } from 'vitest';
import { reflectWalls } from '../../src/game/physics/walls';

const walls = { left: 0.85, right: 0.85, top: 0.85 };
it.each([0.01, 0.2, 1, 4, 35])('reflects normal speed %s without a resting threshold and preserves tangent speed', speed => {
  const left = reflectWalls({ minX: -0.1, maxX: 36, minY: 100 }, { x: -speed, y: 5 }, walls);
  expect(left.velocity).toEqual({ x: speed * 0.85, y: 5 });
  expect(left.shift.x).toBeCloseTo(0.185); expect(left.hits).toEqual(['left']);
  const right = reflectWalls({ minX: 964, maxX: 1000.1, minY: 100 }, { x: speed, y: 5 }, walls);
  expect(right.velocity).toEqual({ x: -speed * 0.85, y: 5 });
  const top = reflectWalls({ minX: 480, maxX: 516, minY: -0.1 }, { x: 5, y: -speed }, walls);
  expect(top.velocity).toEqual({ x: 5, y: speed * 0.85 });
});
it('reflects both corner normals once and includes residual travel after impact', () => {
  const result = reflectWalls({ minX: -2, maxX: 34, minY: -3 }, { x: -10, y: -20 }, walls);
  expect(result.hits).toEqual(['left', 'top']);
  expect(result.velocity).toEqual({ x: 8.5, y: 17 });
  expect(result.shift.x).toBeCloseTo(3.7); expect(result.shift.y).toBeCloseTo(5.55);
});
it('corrects overlap without reflecting an already separating body back into the wall', () => {
  const result = reflectWalls({ minX: -0.1, maxX: 36, minY: 100 }, { x: 1, y: 0 }, walls);
  expect(result.hits).toEqual([]); expect(result.velocity.x).toBe(1); expect(result.shift.x).toBe(0.1);
});
it('uses the whole sticky pair footprint and leaves the bottom open', () => {
  expect(reflectWalls({ minX: 943, maxX: 1015, minY: 100 }, { x: 5, y: 0 }, walls).shift.x).toBeCloseTo(-27.75);
  expect(reflectWalls({ minX: 480, maxX: 516, minY: 800 }, { x: 0, y: 35 }, walls)).toMatchObject({ hits: [], velocity: { x: 0, y: 35 }, shift: { x: 0, y: 0 } });
  expect(reflectWalls({ minX: -10, maxX: 26, minY: 701 }, { x: -1, y: 2 }, walls)).toMatchObject({ hits: [], shift: { x: 0, y: 0 } });
});
