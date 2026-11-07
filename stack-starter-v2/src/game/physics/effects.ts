import defaults from '../../shared/defaults.json';
import type { Point } from '../core/gameState';

export interface EffectState { phase: 'pending' | 'active' | 'done'; lowMs: number; activeMs: number; activations: number }
export const newEffect = (repel: boolean): EffectState => ({ phase: repel ? 'pending' : 'done', lowMs: 0, activeMs: 0, activations: 0 });
export function advanceEffect(effect: EffectState, slow: boolean, inPlay: boolean, delta: number): void {
  if (!inPlay) { effect.phase = 'done'; return; }
  if (effect.phase === 'pending') {
    effect.lowMs = slow ? effect.lowMs + delta : 0;
    if (effect.lowMs + 1e-7 >= defaults.effects.repel.triggerLowSpeedMs) { effect.phase = 'active'; effect.activations++; }
  } else if (effect.phase === 'active') {
    effect.activeMs += delta;
    if (effect.activeMs + 1e-7 >= defaults.effects.repel.durationMs) effect.phase = 'done';
  }
}
export function repelImpulse(source: Point & { id: string }, target: Point & { id: string }): Point {
  const dx = target.x - source.x, dy = target.y - source.y, distance = Math.hypot(dx, dy);
  if (distance >= defaults.effects.repel.radius) return { x: 0, y: 0 };
  const strength = defaults.effects.repel.deltaVelocityPerTick * (1 - distance / defaults.effects.repel.radius);
  return distance < 1e-9 ? { x: source.id < target.id ? strength : -strength, y: 0 } : { x: dx / distance * strength, y: dy / distance * strength };
}
