import Phaser from 'phaser';
import defaults from '../../shared/defaults.json';
import type { GameState } from '../core/gameState';
import { levels } from '../config/levels';
import { ballDefinitions } from '../config/ballDefinitions';
import { PhysicsWorld } from '../physics/physicsWorld';
import { drawShotPreview } from '../ui/shotPreview';
import type { GameAudio } from '../audio';

export class PlayScene extends Phaser.Scene {
  world!: PhysicsWorld;
  private graphics!: Phaser.GameObjects.Graphics;
  private field!: Phaser.GameObjects.Graphics;
  private state: GameState | null = null;
  private fieldKey = '';
  private owners: Phaser.GameObjects.Text[] = [];
  private zoneLabels: Phaser.GameObjects.Text[] = [];
  private onTick: (() => void) | null = null;
  constructor(private ready: (scene: PlayScene) => void, private audio: GameAudio) { super('PlayScene'); }
  create(): void {
    this.field = this.add.graphics(); this.graphics = this.add.graphics();
    this.world = new PhysicsWorld(this,
      (session, shot, balls) => this.events.emit('settled', session, shot, balls),
      message => this.events.emit('diagnostic', message));
    const collision = () => { if (this.state?.context.phase === 'resolving' && !this.state.paused) this.audio.play('collision'); };
    this.matter.world.on('collisionstart', collision);
    for (let i = 0; i < 8; i++) this.owners.push(this.add.text(0, 0, '', { fontFamily: 'Segoe UI, sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#24474a' }).setOrigin(0.5));
    for (let i = 0; i < 3; i++) this.zoneLabels.push(this.add.text(0, 0, '', { fontFamily: 'Segoe UI, sans-serif', fontSize: '13px', color: '#52746a' }).setOrigin(0.5));
    this.events.once('shutdown', () => { this.world.destroy(); this.matter.world.off('collisionstart', collision); this.events.removeAllListeners('settled'); this.events.removeAllListeners('diagnostic'); });
    this.ready(this);
  }
  bindTick(tick: () => void): void { this.onTick = tick; }
  setState(state: GameState): void { this.state = state; }
  private drawField(): void {
    if (!this.state) return;
    const key = `${this.state.mode}-${this.state.levelIndex}`;
    if (key === this.fieldKey) return;
    this.fieldKey = key;
    const g = this.field, { width, height, house } = defaults.world;
    g.clear().fillStyle(0xe9f0e7).fillRect(0, 0, width, height);
    g.lineStyle(1, 0xc8d8ca, 0.7);
    for (let x = 25; x < width; x += 25) for (let y = 25; y < height; y += 25) g.fillStyle(0xb1c6b6, 0.45).fillCircle(x, y, 0.85);
    g.lineStyle(1.5, 0x8fab9f).strokeRoundedRect(16, 16, width - 32, height - 32, 10);
    const radii = this.state.mode === 'solo' ? levels[this.state.levelIndex].zoneRadii : [house.radius, 85, 40];
    const colors = [0xc0d9c9, 0xf8f5e9, 0xe9b394];
    radii.forEach((radius, index) => {
      g.fillStyle(colors[index], 1).fillCircle(house.x, house.y, radius).lineStyle(1.5, 0x688c78, 0.65).strokeCircle(house.x, house.y, radius);
      this.zoneLabels[index].setText(this.state!.mode === 'solo' ? `${index + 1} 分` : '').setPosition(house.x, house.y + radius - 17);
    });
    g.lineStyle(1, 0x688c78, 0.6).lineBetween(house.x - 8, house.y, house.x + 8, house.y).lineBetween(house.x, house.y - 8, house.x, house.y + 8);
    g.lineStyle(2, 0xda9e82, 0.8).lineBetween(50, 565, 950, 565);
    g.lineStyle(1, 0x78968a, 0.4).lineBetween(50, 610, 950, 610);
    for (let x = 50; x <= 950; x += 50) g.lineBetween(x, 606, x, 614);
  }
  update(_time: number, delta: number): void {
    this.onTick?.(); this.world?.update(delta);
    if (!this.state || !this.graphics) return;
    this.drawField(); const g = this.graphics; g.clear();
    for (const [index, ball] of this.world.balls.entries()) {
      this.owners[index]?.setVisible(ball.inPlay);
      if (!ball.inPlay) continue;
      for (let i = 1; i < ball.trail.length; i++) g.lineStyle(3, ball.ownerId === 'A' ? 0x66a49a : 0xd78c70, i / ball.trail.length * 0.25).lineBetween(ball.trail[i - 1].x, ball.trail[i - 1].y, ball.trail[i].x, ball.trail[i].y);
      if (ball.effect.phase === 'active') {
        g.fillStyle(0xe9b76c, 0.08).fillCircle(ball.x, ball.y, defaults.effects.repel.radius);
        g.lineStyle(2, 0xd3a052, 0.5).strokeCircle(ball.x, ball.y, 25 + ball.effect.activeMs / defaults.effects.repel.durationMs * 95);
      }
      this.drawBird(ball.x, ball.y, ball.typeId, ball.ownerId);
      this.owners[index].setText(ball.ownerId).setPosition(ball.x, ball.y + 7);
    }
    for (let i = this.world.balls.length; i < this.owners.length; i++) this.owners[i].setVisible(false);
    if (this.state.context.scene === 'play' && !this.state.paused) drawShotPreview(g, this.state);
    const c = this.state.context;
    Object.assign(this.game.canvas.dataset, { phase: c.phase, aim: String(c.lockedShot?.aimDeg ?? c.previewShot?.aimDeg ?? 0), balls: String(this.world.balls.length), turn: String(c.turnId) });
  }
  private drawBird(x: number, y: number, type: string, owner: string): void {
    const g = this.graphics, fill = ballDefinitions.find(ball => ball.id === type)!.color;
    g.fillStyle(0x24474a, 0.13).fillEllipse(x + 2, y + 7, 41, 30);
    g.fillStyle(fill).fillCircle(x, y, 18).lineStyle(2, owner === 'A' ? 0x325e57 : 0xaf6049).strokeCircle(x, y, 18);
    g.fillStyle(0xfff7e5, 0.8).fillEllipse(x, y + 6, 25, 18);
    g.lineStyle(2, 0x31514a).lineBetween(x - 7, y - 15, x - 10, y - 21).lineBetween(x - 7, y - 15, x - 3, y - 21);
    g.fillStyle(0x24474a).fillCircle(x - 6, y - 5, 2.6).fillCircle(x + 6, y - 5, 2.6);
    g.fillStyle(0xe58d4e).fillTriangle(x - 3, y - 1, x + 3, y - 1, x, y + 3);
    if (type === 'repel') g.lineStyle(1.3, 0xb37c30).strokeCircle(x, y, 22);
  }
}
