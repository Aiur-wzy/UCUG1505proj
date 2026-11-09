import defaults from '../shared/defaults.json';
import type { ColorSpec, VisionConfig } from '../shared/vision-worker';
import type { GloveMode } from './types';
export function colorConfig(mode: GloveMode): VisionConfig {
  const spec = (id: ColorSpec['id'], hueDeg: number): ColorSpec => ({ id, hueDeg,
    halfWidthDeg: defaults.vision.hueHalfWidthDeg, saturationMin: defaults.vision.saturationMin, valueMin: defaults.vision.valueMin });
  return { width: defaults.vision.width, height: defaults.vision.height,
    colors: [spec('anchor', 120), spec('guide', mode === 'red-green' ? 0 : 120)],
    minAreaPx: defaults.vision.minBlobPixels, maxAreaRatio: defaults.vision.maxBlobFrameRatio };
}
export function hueDistance(a: number, b: number): number { return Math.abs(((a - b + 540) % 360) - 180); }
/** Circular hue mean excludes dark/grey highlights instead of averaging through red's 0° seam. */
export function sampleHue(pixels: Uint8ClampedArray): number {
  let sx = 0, sy = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (max < 0.2 || delta / max < 0.35) continue;
    const raw = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    const angle = raw * Math.PI / 3; sx += Math.cos(angle); sy += Math.sin(angle); count++;
  }
  if (count < 9 || Math.hypot(sx, sy) / count < 0.8) throw new Error('取色区域不够鲜明，请点击手套中央并避开高光');
  return (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
}
export function validateColors(config: VisionConfig, mode: GloveMode): void {
  const [a, b] = config.colors;
  if (mode === 'red-green' && hueDistance(a.hueDeg, b.hueDeg) < Math.max(defaults.vision.minimumColorSeparationDeg, a.halfWidthDeg + b.halfWidthDeg)) {
    throw new Error('红绿模式需要两种可区分颜色；两只绿色手套请切换到双绿模式');
  }
}
