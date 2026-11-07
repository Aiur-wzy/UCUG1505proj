import { describe, expect, it } from 'vitest';
import fixtures from '../fixtures.json';
import defaults from '../../src/shared/defaults.json';
import type { ControlCommand, Phase } from '../../src/shared/contract';
import { harness } from './helpers';

describe('authoritative commands', () => {
  it('previews immediately without changing context, freezes exact values, fires once', () => {
    const h = harness(); h.send('SELECT_BALL', { ballTypeId: 'normal' });
    const id = h.host.getContext().contextId;
    h.send('PREVIEW_SHOT', { aimDeg: 12, power01: 0.6 });
    expect(h.host.getContext().contextId).toBe(id);
    h.send('ARM_SHOT', {});
    expect(h.send('PREVIEW_SHOT', { aimDeg: -30, power01: 1 }).reason).toBe('WRONG_PHASE');
    const fire = h.host.command('FIRE', {}), result = h.host.submit(fire);
    h.advance(1000);
    expect(h.host.submit(fire)).toEqual({ ...result, duplicate: true });
    expect(h.shots).toHaveLength(1); expect(h.shots[0]).toMatchObject({ aimDeg: 12, power01: 0.6 });
    expect(h.host.getSnapshot().inventories.A.normal).toBe(0);
    expect(h.host.submit({ ...fire, atMs: fire.atMs + 1 }).reason).toBe('ID_REUSE');
  });
  it('returns copies and publishes the new context before returning a receipt', () => {
    const h = harness(); let notified = 0;
    h.host.onContext(c => { notified = c.contextId; c.phase = 'inactive'; });
    const result = h.send('SELECT_BALL', { ballTypeId: 'normal' });
    expect(notified).toBe(result.contextId); expect(h.host.getContext().phase).toBe('adjust');
    h.host.getSnapshot().inventories.A.normal = 0;
    expect(h.host.getSnapshot().inventories.A.normal).toBe(1);
  });
  it.each([NaN, Infinity, -Infinity, 90.01, -90.01])('rejects invalid angle %s', aimDeg => {
    const h = harness(); h.toPhase('adjust');
    expect(h.send('PREVIEW_SHOT', { aimDeg, power01: 0.5 }).reason).toBe('INVALID_PAYLOAD');
    expect(h.shots).toHaveLength(0);
  });
  it.each([-90, -75, 75, 90])('accepts and freezes the expanded angle %s', aimDeg => {
    const h = harness(); h.toPhase('adjust');
    expect(h.host.getContext().limits).toMatchObject({ aimMinDeg: -90, aimMaxDeg: 90 });
    expect(h.send('PREVIEW_SHOT', { aimDeg, power01: 1 }).accepted).toBe(true);
    h.send('ARM_SHOT', {}); h.send('FIRE', {});
    expect(h.shots[0]).toMatchObject({ aimDeg, power01: 1 });
  });
  it.each([NaN, Infinity, -0.1, 1.01])('rejects invalid power %s', power01 => {
    const h = harness(); h.toPhase('adjust');
    expect(h.send('PREVIEW_SHOT', { aimDeg: 0, power01 }).reason).toBe('INVALID_PAYLOAD');
  });
  it('checks malformed objects, wrong version/session, future clocks and preview order', () => {
    const h = harness(); h.toPhase('adjust');
    expect(h.host.submit(null as unknown as ControlCommand).reason).toBe('INVALID_PAYLOAD');
    const arm = h.host.command('ARM_SHOT', {});
    expect(h.host.submit({ ...arm, protocolVersion: '1.0' } as unknown as ControlCommand).reason).toBe('VERSION_MISMATCH');
    expect(h.host.submit({ ...arm, sessionId: 'previous' }).reason).toBe('SESSION_MISMATCH');
    expect(h.host.submit({ ...arm, atMs: h.now() + 51 }).reason).toBe('STALE_INPUT');
    const preview = h.host.command('PREVIEW_SHOT', { aimDeg: 0, power01: 0.5 });
    h.setTime(h.now() + 1); preview.atMs = h.now();
    expect(h.host.submit(preview).accepted).toBe(true);
    expect(h.host.submit({ ...preview, commandId: 'older', atMs: preview.atMs - 1 }).reason).toBe('STALE_INPUT');
    expect(h.host.submit({ ...preview, commandId: 'extra', payload: { aimDeg: 0, power01: 0.5, hidden: 1 } } as unknown as ControlCommand).reason).toBe('INVALID_PAYLOAD');
  });
  it('times out, pauses, clears locks and rejects previous-session completions', () => {
    const h = harness(); h.toPhase('armed'); h.advance(5000);
    expect(h.host.getContext().phase).toBe('adjust');
    h.send('ARM_SHOT', {}); h.host.setPaused(true);
    expect(h.host.getContext().lockedShot).toBeNull(); expect(h.isPaused()).toBe(true);
    h.host.setPaused(false); h.send('ARM_SHOT', {}); h.send('FIRE', {});
    const old = h.shots[0]; h.host.retry();
    expect(h.host.completeShot(old.sessionId, old.shotId, [])).toBe(false);
    expect(h.host.getSnapshot().inventories.A.normal).toBe(1);
  });
  it('rolls back a partially failed spawn and never retries the same command', () => {
    const h = harness(); h.toPhase('armed'); h.fail();
    const command = h.host.command('FIRE', {});
    expect(() => h.host.submit(command)).toThrow('simulated partial spawn');
    expect(h.shots).toHaveLength(0); expect(h.rolledBack).toHaveLength(1);
    expect(h.host.getSnapshot().inventories.A.normal).toBe(1); expect(h.host.getContext().phase).toBe('armed');
    expect(() => h.host.submit(command)).toThrow('simulated partial spawn'); expect(h.rolledBack).toHaveLength(1);
  });
  it('ignores repeated completion and does not settle merely because time has elapsed', () => {
    const h = harness(); h.toPhase('resolving'); h.advance(25000);
    expect(h.host.getContext().phase).toBe('resolving');
    const shot = h.shots[0]; expect(h.finish()).toBe(true);
    expect(h.host.completeShot(shot.sessionId, shot.shotId, [])).toBe(false);
    expect(h.host.getContext().turnId).toBe(2);
  });
  it('does not retain a failed initial controller subscription', () => {
    const h = harness(); let calls = 0;
    expect(() => h.host.onContext(() => { calls++; throw new Error('controller failed'); })).toThrow('controller failed');
    h.send('SELECT_BALL', { ballTypeId: 'normal' }); expect(calls).toBe(1);
  });
  it('blocks an entirely occupied launch line without spending more inventory', () => {
    const h = harness(); h.toPhase('resolving');
    h.finish(defaults.world.launchCandidatesX.map((x, index) => ({ id: `block-${index}`, ownerId: 'A', typeId: 'normal', x, y: 610, radius: 18, inPlay: true })));
    expect(h.host.getSnapshot().origin).toBeNull(); expect(h.host.getSnapshot().diagnostic).toBeTruthy();
    expect(h.send('SELECT_BALL', { ballTypeId: 'normal' }).reason).toBe('INPUT_DISABLED');
    expect(h.host.getSnapshot().inventories.A.normal).toBe(0);
  });
  it('source switches clear locks but preserve the selected ball and visible values', () => {
    const h = harness(); h.toPhase('armed');
    h.host.setPreviewSource('motion');
    expect(h.host.getContext()).toMatchObject({ phase: 'adjust', selectedBallId: 'normal', previewShot: { aimDeg: 12, power01: 0.6 }, lockedShot: null });
    h.send('ARM_SHOT', {}); h.send('FIRE', {});
    expect(h.host.setPreviewSource('keyboard')).toBe(false);
    expect(h.host.getContext().previewSource).toBe('motion');
  });
});

describe('motion and keyboard sharing one host', () => {
  it('keeps keyboard confirm/fire available when motion confirmations are disabled', () => {
    const h = harness('motion'); h.ready(); h.toPhase('adjust');
    expect(h.send('ARM_SHOT', {}, 'motion').reason).toBe('ACTION_DISABLED');
    expect(h.send('ARM_SHOT', {}).accepted).toBe(true);
    expect(h.host.getContext().lockedShot).toEqual({ aimDeg: 12, power01: 0.6 });
    expect(h.send('CANCEL_SHOT', {}).accepted).toBe(true);
    h.send('ARM_SHOT', {}); expect(h.send('FIRE', {}).accepted).toBe(true);
  });
  it('cancels on the loss edge only, allowing a keyboard lock during continuing loss', () => {
    const h = harness('motion'); h.ready(); h.toPhase('armed');
    h.report({ tracking: 'lost', validPair: false, rearmed: false });
    expect(h.host.getContext()).toMatchObject({ phase: 'adjust', motionEnabled: false, inputEnabled: true, lockedShot: null });
    h.send('ARM_SHOT', {}); h.report({ tracking: 'lost', validPair: false, rearmed: false });
    expect(h.host.getContext().phase).toBe('armed'); expect(h.send('FIRE', {}).accepted).toBe(true);
  });
  it('expires feedback, recovers with a new context and requires fresh context feedback', () => {
    const h = harness('motion'); h.host.setMotionActions(defaults.fullMotionActionsEnabled as ControlCommand['type'][]);
    h.ready(); h.toPhase('armed'); h.advance(251);
    expect(h.host.getContext().phase).toBe('adjust'); const id = h.host.getContext().contextId;
    h.report(); expect(h.host.getContext().contextId).toBeGreaterThan(id);
    expect(h.host.submit(h.host.command('ARM_SHOT', {}, 'motion')).reason).toBe('TRACKING_UNREADY');
    h.report(); expect(h.host.submit(h.host.command('ARM_SHOT', {}, 'motion')).reason).toBe('PREVIEW_UNREADY');
    h.send('PREVIEW_SHOT', { aimDeg: 10, power01: 0.7 }, 'motion');
    expect(h.send('ARM_SHOT', {}, 'motion').accepted).toBe(true);
  });
  it('preserves fresh tracking across normal phases, clearing it on turn/source changes', () => {
    const h = harness('motion'); h.ready(); h.toPhase('armed'); h.host.tick();
    expect(h.host.getContext().motionEnabled).toBe(true);
    h.send('FIRE', {}); h.report({ tracking: 'lost', validPair: false });
    expect(h.host.getContext().phase).toBe('resolving');
    h.finish(); expect(h.host.getSnapshot().feedback).toBeNull();
    h.ready(); h.host.setPreviewSource('keyboard'); expect(h.host.getSnapshot().feedback).toBeNull();
    h.host.setPreviewSource('motion'); expect(h.host.getContext().motionEnabled).toBe(false);
  });
  it('sequential racing commands only commit once', () => {
    const h = harness('motion'); h.host.setMotionActions(defaults.fullMotionActionsEnabled as ControlCommand['type'][]);
    h.ready(); h.toPhase('adjust'); h.ready();
    const motion = h.host.command('ARM_SHOT', {}, 'motion'), keyboard = h.host.command('ARM_SHOT', {});
    expect(h.host.submit(keyboard).accepted).toBe(true);
    expect(h.host.submit(motion).reason).toBe('STALE_CONTEXT');
    h.ready(); const fireA = h.host.command('FIRE', {}), fireB = h.host.command('FIRE', {}, 'motion');
    expect(h.host.submit(fireA).accepted).toBe(true); expect(h.host.submit(fireB).reason).toBe('STALE_CONTEXT'); expect(h.shots).toHaveLength(1);
  });
  it('does not let stale, wrong player or old-context feedback revive tracking', () => {
    const h = harness('motion'); const c = h.host.getContext();
    h.report({ playerId: 'B' }); h.report({ atMs: h.now() - 251 }); h.report({ contextId: c.contextId - 1 });
    expect(h.host.getContext().motionEnabled).toBe(false);
    h.ready(); h.advance(251); h.report({ rearmed: false }); expect(h.host.getContext().motionEnabled).toBe(false);
  });
});

describe('published contract fixtures executed against the real receiver', () => {
  it('runs happyPath with host-generated identities and contexts', () => {
    const h = harness('motion'); h.host.setMotionActions(defaults.fullMotionActionsEnabled as ControlCommand['type'][]);
    let lastFire: ControlCommand | undefined;
    for (const row of fixtures.happyPath) {
      h.setTime(row.receiveAtMs); h.ready();
      const context = h.host.getContext();
      const command = row.expected.duplicate ? lastFire! : { ...row.command, sessionId: context.sessionId, contextId: context.contextId } as ControlCommand;
      const previousStock = h.host.getSnapshot().inventories.A.normal;
      const result = h.host.submit(command);
      expect(result.accepted).toBe(row.expected.accepted);
      expect(h.host.getSnapshot().inventories.A.normal - previousStock).toBe(row.expected.stockDelta);
      if (row.expected.phase) expect(result.phase).toBe(row.expected.phase);
      if (row.expected.duplicate) expect(result.duplicate).toBe(true);
      if (command.type === 'FIRE') lastFire = command;
    }
    expect(h.shots).toHaveLength(1);
  });
  it.each(fixtures.rejectionCases)('$id → $expectedReason', row => {
    const h = harness('motion'); h.host.setMotionActions(row.context.motionActionsEnabled as ControlCommand['type'][]); h.ready();
    if (row.id === 'empty-inventory') {
      for (let i = 0; i < defaults.inventory.normal; i++) { h.toPhase('resolving'); h.finish(); }
    } else h.toPhase(row.context.phase as Phase);
    if (row.id === 'other-source') h.host.setPreviewSource('keyboard');
    if (row.id === 'disabled-gate') h.host.setPaused(true);
    h.setTime(row.receiveAtMs); h.ready();
    const before = h.host.getSnapshot(); const count = h.shots.length;
    const command = { ...row.command, sessionId: before.context.sessionId,
      contextId: before.context.contextId + row.command.contextId - row.context.contextId } as ControlCommand;
    expect(h.host.submit(command).reason).toBe(row.expectedReason);
    expect(h.host.getSnapshot().inventories).toEqual(before.inventories); expect(h.shots).toHaveLength(count);
  });
  it.each(fixtures.hybridCases)('$id', row => {
    const h = harness('motion'); h.host.setMotionActions(row.context.motionActionsEnabled as ControlCommand['type'][]); h.ready();
    h.toPhase(row.context.phase as Phase);
    if (row.commands) {
      const id = h.host.getContext().contextId;
      for (const command of row.commands) {
        h.setTime(command.atMs + 10); h.ready();
        expect(h.host.submit({ ...command, sessionId: h.host.getContext().sessionId, contextId: id } as ControlCommand).accepted).toBe(true);
        expect(h.host.getContext().previewShot).toEqual(command.payload);
      }
      expect(h.host.getContext().contextId).toBe(id);
    } else {
      h.setTime(row.receiveAtMs!); h.ready();
      expect(h.host.submit({ ...row.command!, sessionId: h.host.getContext().sessionId, contextId: h.host.getContext().contextId } as ControlCommand).accepted).toBe(true);
      if (row.id.includes('locks')) expect(h.host.getContext().lockedShot).toEqual({ aimDeg: 12, power01: 0.6 });
      if (row.id.includes('fires')) expect(h.shots).toHaveLength(1);
      if (row.id.includes('cancels')) expect(h.host.getContext().phase).toBe('adjust');
    }
  });
});
