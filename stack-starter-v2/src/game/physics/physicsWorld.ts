import type Phaser from 'phaser';
import defaults from '../../shared/defaults.json';
import type { BallSnapshot, PhysicsPort, Point, ShotRequest } from '../core/gameState';
import { advanceEffect, newEffect, radialImpulse } from './effects';
import type { EffectState } from './effects';
import { isOutOfPlay, launchVelocity } from './shotMath';
import { isSlow, Settling } from './settling';
import { attachSticky, finishSticky, newSticky, shouldReleaseSticky } from './sticky';
import type { StickyState } from './sticky';

type Body = ReturnType<Phaser.Physics.Matter.Factory['circle']>;
type Constraint = ReturnType<Phaser.Physics.Matter.Factory['constraint']>;
export interface WorldBall extends BallSnapshot { body: Body; effect: EffectState; sticky: StickyState | null; trail: Point[] }
export class PhysicsWorld implements PhysicsPort {
  readonly balls: WorldBall[] = [];
  private accumulator = 0;
  private elapsed = 0;
  private paused = false;
  private settling = new Settling();
  private activeShot: ShotRequest | null = null;
  private warned = false;
  private links = new Map<string, { targetId: string; constraint: Constraint }>();
  constructor(private scene: Phaser.Scene,
    private onComplete: (sessionId: string, shotId: string, balls: BallSnapshot[]) => void,
    private onDiagnostic: (message: string) => void) {
    scene.matter.world.autoUpdate = false;
    scene.matter.world.setGravity(0, 0);
    const { width, height, walls } = defaults.world;
    scene.matter.world.setBounds(0, 0, width, height, walls.thickness, walls.left, walls.right, walls.top, walls.bottom);
    for (const wall of Object.values(scene.matter.world.walls)) if (wall) wall.restitution = defaults.physics.wallRestitution;
    scene.matter.world.on('collisionstart', this.onCollision);
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
        radius: defaults.world.ballRadius, inPlay: true, body, effect: newEffect(shot.typeId), sticky: shot.typeId === 'sticky' ? newSticky() : null, trail: [] });
      this.activeShot = structuredClone(shot); this.elapsed = 0; this.accumulator = 0; this.warned = false; this.settling.reset();
    } catch (error) { if (body) this.scene.matter.world.remove(body); throw error; }
  }
  rollback(shotId: string): void {
    this.releaseLinksFor(shotId);
    const index = this.balls.findIndex(ball => ball.id === shotId);
    if (index >= 0) { this.scene.matter.world.remove(this.balls[index].body); this.balls.splice(index, 1); }
    if (this.activeShot?.shotId === shotId) this.activeShot = null;
  }
  snapshot(): BallSnapshot[] {
    return this.balls.map(({ id, ownerId, typeId, x, y, radius, inPlay }) => ({ id, ownerId, typeId, x, y, radius, inPlay }));
  }
  private onCollision = (event: { pairs: { bodyA: Body; bodyB: Body; restitution: number }[] }): void => {
    if (!this.activeShot || this.paused) return;
    for (const pair of event.pairs) {
      const a = this.balls.find(ball => ball.inPlay && ball.body === pair.bodyA);
      const b = this.balls.find(ball => ball.inPlay && ball.body === pair.bodyB);
      if (!a || !b) continue; // Walls / future obstacles cannot become a sticky partner.
      const busy = (id: string) => this.links.has(id) || [...this.links.values()].some(link => link.targetId === id);
      if (busy(a.id) || busy(b.id)) continue;
      // Only the bird being launched in this turn can originate a special effect.
      const source = a.id === this.activeShot.shotId && a.sticky?.phase === 'ready' ? a
        : b.id === this.activeShot.shotId && b.sticky?.phase === 'ready' ? b : null;
      if (!source) continue;
      const target = source === a ? b : a;
      const constraint = this.scene.matter.add.constraint(source.body, target.body, source.radius + target.radius,
        defaults.effects.sticky.stiffness, { damping: defaults.effects.sticky.damping, label: 'sticky-pair' });
      attachSticky(source.sticky!, target.id);
      this.links.set(source.id, { targetId: target.id, constraint });
      pair.restitution = 0;
      const mass = a.body.mass + b.body.mass;
      const velocity = { x: (a.body.velocity.x * a.body.mass + b.body.velocity.x * b.body.mass) / mass,
        y: (a.body.velocity.y * a.body.mass + b.body.velocity.y * b.body.mass) / mass };
      this.scene.matter.body.setVelocity(a.body, velocity); this.scene.matter.body.setVelocity(b.body, velocity);
    }
  };
  private releaseLink(sourceId: string): void {
    const link = this.links.get(sourceId);
    if (!link) return;
    this.scene.matter.world.removeConstraint(link.constraint);
    for (const id of [sourceId, link.targetId]) {
      const state = this.balls.find(ball => ball.id === id)?.sticky;
      if (state?.phase === 'attached') finishSticky(state);
    }
    this.links.delete(sourceId);
  }
  private releaseLinksFor(id: string): void {
    for (const [sourceId, link] of this.links) if (sourceId === id || link.targetId === id) this.releaseLink(sourceId);
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
      if (isOutOfPlay(ball)) {
        ball.inPlay = false; ball.trail = []; this.releaseLinksFor(ball.id);
        if (ball.sticky) finishSticky(ball.sticky);
        this.scene.matter.world.remove(ball.body);
      }
      if (ball.id === this.activeShot?.shotId) advanceEffect(ball.effect, isSlow(ball.body.speed, ball.body.angularSpeed), ball.inPlay, delta);
      else ball.effect.phase = 'done';
    }
    for (const source of this.balls.filter(ball => ball.id === this.activeShot?.shotId && ball.inPlay && ball.effect.phase === 'active')) {
      for (const target of this.balls.filter(ball => ball.inPlay && ball !== source)) {
        const impulse = radialImpulse(source, target, source.effect.kind!);
        this.scene.matter.body.setVelocity(target.body, { x: target.body.velocity.x + impulse.x, y: target.body.velocity.y + impulse.y });
      }
    }
    for (const [sourceId, link] of this.links) {
      const source = this.balls.find(ball => ball.id === sourceId)!, target = this.balls.find(ball => ball.id === link.targetId)!;
      if (shouldReleaseSticky(source.sticky!, isSlow(source.body.speed, source.body.angularSpeed) && isSlow(target.body.speed, target.body.angularSpeed),
        source.inPlay && target.inPlay, delta)) this.releaseLink(sourceId);
    }
    const inPlay = this.balls.filter(ball => ball.inPlay);
    const done = this.settling.step(inPlay.every(ball => isSlow(ball.body.speed, ball.body.angularSpeed)), this.links.size === 0 && this.balls.every(ball => ball.effect.phase === 'done'), delta);
    if (done && this.activeShot) {
      for (const ball of inPlay) { this.scene.matter.body.setVelocity(ball.body, { x: 0, y: 0 }); this.scene.matter.body.setAngularVelocity(ball.body, 0); ball.trail = []; }
      // Expire unused effects too: a missed sticky shot cannot catch a future visitor.
      for (const ball of this.balls) {
        ball.effect.phase = 'done';
        if (ball.sticky) finishSticky(ball.sticky);
      }
      const shot = this.activeShot; this.activeShot = null; this.accumulator = 0;
      this.onComplete(shot.sessionId, shot.shotId, this.snapshot());
    } else if (!this.warned && this.elapsed > defaults.physics.diagnosticTimeoutMs) {
      this.warned = true; this.onDiagnostic('小鸟仍未停稳。可以继续等待，或重试本局；尚未结算。');
    }
  }
  reset(): void {
    for (const id of this.links.keys()) this.releaseLink(id);
    for (const ball of this.balls) if (ball.inPlay) this.scene.matter.world.remove(ball.body);
    this.balls.length = 0; this.activeShot = null; this.accumulator = 0; this.elapsed = 0; this.warned = false; this.settling.reset();
  }
  destroy(): void { this.reset(); this.scene.matter.world.off('collisionstart', this.onCollision); }
}
