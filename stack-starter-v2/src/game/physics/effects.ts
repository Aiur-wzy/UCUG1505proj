import defaults from '../../shared/defaults.json';
import type { Point } from '../core/gameState';
import type { BallTypeId } from '../config/ballDefinitions';

export type RadialType = 'repel' | 'attract';
export interface EffectState { kind: RadialType | null; phase: 'pending' | 'active' | 'done'; lowMs: number; activeMs: number; activations: number }
export const newEffect = (type: BallTypeId): EffectState => ({ kind: type === 'repel' || type === 'attract' ? type : null, phase: type === 'repel' || type === 'attract' ? 'pending' : 'done', lowMs: 0, activeMs: 0, activations: 0 });
export function advanceEffect(effect: EffectState, slow: boolean, inPlay: boolean, delta: number): void {
  if (!inPlay || !effect.kind) { effect.phase = 'done'; return; }
  const config = defaults.effects[effect.kind];
  if (effect.phase === 'pending') {
    effect.lowMs = slow ? effect.lowMs + delta : 0;
    if (effect.lowMs + 1e-7 >= config.triggerLowSpeedMs) { effect.phase = 'active'; effect.activations++; }
  } else if (effect.phase === 'active') {
    effect.activeMs += delta;
    if (effect.activeMs + 1e-7 >= config.durationMs) effect.phase = 'done';
  }
}
export function radialImpulse(source: Point & { id: string }, target: Point & { id: string }, kind: RadialType): Point {
  const config = defaults.effects[kind];
  const dx = target.x - source.x, dy = target.y - source.y, distance = Math.hypot(dx, dy);
  if (distance >= config.radius) return { x: 0, y: 0 };
  // Already touching: attraction must not keep accelerating balls into each other.
  if (kind === 'attract' && distance <= defaults.world.ballRadius * 2) return { x: 0, y: 0 };
  const strength = config.deltaVelocityPerTick * (1 - distance / config.radius) * (kind === 'attract' ? -1 : 1);
  return distance < 1e-9 ? { x: source.id < target.id ? strength : -strength, y: 0 } : { x: dx / distance * strength, y: dy / distance * strength };
}
export const repelImpulse = (source: Point & { id: string }, target: Point & { id: string }) => radialImpulse(source, target, 'repel');
