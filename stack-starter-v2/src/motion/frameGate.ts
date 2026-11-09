import defaults from '../shared/defaults.json';
import type { ControlContext } from '../shared/contract';
import type { FrameToken } from '../shared/vision-worker';

export function sameFrame(a: FrameToken | null, b: FrameToken): boolean {
  return !!a && a.generation === b.generation && a.frameId === b.frameId;
}
/** Identity validation is independent of releasing the matching in-flight slot. */
export function acceptFrame(token: FrameToken, context: ControlContext, generation: number,
  configVersion: number, lastAccepted: number, now: number): boolean {
  const age = now - token.sampleAtMs;
  return token.generation === generation && token.configVersion === configVersion &&
    token.sessionId === context.sessionId && token.contextId === context.contextId &&
    token.turnId === context.turnId && token.playerId === context.activePlayerId &&
    token.source === context.previewSource && Number.isSafeInteger(token.frameId) &&
    token.frameId > lastAccepted && Number.isFinite(age) &&
    age >= -defaults.transport.futureToleranceMs && age <= defaults.transport.maxSampleAgeMs;
}
export function trackingIdentity(context: ControlContext): string {
  return JSON.stringify([context.sessionId, context.turnId, context.activePlayerId, context.previewSource]);
}
