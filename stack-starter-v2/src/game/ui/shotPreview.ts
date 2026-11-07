import type Phaser from 'phaser';
import type { GameState } from '../core/gameState';
import { predictPath } from '../physics/shotMath';

export function drawShotPreview(graphics: Phaser.GameObjects.Graphics, state: GameState): void {
  const context = state.context, origin = state.origin, shot = context.lockedShot ?? context.previewShot;
  if (!origin || !['select', 'adjust', 'armed'].includes(context.phase)) return;
  const color = context.phase === 'armed' ? 0xd18b43 : 0x365d59;
  graphics.lineStyle(2, color, 0.55).strokeCircle(origin.x, origin.y, 26);
  graphics.lineBetween(origin.x - 36, origin.y, origin.x - 29, origin.y);
  graphics.lineBetween(origin.x + 29, origin.y, origin.x + 36, origin.y);
  if (!shot || context.phase === 'select') return;
  const path = predictPath(origin, shot, state.balls);
  graphics.lineStyle(2.5, color, 0.65);
  for (let i = 1; i < path.points.length; i++) if (i % 2) graphics.lineBetween(path.points[i - 1].x, path.points[i - 1].y, path.points[i].x, path.points[i].y);
  graphics.lineStyle(2, path.event === 'out' ? 0xc5684d : color, 0.9).strokeCircle(path.end.x, path.end.y, path.event === 'collision' ? 9 : 18);
  graphics.fillStyle(color, 0.7).fillCircle(path.end.x, path.end.y, 3);
  const angle = shot.aimDeg * Math.PI / 180, endX = origin.x + Math.sin(angle) * 62, endY = origin.y - Math.cos(angle) * 62;
  graphics.lineStyle(4, color, 1).lineBetween(origin.x, origin.y, endX, endY);
  graphics.lineBetween(endX, endY, endX - Math.sin(angle + 0.6) * 14, endY + Math.cos(angle + 0.6) * 14);
  graphics.lineBetween(endX, endY, endX - Math.sin(angle - 0.6) * 14, endY + Math.cos(angle - 0.6) * 14);
}
