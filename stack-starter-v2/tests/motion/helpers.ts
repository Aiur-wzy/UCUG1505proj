import type { ControlContext } from '../../src/shared/contract';
import type { BlobCandidate, FrameToken } from '../../src/shared/vision-worker';
import type { HandPair, Observation } from '../../src/motion/types';
export const context = (overrides: Partial<ControlContext> = {}): ControlContext => ({
  protocolVersion: '1.1', sessionId: 's', contextId: 1, turnId: 1, scene: 'play', phase: 'select', activePlayerId: 'A',
  previewSource: 'motion', inputEnabled: true, motionEnabled: true, allowedCommands: ['SELECT_BALL'], motionActionsEnabled: ['SELECT_BALL', 'PREVIEW_SHOT'],
  ballOptions: ['normal', 'repel', 'attract', 'sticky'].map(id => ({ id, label: id, remaining: 1 })), selectedBallId: null, previewShot: null, lockedShot: null,
  limits: { aimMinDeg: -90, aimMaxDeg: 90, powerMin01: 0, powerMax01: 1 }, ...overrides,
});
export const token = (overrides: Partial<FrameToken> = {}): FrameToken => ({ generation: 1, sessionId: 's', contextId: 1, turnId: 1, playerId: 'A', source: 'motion', configVersion: 1, frameId: 1, sampleAtMs: 1000, ...overrides });
export const blob = (cx: number, cy = 120): BlobCandidate => ({ cx, cy, areaPx: 600, x: cx - 10, y: cy - 15, width: 20, height: 30 });
export const pair = (d: number, angle = 0, mx = 0.5): HandPair => {
  const dx = Math.cos(angle * Math.PI / 180) * d / 2, dy = -Math.sin(angle * Math.PI / 180) * d / 2;
  return { anchor: { x: mx - dx, y: 0.375 - dy }, guide: { x: mx + dx, y: 0.375 + dy } };
};
export const observation = (atMs: number, overrides: Partial<Observation> = {}): Observation => ({ atMs, r: 0.1, aimDeg: 12, power01: 0.3, rearmed: true, pair: pair(0.2), midpoint: { x: 0.22, y: 0.375 }, ...overrides });
