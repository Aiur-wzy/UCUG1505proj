import { expect, it } from 'vitest';
import defaults from '../../src/shared/defaults.json';
import { clampShot, findLaunchOrigin, isOutOfPlay, launchVelocity, predictPath } from '../../src/game/physics/shotMath';
import { advanceEffect, newEffect, repelImpulse, radialImpulse } from '../../src/game/physics/effects';
import { attachSticky, finishSticky, newSticky, shouldReleaseSticky } from '../../src/game/physics/sticky';
import { Settling } from '../../src/game/physics/settling';
import type { BallSnapshot } from '../../src/game/core/gameState';

const bird = (x: number, y: number): BallSnapshot => ({ id: `${x}-${y}`, x, y, radius: 18, ownerId: 'A', typeId: 'normal', inPlay: true });
it.each([-90, -50, 0, 50, 90])('maps %s degrees and both power limits to exact velocity', aimDeg => {
  for (const power01 of [0, 1]) {
    const v = launchVelocity({ aimDeg, power01 });
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(3 + 32 * power01); expect(v.y).toBeLessThanOrEqual(0);
    expect(Math.sign(v.x)).toBe(Math.sign(aimDeg));
    if (Math.abs(aimDeg) === 90) expect(v.y).toBeCloseTo(0);
  }
});
it('clamps keyboard and pointer previews to the full upper semicircle', () => {
  expect(clampShot({ aimDeg: -180, power01: -1 })).toEqual({ aimDeg: -90, power01: 0 });
  expect(clampShot({ aimDeg: 180, power01: 2 })).toEqual({ aimDeg: 90, power01: 1 });
  expect(clampShot({ aimDeg: 75, power01: 0.4 })).toEqual({ aimDeg: 75, power01: 0.4 });
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
  const free = predictPath(origin, { aimDeg: 0, power01: 0.11 }, []);
  expect(free.event).toBe('stop'); expect(free.end.y).toBeGreaterThan(170); expect(free.end.y).toBeLessThan(190);
  const contact = predictPath(origin, { aimDeg: 0, power01: 0.11 }, [bird(500, 450)]);
  expect(contact.event).toBe('collision'); expect(contact.end.y).toBeCloseTo(486);
  const rebound = predictPath(origin, { aimDeg: 0, power01: 1 }, []);
  expect(rebound.event).toBe('out'); expect(rebound.bounces).toEqual([{ x: 500, y: 18 }]);
  expect(rebound.end.y).toBeCloseTo(718);
  expect(predictPath({ x: 500, y: 680 }, { aimDeg: 180, power01: 1 }, []).event).toBe('out');
});
it('triggers repel exactly once after continuous low speed, blocks settling, ends on exit', () => {
  const effect = newEffect('repel'), settle = new Settling();
  for (let i = 0; i < 10; i++) { advanceEffect(effect, true, true, 16.6666667); expect(settle.step(true, effect.phase === 'done', 16.6666667)).toBe(false); }
  advanceEffect(effect, false, true, 16.6666667); expect(effect.lowMs).toBe(0);
  for (let i = 0; i < 12; i++) advanceEffect(effect, true, true, 16.6666667);
  expect(effect.phase).toBe('active'); expect(effect.activations).toBe(1);
  for (let i = 0; i < 21; i++) advanceEffect(effect, true, true, 16.6666667);
  expect(effect.phase).toBe('done');
  for (let i = 0; i < 100; i++) advanceEffect(effect, true, true, 16.6666667);
  expect(effect.activations).toBe(1);
  const exited = newEffect('repel'); advanceEffect(exited, false, false, 1); expect(exited.phase).toBe('done');
});
it('maximum launch speed is 35', () => {
  expect(Math.hypot(...Object.values(launchVelocity({ aimDeg: 0, power01: 1 })))).toBe(35);
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
it('expires a missed sticky effect without consuming an activation or allowing a later attachment', () => {
  const sticky = newSticky(); finishSticky(sticky);
  expect(sticky).toMatchObject({ phase: 'done', activations: 0, targetId: null });
  expect(attachSticky(sticky, 'later-shot')).toBe(false);
});
it.each(['repel', 'attract'] as const)('a completed %s effect cannot restart when a later throw moves it', type => {
  const effect = newEffect(type);
  advanceEffect(effect, true, true, 200); advanceEffect(effect, true, true, 350);
  for (let tick = 0; tick < 10; tick++) { advanceEffect(effect, false, true, 1000); advanceEffect(effect, true, true, 1000); }
  expect(effect).toMatchObject({ phase: 'done', activations: 1 });
});
it('repulsion and attraction have equal range, duration and opposite impulses at equal distances', () => {
  expect(defaults.effects.repel).toEqual(defaults.effects.attract);
  for (const distance of [40, 75, 119, 140]) {
    const source = { id: 'a', x: 0, y: 0 }, target = { id: 'b', x: distance, y: 0 };
    expect(radialImpulse(source, target, 'repel').x).toBeCloseTo(-radialImpulse(source, target, 'attract').x);
  }
});
it('uses deterministic zero-distance impulses and excludes the radius boundary', () => {
  const a = { id: 'a', x: 0, y: 0 }, b = { id: 'b', x: 0, y: 0 };
  expect(repelImpulse(a, b)).toEqual({ x: 0.16, y: 0 }); expect(repelImpulse(b, a)).toEqual({ x: -0.16, y: 0 });
  expect(repelImpulse(a, { ...b, x: 150 })).toEqual({ x: 0, y: 0 });
  expect(repelImpulse(a, { ...b, x: 75 }).x).toBeCloseTo(0.08);
});
it('requires a continuous quiet half second after all effects finish', () => {
  const settle = new Settling(); expect(settle.step(true, false, 1000)).toBe(false);
  expect(settle.step(true, true, 499)).toBe(false); expect(settle.step(false, true, 1)).toBe(false);
  expect(settle.step(true, true, 499)).toBe(false); expect(settle.step(true, true, 1)).toBe(true);
});
