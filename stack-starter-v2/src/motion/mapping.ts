import defaults from '../shared/defaults.json';
import type { CalibrationProfile, HandPair, Observation } from './types';
import { clamp, distance } from './types';

export const wrapDeg = (deg: number): number => ((deg + 180) % 360 + 360) % 360 - 180;
export const pairAngle = (pair: HandPair): number => Math.atan2(-(pair.guide.y - pair.anchor.y), pair.guide.x - pair.anchor.x) * 180 / Math.PI;
export function mapPair(pair: HandPair, profile: CalibrationProfile, atMs: number,
  limits = defaults.shotLimits): Observation {
  const span = profile.dFar - profile.dClose;
  if (!(span >= defaults.calibration.minimumSpanWidthRatio)) throw new Error('Invalid calibration distance span');
  const r = clamp((distance(pair.anchor, pair.guide) - profile.dClose) / span);
  return { pair, atMs, r, rearmed: false,
    midpoint: { x: (pair.anchor.x + pair.guide.x) / 2, y: (pair.anchor.y + pair.guide.y) / 2 },
    aimDeg: clamp(profile.sign * wrapDeg(pairAngle(pair) - profile.theta0Deg), limits.aimMinDeg, limits.aimMaxDeg),
    power01: clamp((r - defaults.gesture.powerStartR) / (1 - defaults.gesture.powerStartR)) };
}
