import defaults from '../shared/defaults.json';
import type { HandPair, Point } from './types';

export class PairSmoother {
  private pair: HandPair | null = null;
  private atMs = -Infinity;
  reset(): void { this.pair = null; this.atMs = -Infinity; }
  update(next: HandPair, atMs: number): HandPair {
    const dt = atMs - this.atMs;
    if (!this.pair || dt <= 0 || dt > defaults.transport.maxSampleAgeMs) this.pair = structuredClone(next);
    else {
      const alpha = 1 - Math.exp(-dt / defaults.vision.ewmaTauMs);
      const blend = (a: Point, b: Point): Point => ({ x: a.x + alpha * (b.x - a.x), y: a.y + alpha * (b.y - a.y) });
      this.pair = { anchor: blend(this.pair.anchor, next.anchor), guide: blend(this.pair.guide, next.guide) };
    }
    this.atMs = atMs; return structuredClone(this.pair);
  }
}
export class RearmGate {
  private validSince: number | null = null;
  private neutralSince: number | null = null;
  private lastAt = -Infinity;
  private ready = false;
  reset(): void { this.validSince = null; this.neutralSince = null; this.lastAt = -Infinity; this.ready = false; }
  update(atMs: number, r: number): boolean {
    if (atMs <= this.lastAt || atMs - this.lastAt > defaults.transport.maxSampleAgeMs) this.reset();
    this.lastAt = atMs;
    this.validSince ??= atMs;
    if (this.ready) return true;
    if (atMs - this.validSince < defaults.vision.reacquireHoldMs) return false;
    if (r > defaults.gesture.rearmNeutralMaxR) this.neutralSince = null;
    else this.neutralSince ??= atMs;
    this.ready = this.neutralSince !== null && atMs - this.neutralSince >= defaults.gesture.rearmHoldMs;
    return this.ready;
  }
}
