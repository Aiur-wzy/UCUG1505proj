import defaults from '../../shared/defaults.json';
import type { Point } from '../core/gameState';

export interface DiskBounds { minX: number; maxX: number; minY: number }
export interface WallCoefficients { left: number | null; right: number | null; top: number | null }
/** Exact circle/group boundary response, including low-speed and grazing contacts.
 * Matter still integrates motion and resolves bird contacts; its resting-contact
 * solver must not absorb the arcade rink's wall bounce. No lower wall exists. */
export function reflectWalls(bounds: DiskBounds, incoming: Point, walls: WallCoefficients) {
  const velocity = { ...incoming }, shift = { x: 0, y: 0 }, hits: ('left' | 'right' | 'top')[] = [];
  if (bounds.minY > defaults.world.height) return { velocity, shift, hits };
  if (walls.left !== null && bounds.minX <= 0) {
    const rebound = incoming.x < 0;
    shift.x = -bounds.minX * (rebound ? 1 + walls.left : 1);
    if (rebound) { velocity.x = -incoming.x * walls.left; hits.push('left'); }
  } else if (walls.right !== null && bounds.maxX >= defaults.world.width) {
    const rebound = incoming.x > 0;
    shift.x = (defaults.world.width - bounds.maxX) * (rebound ? 1 + walls.right : 1);
    if (rebound) { velocity.x = -incoming.x * walls.right; hits.push('right'); }
  }
  if (walls.top !== null && bounds.minY <= 0) {
    const rebound = incoming.y < 0;
    shift.y = -bounds.minY * (rebound ? 1 + walls.top : 1);
    if (rebound) { velocity.y = -incoming.y * walls.top; hits.push('top'); }
  }
  return { velocity, shift, hits };
}
