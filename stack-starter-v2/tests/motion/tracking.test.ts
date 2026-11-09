import { describe, expect, it } from 'vitest';
import { PairTracker } from '../../src/motion/tracking';
import { PairSmoother, RearmGate } from '../../src/motion/smoothing';
import { blob, pair } from './helpers';
describe('two glove tracking', () => {
  it('mirrors once and normalizes both axes by width', () => {
    const result = new PairTracker().update({ anchor: [blob(240, 80)], guide: [blob(80, 120)] }, 'red-green', 320, 0);
    expect(result).toEqual({ valid: true, reason: 'NONE', pair: { anchor: { x: .25, y: .25 }, guide: { x: .75, y: .375 } } });
  });
  it('never averages multiple plausible blobs', () => expect(new PairTracker().update({ anchor: [blob(240), blob(200)], guide: [blob(80)] }, 'red-green', 320, 0)).toMatchObject({ valid: false, reason: 'AMBIGUOUS_BLOBS' }));
  it('rejects missing hands and jumps, then reacquires without old coordinates', () => {
    const tracker = new PairTracker();
    tracker.update({ anchor: [blob(240)], guide: [blob(80)] }, 'red-green', 320, 0);
    expect(tracker.update({ anchor: [blob(150)], guide: [blob(80)] }, 'red-green', 320, 50)).toMatchObject({ reason: 'POSITION_JUMP' });
    expect(tracker.update({ anchor: [], guide: [blob(80)] }, 'red-green', 320, 100)).toMatchObject({ reason: 'COLOR_MISSING' });
    expect(tracker.update({ anchor: [blob(150)], guide: [blob(80)] }, 'red-green', 320, 150).valid).toBe(true);
  });
  it('double-green uses two distinct components, ignoring the duplicated guide mask', () => {
    const two = [blob(240), blob(80)]; const tracker = new PairTracker();
    const result = tracker.update({ anchor: two, guide: two }, 'green-green', 320, 0);
    expect(result).toMatchObject({ valid: true, pair: { anchor: { x: .25 }, guide: { x: .75 } } });
    expect(tracker.update({ anchor: [blob(160)], guide: [blob(160)] }, 'green-green', 320, 50).valid).toBe(false);
  });
  it('double-green refuses crossings, vertical overlap and ambiguous reacquisition', () => {
    expect(new PairTracker().update({ anchor: [blob(160, 60), blob(160, 180)], guide: [] }, 'green-green', 320, 0)).toMatchObject({ valid: false, reason: 'AMBIGUOUS_BLOBS' });
    expect(new PairTracker().update({ anchor: [blob(240), blob(80), blob(160)], guide: [] }, 'green-green', 320, 0).valid).toBe(false);
  });
  it('history can exclude a far distractor but refuses near-equivalent associations', () => {
    const tracker = new PairTracker(); tracker.update({ anchor: [blob(240)], guide: [blob(80)] }, 'red-green', 320, 0);
    expect(tracker.update({ anchor: [blob(238), blob(10)], guide: [blob(81)] }, 'red-green', 320, 50).valid).toBe(true);
    expect(tracker.update({ anchor: [blob(235), blob(241)], guide: [blob(81)] }, 'red-green', 320, 100)).toMatchObject({ reason: 'AMBIGUOUS_BLOBS' });
  });
});
describe('smoothing and neutral recovery', () => {
  it('uses elapsed time, not sample count', () => {
    const a = new PairSmoother(), b = new PairSmoother(); a.update(pair(.2), 0); b.update(pair(.2), 0);
    const once = a.update(pair(.5), 100); b.update(pair(.5), 40); const twice = b.update(pair(.5), 100);
    expect(once.guide.x).toBeCloseTo(twice.guide.x, 10);
    a.reset(); expect(a.update(pair(.8), 150)).toEqual(pair(.8));
  });
  it('requires sequential 500ms visible + 500ms neutral; invalid/gap resets, stretching after readiness does not', () => {
    const gate = new RearmGate();
    for (let t = 0; t < 1000; t += 50) expect(gate.update(t, 0.1)).toBe(false);
    expect(gate.update(1000, .1)).toBe(true); expect(gate.update(1050, .9)).toBe(true);
    expect(gate.update(1400, .1)).toBe(false); gate.reset(); expect(gate.update(1450, .1)).toBe(false);
  });
});
