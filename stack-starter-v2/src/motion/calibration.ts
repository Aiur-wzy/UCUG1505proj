import defaults from '../shared/defaults.json';
import type { PlayerId } from '../shared/contract';
import type { VisionConfig } from '../shared/vision-worker';
import type { CalibrationProfile, GloveMode, HandPair } from './types';
import { distance } from './types';
import { pairAngle, wrapDeg } from './mapping';

export type CalibrationStep = 'neutral' | 'close' | 'far';
export class CalibrationSampler {
  private samples: { atMs: number; angle: number; distance: number }[] = [];
  reset(): void { this.samples = []; }
  add(pair: HandPair, atMs: number): number {
    const last = this.samples.at(-1);
    if (last && (atMs <= last.atMs || atMs - last.atMs > defaults.transport.maxSampleAgeMs)) this.reset();
    this.samples.push({ atMs, angle: pairAngle(pair), distance: distance(pair.anchor, pair.guide) });
    return Math.min(1, (atMs - this.samples[0].atMs) / defaults.calibration.sampleMs);
  }
  finish(): { angle: number; distance: number } {
    const first = this.samples[0], last = this.samples.at(-1);
    if (!first || !last || last.atMs - first.atMs < defaults.calibration.sampleMs || this.samples.length < 8) throw new Error('请连续保持姿势 1 秒');
    const angles = this.samples.map(s => wrapDeg(s.angle - first.angle));
    const distances = this.samples.map(s => s.distance);
    if (Math.max(...angles) - Math.min(...angles) > 12 || Math.max(...distances) - Math.min(...distances) > 0.035) throw new Error('姿势变化较大，请保持不动后重新采样');
    return { angle: wrapDeg(first.angle + angles.reduce((a, b) => a + b, 0) / angles.length), distance: distances.reduce((a, b) => a + b, 0) / distances.length };
  }
}
export function makeProfile(playerId: PlayerId, version: number, mode: GloveMode, config: VisionConfig,
  theta0Deg: number, dClose: number, dFar: number, sign: 1 | -1): CalibrationProfile {
  if (![theta0Deg, dClose, dFar].every(Number.isFinite)) throw new Error('校准数据不完整');
  if (dClose < defaults.calibration.minimumCloseDistanceWidthRatio) throw new Error('近距离过小，请让两只手套保持可分离');
  if (dFar - dClose < defaults.calibration.minimumSpanWidthRatio) throw new Error('远近距离差不足，请重新采集远距离');
  return { playerId, version, mode, config: structuredClone(config), theta0Deg, dClose, dFar, sign };
}
