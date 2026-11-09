import { describe, expect, it } from 'vitest';
import { acceptFrame, sameFrame, trackingIdentity } from '../../src/motion/frameGate';
import { context, token } from './helpers';
describe('vision frame identity and time', () => {
  it('accepts only the original main-thread capture time', () => { expect(acceptFrame(token(), context(), 1, 1, 0, 1050)).toBe(true); expect(token().sampleAtMs).toBe(1000); });
  it.each([{ generation: 0 }, { sessionId: 'old' }, { contextId: 0 }, { turnId: 0 }, { playerId: 'B' as const }, { source: 'keyboard' as const }, { configVersion: 2 }, { frameId: 0 }, { sampleAtMs: 700 }, { sampleAtMs: 1101 }, { sampleAtMs: NaN }])('rejects a mismatched/stale token %j', patch => expect(acceptFrame(token(patch), context(), 1, 1, 0, 1050)).toBe(false));
  it('drops duplicate and out-of-order frames', () => expect(acceptFrame(token({ frameId: 7 }), context(), 1, 1, 8, 1050)).toBe(false));
  it('old generations cannot release a new in-flight slot', () => { expect(sameFrame(token(), token({ generation: 0 }))).toBe(false); expect(sameFrame(token(), token({ contextId: 0 }))).toBe(true); });
  it('ordinary phase/gate changes preserve tracking identity; player/turn/source/session changes do not', () => {
    expect(trackingIdentity(context())).toBe(trackingIdentity(context({ phase: 'adjust', contextId: 9, motionEnabled: false })));
    for (const patch of [{ activePlayerId: 'B' as const }, { turnId: 2 }, { sessionId: 'new' }, { previewSource: 'keyboard' as const }]) expect(trackingIdentity(context(patch))).not.toBe(trackingIdentity(context()));
  });
});
