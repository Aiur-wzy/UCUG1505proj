import defaults from '../../shared/defaults.json';
export interface StickyState { phase: 'ready' | 'attached' | 'done'; targetId: string | null; lowMs: number; activations: number }
export const newSticky = (): StickyState => ({ phase: 'ready', targetId: null, lowMs: 0, activations: 0 });
export function attachSticky(state: StickyState, targetId: string): boolean {
  if (state.phase !== 'ready' || state.activations >= defaults.effects.sticky.maxActivations) return false;
  state.phase = 'attached'; state.targetId = targetId; state.activations++; return true;
}
/** Release an active bond; PhysicsWorld also expires unused effects at turn completion. */
export function shouldReleaseSticky(state: StickyState, bothSlow: boolean, bothInPlay: boolean, delta: number): boolean {
  if (state.phase !== 'attached') return false;
  state.lowMs = bothSlow ? state.lowMs + delta : 0;
  return !bothInPlay || state.lowMs + 1e-7 >= defaults.effects.sticky.settleHoldMs;
}
export function finishSticky(state: StickyState): void { state.phase = 'done'; state.targetId = null; state.lowMs = 0; }
