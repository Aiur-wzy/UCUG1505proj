import { expect, it } from 'vitest';
import { harness } from '../input/helpers';
import { levels } from '../../src/game/config/levels';
import { scoreSolo } from '../../src/game/core/soloMode';
import type { BallSnapshot } from '../../src/game/core/gameState';

const bird = (x: number, y: number, inPlay = true): BallSnapshot => ({ id: `${x}-${y}`, ownerId: 'A', typeId: 'normal', radius: 18, x, y, inPlay });
function fullMatch(h: ReturnType<typeof harness>, balls: BallSnapshot[] = []) {
  const turns = h.host.getSnapshot().mode === 'solo' ? 4 : 8;
  for (let i = 0; i < turns; i++) {
    h.send('SELECT_BALL', { ballTypeId: i < turns - (turns === 8 ? 2 : 1) ? 'normal' : 'repel' });
    h.send('ARM_SHOT', {}); h.send('FIRE', {});
    expect(h.host.getSnapshot().result).toBeNull();
    h.finish(balls);
  }
}
it('uses the highest solo zone once per in-play ball, at exact circle boundaries', () => {
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
  expect(h.host.getSnapshot().inventories.A).toEqual({ normal: 3, repel: 1 });
});
it('plays three eight-throw duels, alternates owners and switches the rematch starter', () => {
  const h = harness(); h.host.start('duel');
  for (let match = 0; match < 3; match++) {
    fullMatch(h, [bird(500, 180)]);
    const order = match % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
    expect(h.shots.map(shot => shot.ownerId)).toEqual(Array.from({ length: 8 }, (_, i) => order[i % 2]));
    expect(h.host.getSnapshot().inventories).toEqual({ A: { normal: 0, repel: 0 }, B: { normal: 0, repel: 0 } });
    expect(h.host.getSnapshot().result?.score).toEqual({ A: 1, B: 0 });
    h.host.retry();
  }
  h.host.menu(); h.host.start('duel'); expect(h.host.getContext().activePlayerId).toBe('A');
});
it('cancels without spending inventory and denies unavailable ball types', () => {
  const h = harness(); h.toPhase('armed'); h.send('CANCEL_SHOT', {}); h.send('CANCEL_SHOT', {});
  expect(h.host.getSnapshot().inventories.A.normal).toBe(3);
  for (let i = 0; i < 3; i++) { h.toPhase('resolving'); h.finish(); }
  expect(h.send('SELECT_BALL', { ballTypeId: 'normal' }).reason).toBe('OUT_OF_STOCK');
  expect(h.send('SELECT_BALL', { ballTypeId: 'repel' }).accepted).toBe(true);
});
