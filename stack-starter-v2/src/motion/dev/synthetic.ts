import type { GloveMode, Point } from '../types';
export interface SyntheticSettings {
  angle: number; distance: number; midpointX: number; midpointY: number;
  noise: number; brightness: number; hideAnchor: boolean; hideGuide: boolean; distractor: boolean;
}
/** Actual RGBA frames, not fabricated detections. Canvas is unmirrored like a camera. */
export class SyntheticScene {
  readonly settings: SyntheticSettings = { angle: 0, distance: 100, midpointX: 160, midpointY: 125,
    noise: 0.35, brightness: 1, hideAnchor: false, hideGuide: false, distractor: false };
  mode: GloveMode = 'red-green';
  constructor(readonly canvas: HTMLCanvasElement) {}
  set(settings: Partial<SyntheticSettings>): void { Object.assign(this.settings, settings); this.draw(); }
  positions(): { anchor: Point; guide: Point } {
    const s = this.settings, dx = Math.cos(s.angle * Math.PI / 180) * s.distance / 2, dy = -Math.sin(s.angle * Math.PI / 180) * s.distance / 2;
    return { anchor: { x: s.midpointX - dx, y: s.midpointY - dy }, guide: { x: s.midpointX + dx, y: s.midpointY + dy } };
  }
  move(hand: 'anchor' | 'guide', point: Point): void {
    const pair = this.positions(); pair[hand] = point;
    const dx = pair.guide.x - pair.anchor.x, dy = pair.guide.y - pair.anchor.y;
    this.set({ midpointX: (pair.anchor.x + pair.guide.x) / 2, midpointY: (pair.anchor.y + pair.guide.y) / 2,
      distance: Math.hypot(dx, dy), angle: Math.atan2(-dy, dx) * 180 / Math.PI });
  }
  draw = (): void => {
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    const w = this.canvas.width, h = this.canvas.height, s = this.settings;
    let seed = 78231;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ctx.fillStyle = '#242f37'; ctx.fillRect(0, 0, w, h);
    // Deterministic clutter makes threshold changes comparable across runs.
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `hsl(${random() * 360} 14% ${14 + random() * 25}%)`;
      ctx.fillRect(random() * w, random() * h, 10 + random() * 50, 8 + random() * 35);
    }
    for (let i = 0; i < Math.round(s.noise * 1800); i++) {
      ctx.fillStyle = `hsl(${random() * 360} 85% ${35 + random() * 30}%)`;
      ctx.fillRect(random() * w, random() * h, 1 + random() * 3, 1 + random() * 3);
    }
    if (s.distractor) { ctx.fillStyle = '#00df40'; ctx.fillRect(w - 170, 25, 22, 28); }
    const pair = this.positions();
    for (const hand of ['anchor', 'guide'] as const) {
      if (hand === 'anchor' ? s.hideAnchor : s.hideGuide) continue;
      const p = pair[hand]; ctx.fillStyle = hand === 'guide' && this.mode === 'red-green' ? '#f62535' : '#00df40';
      ctx.fillRect(w - p.x - 10, p.y - 14, 20, 28);
    }
    if (s.brightness < 1) { ctx.fillStyle = `rgba(0,0,0,${1 - s.brightness})`; ctx.fillRect(0, 0, w, h); }
  };
}
