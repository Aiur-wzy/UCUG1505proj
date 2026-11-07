import { expect, it } from 'vitest';
import { harness } from '../input/helpers';
import { levels } from '../../src/game/config/levels';
import { scoreSolo } from '../../src/game/core/soloMode';
import type { BallSnapshot } from '../../src/game/core/gameState';
import { ballDefinitions, freshInventory } from '../../src/game/config/ballDefinitions';
import { totalShots } from '../../src/game/core/modeRules';

const bird = (x: number, y: number, inPlay = true): BallSnapshot => ({ id: `${x}-${y}`, ownerId: 'A', typeId: 'normal', radius: 18, x, y, inPlay });
function fullMatch(h: ReturnType<typeof harness>, balls: BallSnapshot[] = []) {
  const turns = totalShots(h.host.getSnapshot().mode);
  for (let i = 0; i < turns; i++) {
    const type = h.host.getContext().ballOptions.find(option => option.remaining > 0)!.id;
    expect(h.send('SELECT_BALL', { ballTypeId: type }).accepted).toBe(true);
    h.send('ARM_SHOT', {}); h.send('FIRE', {});
    expect(h.host.getSnapshot().result).toBeNull();
    h.finish(balls);
  }
}
it('uses the highest square solo zone once per in-play ball, at exact boundaries', () => {
  expect(scoreSolo([bird(500, 180), bird(545, 180), bird(610, 180), bird(680, 180), bird(681, 180), bird(500, 180, false)], levels[0])).toBe(9);
});
it('plays all five levels with passing results and rejects advancement after the last', () => {
  const h = harness();
  for (let index = 0; index < 5; index++) {
    expect(h.host.getSnapshot().levelIndex).toBe(index);
    fullMatch(h, [bird(500, 180), bird(510, 180), bird(520, 180)]);
    expect(h.host.getSnapshot().result).toMatchObject({ passed: true, target: index + 3 });
    expect(h.host.nextLevel()).toBe(index < 4);
  }
});
it('fails an empty solo layout and resets inventory/session on retry', () => {
  const h = harness(); const session = h.host.getContext().sessionId; fullMatch(h);
  expect(h.host.getSnapshot().result?.passed).toBe(false); expect(h.host.nextLevel()).toBe(false);
  h.host.retry(); expect(h.host.getContext().sessionId).not.toBe(session);
  expect(h.host.getSnapshot().inventories.A).toEqual({ normal: 1, repel: 1, attract: 1, sticky: 1 });
});
it('plays three eight-throw duels, alternates owners and switches the rematch starter', () => {
  const h = harness(); h.host.start('duel');
  for (let match = 0; match < 3; match++) {
    fullMatch(h, [bird(500, 180)]);
    const order = match % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
    expect(h.shots.map(shot => shot.ownerId)).toEqual(Array.from({ length: 8 }, (_, i) => order[i % 2]));
    const empty = { normal: 0, repel: 0, attract: 0, sticky: 0 };
    expect(h.host.getSnapshot().inventories).toEqual({ A: empty, B: empty });
    expect(h.host.getSnapshot().result?.score).toEqual({ A: 1, B: 0 });
    h.host.retry();
  }
  h.host.menu(); h.host.start('duel'); expect(h.host.getContext().activePlayerId).toBe('A');
});
it('cancels without spending inventory and denies unavailable ball types', () => {
  const h = harness(); h.toPhase('armed'); h.send('CANCEL_SHOT', {}); h.send('CANCEL_SHOT', {});
  expect(h.host.getSnapshot().inventories.A.normal).toBe(1);
  h.toPhase('resolving'); h.finish();
  expect(h.send('SELECT_BALL', { ballTypeId: 'normal' }).reason).toBe('OUT_OF_STOCK');
  expect(h.send('SELECT_BALL', { ballTypeId: 'repel' }).accepted).toBe(true);
});
it('includes all four distinct types exactly once for each player', () => {
  const h = harness(); h.host.start('duel'); fullMatch(h);
  for (const player of ['A', 'B']) expect(h.shots.filter(shot => shot.ownerId === player).map(shot => shot.typeId).sort()).toEqual(ballDefinitions.map(ball => ball.id).sort());
  expect(Object.values(freshInventory()).reduce((sum, value) => sum + value, 0)).toBe(4);
});
it('counts square corners, but not centres just outside a side', () => {
  expect(scoreSolo([bird(545, 225)], levels[0])).toBe(3);
  expect(scoreSolo([bird(610, 290)], levels[0])).toBe(2);
  expect(scoreSolo([bird(680, 360)], levels[0])).toBe(1);
  expect(scoreSolo([bird(680.01, 180)], levels[0])).toBe(0);
});
