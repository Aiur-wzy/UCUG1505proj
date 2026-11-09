import { describe, expect, it } from 'vitest';
import { MotionGestures } from '../../src/motion/gestures';
import { context, observation } from './helpers';
describe('phase-one hybrid input', () => {
  it('dwell selects once after 600ms, including slot hysteresis', () => {
    const g = new MotionGestures(), c = context();
    for (let t = 0; t < 600; t += 50) expect(g.update(c, observation(t)).intent).toBeNull();
    expect(g.update(c, observation(600)).intent).toEqual({ type: 'SELECT_BALL', payload: { ballTypeId: 'normal' } });
    expect(g.update(c, observation(650)).intent).toBeNull();
  });
  it('interruption, stretched hands, and unavailable inventory prevent confirmation', () => {
    const g = new MotionGestures(), c = context();
    for (let t = 0; t <= 400; t += 50) g.update(c, observation(t)); g.reset();
    expect(g.update(c, observation(600)).intent).toBeNull();
    expect(g.update(c, observation(650, { r: .5 })).intent).toBeNull();
    c.ballOptions[0].remaining = 0;
    for (let t = 700; t <= 1800; t += 50) expect(g.update(c, observation(t)).intent).toBeNull();
  });
  it('continuous moving preview does not wait for stability and stays <=20Hz', () => {
    const g = new MotionGestures(), c = context({ phase: 'adjust', allowedCommands: ['PREVIEW_SHOT', 'ARM_SHOT', 'CANCEL_SHOT'] });
    const sent = [];
    for (let t = 0; t < 1000; t += 10) { const intent = g.update(c, observation(t, { aimDeg: t / 100, power01: t / 1000 })).intent; if (intent) sent.push(intent); }
    expect(sent).toHaveLength(20); expect(sent.at(-1)).toMatchObject({ type: 'PREVIEW_SHOT', payload: { aimDeg: 9.5, power01: .95 } });
  });
  it('never sends arm/fire/cancel, even if the host advertises optional actions', () => {
    const g = new MotionGestures(), c = context({ phase: 'armed', allowedCommands: ['FIRE', 'CANCEL_SHOT'], motionActionsEnabled: ['ARM_SHOT', 'FIRE', 'CANCEL_SHOT'] });
    for (let t = 0; t <= 2000; t += 50) expect(g.update(c, observation(t, { r: t < 1000 ? .9 : .05 })).intent).toBeNull();
  });
  it.each([{ motionEnabled: false }, { inputEnabled: false }, { previewSource: 'keyboard' as const }, { motionActionsEnabled: [] }])('respects input/source/action gates %j', patch => {
    const g = new MotionGestures(), c = context({ phase: 'adjust', allowedCommands: ['PREVIEW_SHOT'], ...patch });
    expect(g.update(c, observation(0)).intent).toBeNull();
  });
});
