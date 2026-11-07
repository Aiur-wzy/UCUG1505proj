import assert from 'node:assert/strict';

/** Real Matter checks. Explicitly constructed edge fixtures are separated from legal host throws. */
export async function checkWallAndSticky(page, record) {
  const result = await page.evaluate(() => {
    const d = window.__flockDebug, h = d.host, bodyApi = d.world.scene.matter.body;
    const types = ['normal', 'repel', 'attract', 'sticky'];
    const launch = (type, aim, power) => {
      for (const [command, payload] of [['SELECT_BALL', { ballTypeId: type }], ['PREVIEW_SHOT', { aimDeg: aim, power01: power }], ['ARM_SHOT', {}], ['FIRE', {}]]) {
        const response = h.submit(h.command(command, payload));
        if (!response.accepted) throw new Error(`${command}: ${response.reason}`);
      }
    };
    const edgeCases = [];
    for (const type of types) for (const wall of ['left', 'right', 'top']) {
      for (const [normal, tangent] of [[0.02, 0], [0.2, 0], [1, 0], [4, 0], [35, 0], [0.2, 5], [1, 20]]) {
        h.start('solo');
        const origin = wall === 'top' ? { x: 500, y: 18.01 } : { x: wall === 'left' ? 18.01 : 981.99, y: 350 };
        d.world.spawn({ sessionId: h.getContext().sessionId, shotId: 'edge-fixture', ownerId: 'A', typeId: type, origin, aimDeg: 0, power01: 0 });
        const ball = d.world.balls[0], axis = wall === 'top' ? 'y' : 'x', along = axis === 'x' ? 'y' : 'x', sign = wall === 'right' ? 1 : -1;
        bodyApi.setVelocity(ball.body, { [axis]: normal * sign, [along]: tangent });
        d.stepFrames(1);
        edgeCases.push({ type, wall, normal, tangent, returned: -ball.body.velocity[axis] * sign,
          along: ball.body.velocity[along], inBounds: ball.x >= 18 && ball.x <= 982 && ball.y >= 18 });
      }
    }
    const corners = [];
    for (const type of types) for (const side of [-1, 1]) {
      h.start('solo');
      d.world.spawn({ sessionId: h.getContext().sessionId, shotId: 'corner-fixture', ownerId: 'A', typeId: type,
        origin: { x: side < 0 ? 18.01 : 981.99, y: 18.01 }, aimDeg: 0, power01: 0 });
      const ball = d.world.balls[0]; bodyApi.setVelocity(ball.body, { x: side * 0.2, y: -0.2 }); d.stepFrames(1);
      corners.push({ type, side, x: ball.x, y: ball.y, vx: ball.body.velocity.x, vy: ball.body.velocity.y });
    }
    const legal = [];
    for (const type of types) for (const [wall, aim, power] of [['top', 0, 0.20], ['left', -90, 0.16], ['right', 90, 0.16], ['top', 0, 1], ['left', -90, 1], ['right', 90, 1]]) {
      h.start('solo'); launch(type, aim, power);
      const axis = wall === 'top' ? 'y' : 'x', sign = wall === 'right' ? 1 : -1, ball = d.world.balls[0];
      let bounced = false, before = 0, after = 0;
      for (let frame = 0; frame < 1000 && h.getContext().phase === 'resolving'; frame++) {
        before = ball.body.velocity[axis]; d.stepFrames(1); after = ball.body.velocity[axis];
        if (before * sign > 0 && after * sign < 0) { bounced = true; break; }
      }
      legal.push({ type, wall, power, bounced, before, after });
    }
    const pickup = () => {
      h.start('solo'); launch('normal', 0, 0.11); d.stepFrames(1200); launch('sticky', 0, 0.14);
      const originals = d.world.balls.map(ball => ({ body: ball.body, mass: ball.body.mass, inertia: ball.body.inertia, group: ball.body.collisionFilter.group }));
      let incoming;
      for (let i = 0; i < 1000 && d.world.balls[1].sticky.phase === 'ready'; i++) {
        incoming = { ...d.world.balls[1].body.velocity }; d.stepFrames(1);
      }
      if (d.world.balls[1].sticky.phase !== 'attached') throw new Error('Sticky pickup did not occur');
      return { originals, incoming, link: [...d.world.links.values()][0] };
    };
    const centreVelocity = () => {
      const mass = d.world.balls.reduce((sum, ball) => sum + ball.body.mass, 0);
      return { x: d.world.balls.reduce((sum, ball) => sum + ball.body.velocity.x * ball.body.mass, 0) / mass,
        y: d.world.balls.reduce((sum, ball) => sum + ball.body.velocity.y * ball.body.mass, 0) / mass };
    };
    const totalMass = () => d.world.balls.reduce((sum, ball) => sum + ball.body.mass, 0);
    const restored = setup => setup.originals.every(original => Math.abs(original.body.mass - original.mass) < 1e-10
      && Math.abs(original.body.inertia - original.inertia) < 1e-8 && original.body.collisionFilter.group === original.group)
      && !setup.link.pair.isSensor && d.world.scene.matter.world.localWorld.constraints.length === 0;
    const free = pickup(), attached = { velocity: centreVelocity(), mass: totalMass(), individual: d.world.balls.map(ball => ({ ...ball.body.velocity })) };
    let worstDragError = 0;
    for (let frame = 0; frame < 120; frame++) {
      const before = centreVelocity(); d.stepFrames(1); const after = centreVelocity();
      worstDragError = Math.max(worstDragError, Math.hypot(after.x - before.x * 0.985, after.y - before.y * 0.985));
    }
    const after120 = { velocity: centreVelocity(), mass: totalMass(), phase: d.world.balls[1].sticky.phase };
    d.stepFrames(1200);
    const sticky = { singleMass: free.originals[1].mass, incoming: free.incoming, attached, after120, worstDragError,
      restored: restored(free), phase: h.getContext().phase };

    const pairWalls = [];
    for (const wall of ['left', 'right', 'top', 'corner']) {
      pickup();
      const bounds = { left: Math.min(...d.world.balls.map(ball => ball.body.position.x)), right: Math.max(...d.world.balls.map(ball => ball.body.position.x)), top: Math.min(...d.world.balls.map(ball => ball.body.position.y)) };
      const shift = { x: wall === 'left' || wall === 'corner' ? 18.01 - bounds.left : wall === 'right' ? 981.99 - bounds.right : 0,
        y: wall === 'top' || wall === 'corner' ? 18.01 - bounds.top : 0 };
      const velocity = { x: wall === 'left' || wall === 'corner' ? -0.2 : wall === 'right' ? 0.2 : 0, y: wall === 'top' || wall === 'corner' ? -0.2 : 0 };
      for (const ball of d.world.balls) { bodyApi.translate(ball.body, shift); bodyApi.setVelocity(ball.body, velocity); }
      d.stepFrames(1);
      pairWalls.push({ wall, mass: totalMass(), phase: d.world.balls[1].sticky.phase, balls: d.world.balls.map(ball => ({ x: ball.x, y: ball.y, velocity: { ...ball.body.velocity } })) });
    }
    const cleanup = [];
    for (const action of ['retry', 'rollback', 'exit']) {
      const setup = pickup();
      if (action === 'retry') h.retry();
      if (action === 'rollback') d.world.rollback(d.world.balls[1].id);
      if (action === 'exit') {
        const shift = 719 - Math.max(...d.world.balls.map(ball => ball.y));
        for (const ball of d.world.balls) { bodyApi.translate(ball.body, { x: 0, y: shift }); bodyApi.setVelocity(ball.body, { x: 0, y: 2 }); }
        d.stepFrames(1);
      }
      cleanup.push({ action, restored: restored(setup), stickyInPlay: d.world.balls.find(ball => ball.typeId === 'sticky')?.inPlay ?? false });
    }
    h.start('solo');
    return { edgeCases, corners, legal, sticky, pairWalls, cleanup };
  });
  for (const row of result.edgeCases) {
    assert.ok(Math.abs(row.returned - row.normal * 0.985 * 0.85) < 1e-8, JSON.stringify(row));
    assert.ok(Math.abs(row.along - row.tangent * 0.985) < 1e-8, JSON.stringify(row));
    assert.equal(row.inBounds, true);
  }
  for (const row of result.corners) {
    assert.ok(Math.abs(row.vx + row.side * 0.2 * 0.985 * 0.85) < 1e-8);
    assert.ok(Math.abs(row.vy - 0.2 * 0.985 * 0.85) < 1e-8);
    assert.ok(row.x >= 18 && row.x <= 982 && row.y >= 18);
  }
  assert.equal(result.legal.every(row => row.bounced), true, JSON.stringify(result.legal));
  record('all four types rebound at low speed, grazing angles and corners: 92 edge fixtures and 24 legal throws', {
    fixtures: result.edgeCases.length + result.corners.length, legal: result.legal,
    slowest: result.edgeCases.filter(row => row.normal === 0.02),
  });
  const sticky = result.sticky;
  assert.ok(Math.abs(sticky.attached.mass - sticky.singleMass) < 1e-10);
  for (const velocity of sticky.attached.individual) assert.ok(Math.hypot(velocity.x - sticky.incoming.x * 0.985, velocity.y - sticky.incoming.y * 0.985) < 1e-8);
  assert.ok(sticky.worstDragError < 1e-8);
  assert.ok(Math.abs(sticky.after120.mass - sticky.singleMass) < 1e-10);
  assert.equal(sticky.after120.phase, 'attached'); assert.equal(sticky.restored, true); assert.equal(sticky.phase, 'select');
  record('sticky pickup preserves launch velocity; combined mass equals one bird and 120 free steps retain single-bird drag', sticky);
  for (const row of result.pairWalls) {
    assert.equal(row.phase, 'attached'); assert.ok(Math.abs(row.mass - sticky.singleMass) < 1e-10);
    for (const ball of row.balls) {
      assert.ok(ball.x >= 18 && ball.x <= 982 && ball.y >= 18);
      const expectedX = row.wall === 'top' ? 0 : row.wall === 'right' ? -0.16745 : 0.16745;
      const expectedY = row.wall === 'top' || row.wall === 'corner' ? 0.16745 : 0;
      assert.ok(Math.hypot(ball.velocity.x - expectedX, ball.velocity.y - expectedY) < 1e-8, JSON.stringify(row));
    }
  }
  assert.equal(result.cleanup.every(row => row.restored && !row.stickyInPlay), true, JSON.stringify(result.cleanup));
  record('sticky pair reflects as one unit; settling, retry, rollback and bottom exit restore masses and collision filters', { walls: result.pairWalls, cleanup: result.cleanup });
}
