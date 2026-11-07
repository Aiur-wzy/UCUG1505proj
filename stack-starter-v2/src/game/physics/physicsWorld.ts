import type Phaser from 'phaser';
import defaults from '../../shared/defaults.json';
import type { BallSnapshot, PhysicsPort, Point, ShotRequest } from '../core/gameState';
import { advanceEffect, newEffect, repelImpulse } from './effects';
import type { EffectState } from './effects';
import { isOutOfPlay, launchVelocity } from './shotMath';
import { isSlow, Settling } from './settling';

type Body = ReturnType<Phaser.Physics.Matter.Factory['circle']>;
export interface WorldBall extends BallSnapshot { body: Body; effect: EffectState; trail: Point[] }
export class PhysicsWorld implements PhysicsPort {
  readonly balls: WorldBall[] = [];
  private accumulator = 0;
  private elapsed = 0;
  private paused = false;
  private settling = new Settling();
  private activeShot: ShotRequest | null = null;
  private warned = false;
  constructor(private scene: Phaser.Scene,
    private onComplete: (sessionId: string, shotId: string, balls: BallSnapshot[]) => void,
    private onDiagnostic: (message: string) => void) {
    scene.matter.world.autoUpdate = false;
    scene.matter.world.setGravity(0, 0);
  }
  spawn(shot: ShotRequest): void {
    if (this.activeShot) throw new Error('A shot is already resolving');
    if (this.balls.some(ball => ball.id === shot.shotId)) throw new Error('Shot already exists');
    if (this.balls.some(ball => ball.inPlay && Math.hypot(ball.x - shot.origin.x, ball.y - shot.origin.y) < ball.radius + defaults.world.ballRadius)) throw new Error('Launch origin is occupied');
    let body: Body | undefined;
    try {
      body = this.scene.matter.add.circle(shot.origin.x, shot.origin.y, defaults.world.ballRadius, {
        frictionAir: defaults.physics.frictionAir, restitution: defaults.physics.restitution,
        friction: 0, frictionStatic: 0, label: shot.shotId,
      });
      this.scene.matter.body.setVelocity(body, launchVelocity(shot));
      this.balls.push({ id: shot.shotId, ownerId: shot.ownerId, typeId: shot.typeId, ...shot.origin,
        radius: defaults.world.ballRadius, inPlay: true, body, effect: newEffect(shot.typeId === 'repel'), trail: [] });
      this.activeShot = structuredClone(shot); this.elapsed = 0; this.accumulator = 0; this.warned = false; this.settling.reset();
    } catch (error) { if (body) this.scene.matter.world.remove(body); throw error; }
  }
  rollback(shotId: string): void {
    const index = this.balls.findIndex(ball => ball.id === shotId);
    if (index >= 0) { this.scene.matter.world.remove(this.balls[index].body); this.balls.splice(index, 1); }
    if (this.activeShot?.shotId === shotId) this.activeShot = null;
  }
  snapshot(): BallSnapshot[] {
    return this.balls.map(({ id, ownerId, typeId, x, y, radius, inPlay }) => ({ id, ownerId, typeId, x, y, radius, inPlay }));
  }
  setPaused(paused: boolean): void { this.paused = paused; this.accumulator = 0; }
  update(delta: number): void {
    if (this.paused || !this.activeShot) { this.accumulator = 0; return; }
    const { stepMs, maxCatchUpSteps } = defaults.physics;
    this.accumulator = Math.min(this.accumulator + Math.max(0, delta), stepMs * maxCatchUpSteps);
    while (this.accumulator + 1e-7 >= stepMs && this.activeShot) { this.accumulator -= stepMs; this.step(stepMs); }
  }
  private step(delta: number): void {
    this.scene.matter.world.step(delta);
    this.elapsed += delta;
    for (const ball of this.balls) {
      if (!ball.inPlay) continue;
      ball.x = ball.body.position.x; ball.y = ball.body.position.y;
      if (ball.body.speed > 0.2) {
        ball.trail.push({ x: ball.x, y: ball.y });
        if (ball.trail.length > 20) ball.trail.shift();
      } else ball.trail.shift();
      if (isOutOfPlay(ball)) { ball.inPlay = false; ball.trail = []; this.scene.matter.world.remove(ball.body); }
      advanceEffect(ball.effect, isSlow(ball.body.speed, ball.body.angularSpeed), ball.inPlay, delta);
    }
    for (const source of this.balls.filter(ball => ball.inPlay && ball.effect.phase === 'active')) {
      for (const target of this.balls.filter(ball => ball.inPlay && ball !== source)) {
        const impulse = repelImpulse(source, target);
        this.scene.matter.body.setVelocity(target.body, { x: target.body.velocity.x + impulse.x, y: target.body.velocity.y + impulse.y });
      }
    }
    const inPlay = this.balls.filter(ball => ball.inPlay);
    const done = this.settling.step(inPlay.every(ball => isSlow(ball.body.speed, ball.body.angularSpeed)), this.balls.every(ball => ball.effect.phase === 'done'), delta);
    if (done && this.activeShot) {
      for (const ball of inPlay) { this.scene.matter.body.setVelocity(ball.body, { x: 0, y: 0 }); this.scene.matter.body.setAngularVelocity(ball.body, 0); ball.trail = []; }
      const shot = this.activeShot; this.activeShot = null; this.accumulator = 0;
      this.onComplete(shot.sessionId, shot.shotId, this.snapshot());
    } else if (!this.warned && this.elapsed > defaults.physics.diagnosticTimeoutMs) {
      this.warned = true; this.onDiagnostic('小鸟仍未停稳。可以继续等待，或重试本局；尚未结算。');
    }
  }
  reset(): void {
    for (const ball of this.balls) if (ball.inPlay) this.scene.matter.world.remove(ball.body);
    this.balls.length = 0; this.activeShot = null; this.accumulator = 0; this.elapsed = 0; this.warned = false; this.settling.reset();
  }
  destroy(): void { this.reset(); }
}
