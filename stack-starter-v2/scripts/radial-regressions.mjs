import assert from 'node:assert/strict';

/** Real Matter collisions with controlled target placement, not unmodified player throws. */
export async function checkRadialAnchors(page, record) {
  const result = await page.evaluate(() => {
    const d = window.__flockDebug, h = d.host, world = d.world.scene.matter.world, bodyApi = d.world.scene.matter.body;
    const properties = body => Object.fromEntries(['mass', 'inertia', 'density', 'inverseMass', 'inverseInertia', 'restitution', 'friction', 'frictionAir'].map(key => [key, body[key]]));
    const restored = setup => !setup.source.body.isStatic && Object.entries(setup.original).every(([key, value]) => setup.source.body[key] === value) && d.world.anchored.size === 0;
    const launch = (type, aim = 0) => {
      for (const [command, payload] of [['SELECT_BALL', { ballTypeId: type }], ['PREVIEW_SHOT', { aimDeg: aim, power01: 0.11 }], ['ARM_SHOT', {}], ['FIRE', {}]]) {
        const response = h.submit(h.command(command, payload));
        if (!response.accepted) throw new Error(`${command}: ${response.reason}`);
      }
    };
    const activate = (type, withTarget = false) => {
      h.start('solo');
      if (withTarget) { launch('normal', -60); d.stepFrames(1200); }
      launch(type);
      const source = d.world.balls.at(-1), original = properties(source.body);
      let pendingDynamic = source.effect.phase === 'pending' && !source.body.isStatic, pendingFrames = 0;
      for (; pendingFrames < 1000 && source.effect.phase === 'pending'; pendingFrames++) {
        pendingDynamic &&= !source.body.isStatic; d.stepFrames(1);
      }
      if (source.effect.phase !== 'active') throw new Error(`${type} never activated`);
      return { source, original, pendingDynamic, pendingFrames };
    };
    const collisions = [], pauses = [];
    for (const type of ['attract', 'repel']) {
      const setup = activate(type, true), { source } = setup, target = d.world.balls[0];
      const anchor = { ...source.body.position }, angle = source.body.angle;
      const pauseBefore = { effect: { ...source.effect }, balls: d.world.snapshot() };
      h.setPaused(true); d.stepFrames(120);
      pauses.push({ type, unchanged: JSON.stringify(pauseBefore) === JSON.stringify({ effect: { ...source.effect }, balls: d.world.snapshot() }), anchored: source.body.isStatic });
      h.setPaused(false);

      let stage = 'active', activeContacts = 0, releasedContacts = 0;
      const onContact = event => {
        const count = event.pairs.filter(pair => (pair.bodyA === source.body && pair.bodyB === target.body) || (pair.bodyB === source.body && pair.bodyA === target.body)).length;
        if (stage === 'active') activeContacts += count; else releasedContacts += count;
      };
      world.on('collisionstart', onContact);
      try {
        // Attraction pulls a stationary neighbour into contact. Repulsion is
        // challenged by an incoming ball strong enough to reach the source.
        bodyApi.setPosition(target.body, { x: anchor.x + 45, y: anchor.y });
        bodyApi.setVelocity(target.body, { x: type === 'attract' ? 0 : -3, y: 0 });
        let maxDrift = 0, maxAngleDrift = 0, maxSpeed = source.body.speed, staticMatchesPhase = source.body.isStatic, activeFrames = 0;
        for (; activeFrames < 60 && source.effect.phase === 'active'; activeFrames++) {
          d.stepFrames(1);
          maxDrift = Math.max(maxDrift, Math.hypot(source.body.position.x - anchor.x, source.body.position.y - anchor.y));
          maxAngleDrift = Math.max(maxAngleDrift, Math.abs(source.body.angle - angle));
          maxSpeed = Math.max(maxSpeed, Math.hypot(source.body.velocity.x, source.body.velocity.y), Math.abs(source.body.angularVelocity));
          staticMatchesPhase &&= source.body.isStatic === (source.effect.phase === 'active');
        }
        const release = { restored: restored(setup), effect: { ...source.effect }, speed: source.body.speed };
        stage = 'released';
        bodyApi.setPosition(target.body, { x: anchor.x + 60, y: anchor.y });
        bodyApi.setVelocity(target.body, { x: 0, y: 0 }); d.stepFrames(1);
        bodyApi.setVelocity(target.body, { x: -4, y: 0 }); d.stepFrames(15);
        const afterCollision = { contacts: releasedContacts, displacement: Math.hypot(source.x - anchor.x, source.y - anchor.y), dynamic: !source.body.isStatic };
        d.stepFrames(1200);
        collisions.push({ type, pendingDynamic: setup.pendingDynamic, pendingFrames: setup.pendingFrames, activeFrames, activeContacts,
          maxDrift, maxAngleDrift, maxSpeed, staticMatchesPhase, release, afterCollision, finalPhase: h.getContext().phase, finalEffect: { ...source.effect } });
      } finally { world.off('collisionstart', onContact); }
    }
    const cleanup = [];
    for (const type of ['attract', 'repel']) for (const action of ['retry', 'rollback', 'exit']) {
      const setup = activate(type), { source } = setup;
      if (action === 'retry') h.retry();
      if (action === 'rollback') d.world.rollback(source.id);
      if (action === 'exit') {
        // Forced removal fixture: a pinned ball cannot naturally move out.
        bodyApi.setPosition(source.body, { x: 500, y: 719 }); d.stepFrames(1);
      }
      cleanup.push({ type, action, restored: restored(setup), bodies: world.localWorld.bodies.length,
        removed: !world.localWorld.bodies.includes(source.body), anchored: d.world.anchored.size });
    }
    const edges = [];
    for (const type of ['attract', 'repel']) for (const origin of [{ x: 18, y: 350 }, { x: 982, y: 350 }, { x: 500, y: 18 }, { x: 18, y: 18 }]) {
      h.start('solo');
      d.world.spawn({ sessionId: h.getContext().sessionId, shotId: 'anchor-wall-fixture', ownerId: 'A', typeId: type, origin, aimDeg: 0, power01: 0 });
      const source = d.world.balls[0]; bodyApi.setVelocity(source.body, { x: 0, y: 0 });
      let activeSeen = false, finite = true, maxDrift = 0;
      for (let frame = 0; frame < 70; frame++) {
        d.stepFrames(1); activeSeen ||= source.body.isStatic;
        finite &&= [source.x, source.y, source.body.velocity.x, source.body.velocity.y].every(Number.isFinite);
        maxDrift = Math.max(maxDrift, Math.hypot(source.x - origin.x, source.y - origin.y));
      }
      edges.push({ type, origin, activeSeen, finite, maxDrift, released: !source.body.isStatic && d.world.anchored.size === 0 });
    }
    h.start('solo');
    return { collisions, pauses, cleanup, edges };
  });
  for (const row of result.collisions) {
    assert.equal(row.pendingDynamic, true); assert.ok(row.pendingFrames > 0);
    assert.equal(row.activeFrames, 21); assert.ok(row.activeContacts > 0, JSON.stringify(row));
    assert.equal(row.maxDrift, 0); assert.equal(row.maxAngleDrift, 0); assert.equal(row.maxSpeed, 0);
    assert.equal(row.staticMatchesPhase, true); assert.equal(row.release.restored, true); assert.equal(row.release.speed, 0);
    assert.equal(row.release.effect.phase, 'done'); assert.equal(row.release.effect.activations, 1);
    assert.ok(row.afterCollision.contacts > 0); assert.ok(row.afterCollision.displacement > 5, JSON.stringify(row));
    assert.equal(row.afterCollision.dynamic, true); assert.equal(row.finalPhase, 'select'); assert.deepEqual(row.finalEffect, row.release.effect);
  }
  record('controlled real collisions: attract/repel stay exactly fixed for 350ms, then restore normal mass and can be pushed again', result.collisions);
  assert.equal(result.pauses.every(row => row.unchanged && row.anchored), true);
  assert.equal(result.cleanup.every(row => row.restored && row.removed && row.bodies === 3 && row.anchored === 0), true, JSON.stringify(result.cleanup));
  record('both radial anchors survive pause and release cleanly on resume, retry, rollback or forced bottom exit', { pauses: result.pauses, cleanup: result.cleanup });
  assert.equal(result.edges.every(row => row.activeSeen && row.finite && row.maxDrift === 0 && row.released), true, JSON.stringify(result.edges));
  record('attract/repel anchor fixtures on all three walls and a corner remain finite, fixed and releasable', result.edges);
}
