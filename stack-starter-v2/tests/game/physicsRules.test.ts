import { expect, it } from 'vitest';
import defaults from '../../src/shared/defaults.json';
import { findLaunchOrigin, isOutOfPlay, launchVelocity, predictPath } from '../../src/game/physics/shotMath';
import { advanceEffect, newEffect, repelImpulse, radialImpulse } from '../../src/game/physics/effects';
import { attachSticky, finishSticky, newSticky, shouldReleaseSticky } from '../../src/game/physics/sticky';
import { Settling } from '../../src/game/physics/settling';
import type { BallSnapshot } from '../../src/game/core/gameState';

const bird = (x: number, y: number): BallSnapshot => ({ id: `${x}-${y}`, x, y, radius: 18, ownerId: 'A', typeId: 'normal', inPlay: true });
it.each([-50, 0, 50])('maps %s degrees and both power limits to exact velocity', aimDeg => {
  for (const power01 of [0, 1]) {
    const v = launchVelocity({ aimDeg, power01 });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(3 + 23 * power01); expect(v.y).toBeLessThan(0);
    expect(Math.sign(v.x)).toBe(Math.sign(aimDeg));
  }
});
it('moves down the launch candidate list and handles total blockage', () => {
  expect(findLaunchOrigin([bird(500, 610)])).toEqual({ x: 450, y: 610 });
  expect(findLaunchOrigin(defaults.world.launchCandidatesX.map(x => bird(x, 610)))).toBeNull();
});
it('only the fully crossed lower edge removes a disk; other sides are walls', () => {
  expect(isOutOfPlay(bird(-18.01, 50))).toBe(false); expect(isOutOfPlay(bird(1019, 50))).toBe(false); expect(isOutOfPlay(bird(500, -19))).toBe(false);
  expect(isOutOfPlay(bird(50, 718))).toBe(false); expect(isOutOfPlay(bird(50, 718.01))).toBe(true);
});
it('predicts stop, first collision and boundary events', () => {
  const origin = defaults.world.launch;
  const free = predictPath(origin, { aimDeg: 0, power01: 0.25 }, []);
  expect(free.event).toBe('stop'); expect(free.end.y).toBeGreaterThan(170); expect(free.end.y).toBeLessThan(190);
  const contact = predictPath(origin, { aimDeg: 0, power01: 0.25 }, [bird(500, 450)]);
  expect(contact.event).toBe('collision'); expect(contact.end.y).toBeCloseTo(486);
  const rebound = predictPath(origin, { aimDeg: 0, power01: 1 }, []);
  expect(rebound.event).toBe('stop'); expect(rebound.bounces).toEqual([{ x: 500, y: 18 }]);
  expect(rebound.end.y).toBeGreaterThan(400);
  expect(predictPath({ x: 500, y: 680 }, { aimDeg: 180, power01: 1 }, []).event).toBe('out');
});
it('triggers repel exactly once after continuous low speed, blocks settling, ends on exit', () => {
  const effect = newEffect('repel'), settle = new Settling();
  for (let i = 0; i < 10; i++) { advanceEffect(effect, true, true, 16.6666667); expect(settle.step(true, effect.phase === 'done', 16.6666667)).toBe(false); }
  advanceEffect(effect, false, true, 16.6666667); expect(effect.lowMs).toBe(0);
  for (let i = 0; i < 12; i++) advanceEffect(effect, true, true, 16.6666667);
  expect(effect.phase).toBe('active'); expect(effect.activations).toBe(1);
  for (let i = 0; i < 15; i++) advanceEffect(effect, true, true, 16.6666667);
  expect(effect.phase).toBe('done');
  for (let i = 0; i < 100; i++) advanceEffect(effect, true, true, 16.6666667);
  expect(effect.activations).toBe(1);
  const exited = newEffect('repel'); advanceEffect(exited, false, false, 1); expect(exited.phase).toBe('done');
});
it('maximum speed is at least twice the previous maximum', () => {
  expect(Math.hypot(...Object.values(launchVelocity({ aimDeg: 0, power01: 1 })))).toBeGreaterThanOrEqual(26);
});
it('attraction pulls inward once, without pushing touching or coincident balls', () => {
  const a = { id: 'a', x: 0, y: 0 }, b = { id: 'b', x: 75, y: 0 };
  expect(radialImpulse(a, b, 'attract')).toEqual({ x: -0.08, y: -0 });
  expect(radialImpulse(a, { ...b, x: 0 }, 'attract')).toEqual({ x: 0, y: 0 });
  expect(radialImpulse(a, { ...b, x: 36 }, 'attract')).toEqual({ x: 0, y: 0 });
  expect(radialImpulse(a, { ...b, x: 150 }, 'attract')).toEqual({ x: 0, y: 0 });
  const effect = newEffect('attract');
  advanceEffect(effect, true, true, 200); expect(effect.phase).toBe('active');
  advanceEffect(effect, true, true, 349); expect(effect.phase).toBe('active');
  advanceEffect(effect, true, true, 1); expect(effect.phase).toBe('done');
  advanceEffect(effect, true, true, 1000); expect(effect.activations).toBe(1);
});
it('sticky catches the first partner once and requires both balls to stop before release', () => {
  const sticky = newSticky();
  expect(shouldReleaseSticky(sticky, true, true, 1000)).toBe(false);
  expect(attachSticky(sticky, 'a')).toBe(true); expect(attachSticky(sticky, 'b')).toBe(false);
  expect(sticky.targetId).toBe('a');
  expect(shouldReleaseSticky(sticky, true, true, 199)).toBe(false);
  expect(shouldReleaseSticky(sticky, false, true, 1)).toBe(false);
  expect(shouldReleaseSticky(sticky, true, true, 200)).toBe(true);
  finishSticky(sticky); expect(sticky.phase).toBe('done'); expect(attachSticky(sticky, 'b')).toBe(false);
});
it('leaving the open edge releases a sticky partner immediately', () => {
  const sticky = newSticky(); attachSticky(sticky, 'a');
  expect(shouldReleaseSticky(sticky, false, false, 0)).toBe(true);
});
it('uses deterministic zero-distance impulses and excludes the radius boundary', () => {
  const a = { id: 'a', x: 0, y: 0 }, b = { id: 'b', x: 0, y: 0 };
  expect(repelImpulse(a, b)).toEqual({ x: 0.12, y: 0 }); expect(repelImpulse(b, a)).toEqual({ x: -0.12, y: 0 });
  expect(repelImpulse(a, { ...b, x: 120 })).toEqual({ x: 0, y: 0 });
  expect(repelImpulse(a, { ...b, x: 60 }).x).toBeCloseTo(0.06);
});
it('requires a continuous quiet half second after all effects finish', () => {
  const settle = new Settling(); expect(settle.step(true, false, 1000)).toBe(false);
  expect(settle.step(true, true, 499)).toBe(false); expect(settle.step(false, true, 1)).toBe(false);
  expect(settle.step(true, true, 499)).toBe(false); expect(settle.step(true, true, 1)).toBe(true);
});
