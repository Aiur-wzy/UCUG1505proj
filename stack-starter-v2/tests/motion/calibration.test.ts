import { describe, expect, it } from 'vitest';
import { CalibrationSampler, makeProfile } from '../../src/motion/calibration';
import { colorConfig, sampleHue, validateColors } from '../../src/motion/colors';
import { mapPair } from '../../src/motion/mapping';
import { pair } from './helpers';
const config = colorConfig('red-green');
const profile = makeProfile('A', 1, 'red-green', config, 0, .15, .65, 1);
describe('calibration and vector mapping', () => {
  it('requires 1 second of continuous stable observations, rejects interruption and moving samples', () => {
    const sampler = new CalibrationSampler();
    for (let t = 0; t <= 1000; t += 50) sampler.add(pair(.2), t);
    expect(sampler.finish().distance).toBeCloseTo(.2);
    sampler.reset(); sampler.add(pair(.2), 0); sampler.add(pair(.2), 500); expect(() => sampler.finish()).toThrow();
    sampler.reset(); for (let t = 0; t <= 1000; t += 50) sampler.add(pair(t < 500 ? .2 : .4), t); expect(() => sampler.finish()).toThrow('姿势变化');
  });
  it('averages the angle across the red-like +/-180-degree seam', () => {
    const sampler = new CalibrationSampler(); for (let t = 0; t <= 1000; t += 50) sampler.add(pair(.2, t % 100 ? 179 : -179), t);
    expect(Math.abs(sampler.finish().angle)).toBeGreaterThan(178);
  });
  it('rejects degenerate profiles instead of outputting NaN', () => {
    expect(() => makeProfile('A', 1, 'red-green', config, 0, .01, .7, 1)).toThrow('近距离');
    expect(() => makeProfile('A', 1, 'red-green', config, 0, .4, .4, 1)).toThrow('远近');
  });
  it('maps the same vector to independent angle and power, with the 0.30 dead zone', () => {
    expect(mapPair(pair(.3, 30), profile, 50)).toMatchObject({ aimDeg: 30, power01: 0 });
    expect(mapPair(pair(.65, -35), profile, 100).power01).toBeCloseTo(1);
    expect(mapPair(pair(.65, 120), profile, 150).aimDeg).toBe(90);
    expect(mapPair(pair(.65, 30), { ...profile, sign: -1 }, 200).aimDeg).toBeCloseTo(-30);
  });
  it('keeps per-player calibration distances independent', () => {
    const b = makeProfile('B', 1, 'red-green', config, 0, .25, .75, 1);
    expect(mapPair(pair(.65), profile, 0).r).toBeCloseTo(1); expect(mapPair(pair(.65), b, 0).r).toBeCloseTo(.8);
  });
  it('takes a circular red hue and rejects grey; same green is explicit, not overlapping red-green thresholds', () => {
    const red = new Uint8ClampedArray(Array.from({ length: 12 }, (_, i) => i % 2 ? [255, 0, 10, 255] : [255, 10, 0, 255]).flat());
    const hue = sampleHue(red); expect(Math.min(hue, 360 - hue)).toBeLessThan(2);
    expect(() => sampleHue(new Uint8ClampedArray(40).fill(100))).toThrow();
    expect(() => validateColors(colorConfig('green-green'), 'red-green')).toThrow();
    expect(() => validateColors(colorConfig('green-green'), 'green-green')).not.toThrow();
  });
});
