import defaults from '../shared/defaults.json';
import type { BlobCandidate, ColorId } from '../shared/vision-worker';
import type { GloveMode, HandPair, PairResult, Point } from './types';
import { distance } from './types';

const point = (blob: BlobCandidate, width: number): Point => ({ x: 1 - blob.cx / width, y: blob.cy / width });
export class PairTracker {
  private previous: HandPair | null = null;
  private atMs = -Infinity;
  reset(): void { this.previous = null; this.atMs = -Infinity; }
  update(candidates: Record<ColorId, BlobCandidate[]>, mode: GloveMode, width: number, atMs: number): PairResult {
    if (atMs - this.atMs > defaults.transport.maxSampleAgeMs) this.reset();
    const anchor = candidates.anchor.map(blob => point(blob, width));
    const guide = candidates.guide.map(blob => point(blob, width));
    const fail = (reason: Exclude<PairResult, { valid: true }>['reason']): PairResult => {
      this.reset(); return { valid: false, reason };
    };
    if (anchor.length < (mode === 'green-green' ? 2 : 1) || (mode === 'red-green' && !guide.length)) return fail('COLOR_MISSING');
    const choices: HandPair[] = [];
    if (mode === 'green-green') {
      // Both masks are identical. Use ONE candidate list, never pair a blob with its duplicate.
      for (let i = 0; i < anchor.length; i++) for (let j = i + 1; j < anchor.length; j++) {
        const [a, b] = [anchor[i], anchor[j]].sort((a, b) => a.x - b.x);
        choices.push({ anchor: a, guide: b });
      }
    } else for (const a of anchor) for (const b of guide) choices.push({ anchor: a, guide: b });
    let pair: HandPair;
    if (!this.previous) {
      if (choices.length !== 1) return fail('AMBIGUOUS_BLOBS');
      pair = choices[0];
    } else {
      const previous = this.previous;
      const ranked = choices.map(pair => ({ pair, a: distance(pair.anchor, previous.anchor), b: distance(pair.guide, previous.guide) }))
        .filter(item => Math.max(item.a, item.b) <= defaults.vision.maxCentroidJumpWidthRatio)
        .sort((a, b) => a.a + a.b - b.a - b.b);
      if (!ranked.length) return fail('POSITION_JUMP');
      if (ranked[1] && ranked[1].a + ranked[1].b - ranked[0].a - ranked[0].b < 0.04) return fail('AMBIGUOUS_BLOBS');
      pair = ranked[0].pair;
    }
    if (distance(pair.anchor, pair.guide) < 0.055) return fail('PAIR_TOO_CLOSE');
    // Equal colours cannot establish anatomical identity at a crossing/vertical overlap.
    if (mode === 'green-green' && pair.guide.x - pair.anchor.x < 0.035) return fail('AMBIGUOUS_BLOBS');
    this.previous = pair; this.atMs = atMs;
    return { valid: true, pair, reason: 'NONE' };
  }
}
