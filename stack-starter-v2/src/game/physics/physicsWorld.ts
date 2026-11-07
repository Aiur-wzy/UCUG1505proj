import type Phaser from 'phaser';
import defaults from '../../shared/defaults.json';
import type { BallSnapshot, PhysicsPort, Point, ShotRequest } from '../core/gameState';
import { advanceEffect, newEffect, radialImpulse } from './effects';
import type { EffectState } from './effects';
import { isOutOfPlay, launchVelocity } from './shotMath';
import { isSlow, Settling } from './settling';
import { attachSticky, finishSticky, newSticky, shouldReleaseSticky } from './sticky';
import type { StickyState } from './sticky';
import { reflectWalls } from './walls';

type Body = ReturnType<Phaser.Physics.Matter.Factory['circle']>;
type Constraint = ReturnType<Phaser.Physics.Matter.Factory['constraint']>;
type CollisionPair = { bodyA: Body; bodyB: Body; restitution: number; isSensor: boolean };
interface StickyLink {
  targetId: string; constraint: Constraint; pair: CollisionPair;
  originals: { body: Body; mass: number; inertia: number; group: number }[];
}
export interface WorldBall extends BallSnapshot { body: Body; effect: EffectState; sticky: StickyState | null; trail: Point[] }
export class PhysicsWorld implements PhysicsPort {
  readonly balls: WorldBall[] = [];
  private accumulator = 0;
  private elapsed = 0;
  private paused = false;
  private settling = new Settling();
  private activeShot: ShotRequest | null = null;
  private warned = false;
  private links = new Map<string, StickyLink>();
  constructor(private scene: Phaser.Scene,
    private onComplete: (sessionId: string, shotId: string, balls: BallSnapshot[]) => void,
    private onDiagnostic: (message: string) => void) {
    scene.matter.world.autoUpdate = false;
    scene.matter.world.setGravity(0, 0);
    const { width, height, walls } = defaults.world;
    scene.matter.world.setBounds(0, 0, width, height, walls.thickness, walls.left, walls.right, walls.top, walls.bottom);
    for (const wall of Object.values(scene.matter.world.walls)) if (wall) {
      wall.restitution = defaults.physics.wallRestitution;
      // Resolve the three rink edges explicitly, bypassing Matter's low-speed
      // resting-contact response. These bodies remain available as sensors.
      wall.isSensor = true;
    }
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
  private onCollision = (event: { pairs: CollisionPair[] }): void => {
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
      const originals = [source, target].map(ball => ({ body: ball.body, mass: ball.body.mass,
        inertia: ball.body.inertia, group: ball.body.collisionFilter.group }));
      const velocity = { ...source.body.velocity }, group = this.scene.matter.body.nextGroup(true);
      // One launched bird carries the pair: preserve its velocity and assign
      // half of its original mass to each member. Air drag stays unchanged.
      for (const ball of [source, target]) {
        this.scene.matter.body.setMass(ball.body, originals[0].mass / 2);
        ball.body.collisionFilter.group = group;
        this.scene.matter.body.setVelocity(ball.body, velocity);
      }
      // Start at the bond's rest length so correcting the impact overlap does
      // not introduce an artificial spring kick on the following frame.
      const dx = target.body.position.x - source.body.position.x, dy = target.body.position.y - source.body.position.y;
      const distance = Math.hypot(dx, dy), correction = (source.radius + target.radius - distance) / 2;
      const offset = { x: (distance > 1e-9 ? dx / distance : 1) * correction, y: (distance > 1e-9 ? dy / distance : 0) * correction };
      this.scene.matter.body.translate(source.body, { x: -offset.x, y: -offset.y });
      this.scene.matter.body.translate(target.body, offset);
      // Suppress this contact immediately as well as future internal contacts;
      // otherwise the current solver pass would halve the pickup velocity.
      pair.isSensor = true;
      const constraint = this.scene.matter.add.constraint(source.body, target.body, source.radius + target.radius,
        defaults.effects.sticky.stiffness, { damping: defaults.effects.sticky.damping, label: 'sticky-pair' });
      attachSticky(source.sticky!, target.id);
      this.links.set(source.id, { targetId: target.id, constraint, pair, originals });
    }
  };
  private releaseLink(sourceId: string): void {
    const link = this.links.get(sourceId);
    if (!link) return;
    this.scene.matter.world.removeConstraint(link.constraint);
    for (const original of link.originals) {
      this.scene.matter.body.setMass(original.body, original.mass);
      this.scene.matter.body.setInertia(original.body, original.inertia);
      original.body.collisionFilter.group = original.group;
    }
    link.pair.isSensor = false;
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
    this.resolveWalls();
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
  private resolveWalls(): void {
    const processed = new Set<string>(), walls = this.scene.matter.world.walls;
    const coefficients = { left: walls.left?.restitution ?? null, right: walls.right?.restitution ?? null, top: walls.top?.restitution ?? null };
    for (const ball of this.balls) {
      if (!ball.inPlay || processed.has(ball.id)) continue;
      const entry = [...this.links.entries()].find(([id, link]) => id === ball.id || link.targetId === ball.id);
      const members = entry ? this.balls.filter(other => other.inPlay && (other.id === entry[0] || other.id === entry[1].targetId)) : [ball];
      for (const member of members) processed.add(member.id);
      const mass = members.reduce((total, member) => total + member.body.mass, 0);
      const incoming = { x: 0, y: 0 };
      for (const member of members) {
        incoming.x += member.body.velocity.x * member.body.mass / mass;
        incoming.y += member.body.velocity.y * member.body.mass / mass;
      }
      const result = reflectWalls({
        minX: Math.min(...members.map(member => member.body.position.x - member.radius)),
        maxX: Math.max(...members.map(member => member.body.position.x + member.radius)),
        minY: Math.min(...members.map(member => member.body.position.y - member.radius)),
      }, incoming, coefficients);
      for (const member of members) {
        if (result.shift.x || result.shift.y) this.scene.matter.body.translate(member.body, result.shift);
        if (result.hits.length) this.scene.matter.body.setVelocity(member.body, {
          x: result.hits.some(hit => hit !== 'top') ? result.velocity.x : member.body.velocity.x,
          y: result.hits.includes('top') ? result.velocity.y : member.body.velocity.y,
        });
      }
      if (result.hits.length) this.scene.events.emit('wallbounce');
    }
  }
  reset(): void {
    for (const id of this.links.keys()) this.releaseLink(id);
    for (const ball of this.balls) if (ball.inPlay) this.scene.matter.world.remove(ball.body);
    this.balls.length = 0; this.activeShot = null; this.accumulator = 0; this.elapsed = 0; this.warned = false; this.settling.reset();
  }
  destroy(): void { this.reset(); this.scene.matter.world.off('collisionstart', this.onCollision); }
}
