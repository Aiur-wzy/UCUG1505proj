/** Optional local browser acceptance. Uses a fresh headless profile, never the user's browser. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { checkWallAndSticky } from './physics-regressions.mjs';
import { checkRadialAnchors } from './radial-regressions.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FLOCK_PLAYWRIGHT || 'playwright-core');
const base = process.env.FLOCK_TEST_URL || 'http://127.0.0.1:5173';
const output = path.resolve(process.env.FLOCK_TEST_OUTPUT || 'test-results/browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.FLOCK_BROWSER || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`); });
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
const record = (name, details = true) => { checks.push({ name, details }); console.log(`PASS ${name}`); };
const state = () => page.evaluate(() => window.__flockDebug.host.getSnapshot());
const send = (type, payload = {}) => page.evaluate(({ type, payload }) => { const h = window.__flockDebug.host; return h.submit(h.command(type, payload)); }, { type, payload });
const start = (mode = 'solo', level = 0) => page.evaluate(({ mode, level }) => window.__flockDebug.host.start(mode, level), { mode, level });
const settle = () => page.evaluate(() => { window.__flockDebug.stepFrames(1200); return window.__flockDebug.inspect(); });
const launch = async (type, aim, power) => {
  assert.equal((await send('SELECT_BALL', { ballTypeId: type })).accepted, true);
  assert.equal((await send('PREVIEW_SHOT', { aimDeg: aim, power01: power })).accepted, true);
  assert.equal((await send('ARM_SHOT')).accepted, true);
  assert.equal((await send('FIRE')).accepted, true);
};
const shoot = async (type, aim, power) => { await launch(type, aim, power); return settle(); };
try {
  await page.goto(base); await page.locator('#start-game:not([disabled])').waitFor();
  await page.screenshot({ path: path.join(output, '01-menu.png'), fullPage: true });
  assert.equal(await page.evaluate(() => !!window.__flockDebug), false);
  assert.equal(await page.locator('#debug-prediction').count(), 0);
  await page.locator('#start-game').click();
  assert.equal(await page.locator('[data-ball]').count(), 4);
  assert.equal(await page.locator('canvas').getAttribute('data-prediction'), 'false');
  await page.locator('[data-ball="normal"]').click();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('canvas').getAttribute('data-phase'), 'armed');
  const locked = await page.locator('canvas').getAttribute('data-aim');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('canvas').getAttribute('data-aim'), locked);
  await page.screenshot({ path: path.join(output, '02-locked.png'), fullPage: true });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('canvas').getAttribute('data-phase'), 'adjust');
  await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.phase === 'select', undefined, { timeout: 12000 });
  assert.equal(await page.locator('canvas').getAttribute('data-balls'), '1');
  record('production UI: four types, hidden prediction, short aim arrow, freeze / cancel / one real-time shot');
  await page.screenshot({ path: path.join(output, '03-first-landing.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#power-range').scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(output, '04-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  record('390px layout has no horizontal overflow');
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.goto(`${base}/dev/game.html`); await page.waitForFunction(() => !!window.__flockDebug);
  await page.locator('#start-game').click();
  for (const [key, type] of [['3', 'attract'], ['4', 'sticky']]) {
    await page.keyboard.press(key);
    assert.equal((await state()).context.selectedBallId, type);
    await page.keyboard.press('Escape');
  }
  assert.equal(await page.locator('#debug-prediction').isChecked(), false);
  await send('SELECT_BALL', { ballTypeId: 'normal' });
  await send('PREVIEW_SHOT', { aimDeg: 0, power01: 1 });
  const beforeToggle = await state();
  await page.locator('#debug-prediction').check();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.prediction === 'true');
  assert.deepEqual(await state(), beforeToggle);
  await page.screenshot({ path: path.join(output, '07-debug-prediction.png'), fullPage: true });
  await page.locator('#debug-prediction').uncheck();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.prediction === 'false');
  assert.deepEqual(await state(), beforeToggle);
  record('keys 3/4 select added types; debug-only prediction toggle changes no gameplay state');
  assert.equal(await page.locator('#aim-range').getAttribute('min'), '-90');
  assert.equal(await page.locator('#aim-range').getAttribute('max'), '90');
  await page.locator('#aim-range').fill('90');
  assert.equal((await state()).context.previewShot.aimDeg, 90);
  await page.evaluate(() => window.__flockDebug.input.focus());
  await page.keyboard.press('ArrowRight'); assert.equal((await state()).context.previewShot.aimDeg, 90);
  await page.locator('#aim-range').fill('-90');
  await page.evaluate(() => window.__flockDebug.input.focus());
  await page.keyboard.press('ArrowLeft'); assert.equal((await state()).context.previewShot.aimDeg, -90);
  const bounds = await page.locator('canvas').boundingBox();
  await page.mouse.move(bounds.x + bounds.width - 10, bounds.y + bounds.height - 10);
  assert.equal((await state()).context.previewShot.aimDeg, 90);
  await page.mouse.move(bounds.x + 10, bounds.y + bounds.height - 10);
  assert.equal((await state()).context.previewShot.aimDeg, -90);
  await page.screenshot({ path: path.join(output, '08-wide-aim.png'), fullPage: true });
  record('slider, arrow keys and pointer all reach the full -90° to +90° range');
  await start();
  await page.locator('[data-debug="ready"]').click(); await page.locator('[data-debug="select"]').click(); await page.locator('[data-debug="preview"]').click();
  let current = await state(); assert.deepEqual(current.context.previewShot, { aimDeg: 12, power01: 0.6 });
  await page.mouse.move(100, 300); assert.equal((await state()).context.previewSource, 'motion');
  await page.keyboard.press('Enter'); assert.equal((await state()).context.phase, 'armed');
  await page.locator('[data-debug="lost"]').click(); assert.equal((await state()).context.phase, 'adjust');
  await page.keyboard.press('Enter'); await page.waitForTimeout(220); assert.equal((await state()).context.phase, 'armed');
  await page.locator('#debug-focus').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
  assert.equal((await state()).shotsTaken, 0);
  await page.locator('canvas').click({ position: { x: 10, y: 10 } }); await page.keyboard.press('Space');
  await page.locator('[data-debug="replay"]').click();
  assert.equal((await state()).shotsTaken, 1); assert.equal(await page.evaluate(() => window.__flockDebug.world.balls.length), 1);
  await settle(); await page.locator('[data-debug="silent"]').click();
  record('hybrid motion preview, keyboard confirms, loss-edge cancel, DOM focus and duplicate FIRE');

  await start();
  await send('SELECT_BALL', { ballTypeId: 'normal' }); await send('ARM_SHOT'); await send('FIRE');
  await page.evaluate(() => window.__flockDebug.stepFrames(30));
  await page.locator('#pause').click();
  const beforePause = await page.evaluate(() => window.__flockDebug.world.snapshot());
  await settle();
  assert.deepEqual(await page.evaluate(() => window.__flockDebug.world.snapshot()), beforePause);
  await page.locator('#pause').click(); await settle();
  record('pause stops real Matter simulation and resumes the same throw');
  await checkWallAndSticky(page, record);
  await checkRadialAnchors(page, record);

  await start();
  await shoot('normal', 0, 0.11);
  const firstPosition = (await state()).balls[0];
  await shoot('sticky', 0, 0.14);
  assert.ok(Math.hypot((await state()).balls[0].x - firstPosition.x, (await state()).balls[0].y - firstPosition.y) > 5);
  const stickyDone = await page.evaluate(() => window.__flockDebug.world.balls[1].sticky);
  assert.equal(stickyDone.phase, 'done'); assert.equal(stickyDone.activations, 1);
  record('settled birds remain dynamic and can be struck by later shots');
  for (const type of ['repel', 'attract']) {
  await start(); await launch(type, 0, 0.11);
  const effectLifecycle = await page.evaluate(() => {
    const d = window.__flockDebug, samples = [];
    let previous = '';
    for (let frame = 0; frame < 1200 && d.host.getContext().phase === 'resolving'; frame++) {
      d.stepFrames(1);
      const effect = d.world.balls[0].effect;
      if (effect.phase !== previous) { previous = effect.phase; samples.push({ frame, effect: effect.phase, phase: d.host.getContext().phase, turn: d.host.getContext().turnId }); }
    }
    return { samples, context: d.host.getContext(), effect: d.world.balls[0].effect };
  });
  assert.deepEqual(effectLifecycle.samples.map(sample => sample.effect), ['pending', 'active', 'done']);
  assert.ok(effectLifecycle.samples.every(sample => sample.phase === 'resolving' && sample.turn === 1));
  assert.equal(effectLifecycle.context.turnId, 2); assert.equal(effectLifecycle.effect.activations, 1);
  record(`pending and active ${type} effects block turn completion in real physics`, effectLifecycle);
  }

  for (const type of ['repel', 'attract']) {
  await start(); await shoot('normal', -8, 0.11);
  await launch(type, 8, 0.11);
  const pull = await page.evaluate(() => {
    const d = window.__flockDebug;
    let activation = null;
    for (let frame = 0; frame < 1200 && d.host.getContext().phase === 'resolving'; frame++) {
      d.stepFrames(1);
      if (!activation && d.world.balls[1].effect.phase === 'active') activation = d.world.snapshot();
    }
    const end = d.world.snapshot();
    const distance = balls => Math.hypot(balls[0].x - balls[1].x, balls[0].y - balls[1].y);
    return { activation, end, before: distance(activation), after: distance(end) };
  });
  assert.ok((pull.after - pull.before) * (type === 'repel' ? 1 : -1) > 10);
  record(`${type} moves a nearby settled bird in the expected direction in actual Matter simulation`, pull);
  }

  await start(); await shoot('normal', 0, 0.11); await launch('sticky', 0, 0.14);
  const bond = await page.evaluate(() => {
    const d = window.__flockDebug;
    for (let i = 0; i < 500 && d.world.balls[1].sticky.phase === 'ready'; i++) d.stepFrames(1);
    d.host.setPaused(true);
    return { sticky: { ...d.world.balls[1].sticky }, balls: d.world.snapshot(), constraints: d.world.scene.matter.world.localWorld.constraints.length };
  });
  assert.equal(bond.sticky.phase, 'attached'); assert.equal(bond.constraints, 1);
  assert.ok(Math.abs(Math.hypot(bond.balls[0].x - bond.balls[1].x, bond.balls[0].y - bond.balls[1].y) - 36) < 3);
  await settle(); assert.deepEqual(await page.evaluate(() => window.__flockDebug.world.snapshot()), bond.balls);
  await page.evaluate(() => window.__flockDebug.host.setPaused(false)); await settle();
  assert.equal((await state()).context.phase, 'select');
  assert.equal(await page.evaluate(() => window.__flockDebug.world.balls[1].sticky.phase), 'done');
  assert.equal(await page.evaluate(() => window.__flockDebug.world.scene.matter.world.localWorld.constraints.length), 0);
  await shoot('repel', 0, 0.14);
  assert.equal(await page.evaluate(() => window.__flockDebug.world.balls[1].sticky.activations), 1);
  record('sticky first contact bonds a pair, survives pause, releases after settling and does not reactivate', bond);

  await start(); await shoot('normal', 0, 0.11); await launch('sticky', 0, 0.14);
  await page.evaluate(() => {
    const d = window.__flockDebug;
    for (let i = 0; i < 500 && d.world.balls[1].sticky.phase === 'ready'; i++) d.stepFrames(1);
    d.host.retry();
  });
  assert.equal(await page.evaluate(() => window.__flockDebug.world.scene.matter.world.localWorld.constraints.length), 0);
  assert.equal(await page.evaluate(() => window.__flockDebug.world.scene.matter.world.localWorld.bodies.length), 3);
  record('reset removes live sticky constraints and birds while retaining exactly three walls');

  const retiredEffects = [];
  for (const type of ['sticky', 'repel', 'attract']) {
    await start(); await shoot(type, 0, 0.11);
    const retired = await page.evaluate(() => {
      const ball = window.__flockDebug.world.balls[0];
      return { effect: { ...ball.effect }, sticky: ball.sticky && { ...ball.sticky }, position: { x: ball.x, y: ball.y } };
    });
    assert.equal(retired.effect.phase, 'done');
    if (type === 'sticky') { assert.equal(retired.sticky.phase, 'done'); assert.equal(retired.sticky.activations, 0); }
    await page.evaluate(() => {
      const d = window.__flockDebug;
      window.__effectRecheck = { contacts: 0 };
      const onContact = event => {
        const ids = d.world.balls.map(ball => ball.body.id);
        window.__effectRecheck.contacts += event.pairs.filter(pair => ids.includes(pair.bodyA.id) && ids.includes(pair.bodyB.id)).length;
      };
      window.__effectRecheck.listener = onContact;
      d.world.scene.matter.world.on('collisionstart', onContact);
    });
    await launch('normal', 0, 0.14);
    const after = await page.evaluate(() => {
      const d = window.__flockDebug;
      let revived = false, links = 0;
      for (let i = 0; i < 1200 && d.host.getContext().phase === 'resolving'; i++) {
        d.stepFrames(1); const old = d.world.balls[0];
        revived ||= old.effect.phase !== 'done' || !!(old.sticky && old.sticky.phase !== 'done');
        links = Math.max(links, d.world.scene.matter.world.localWorld.constraints.length);
      }
      d.world.scene.matter.world.off('collisionstart', window.__effectRecheck.listener);
      const old = d.world.balls[0];
      return { contacts: window.__effectRecheck.contacts, revived, links, effect: old.effect, sticky: old.sticky, position: { x: old.x, y: old.y }, phase: d.host.getContext().phase };
    });
    assert.ok(after.contacts > 0); assert.equal(after.revived, false); assert.equal(after.links, 0);
    assert.deepEqual(after.effect, retired.effect); assert.deepEqual(after.sticky, retired.sticky);
    assert.ok(Math.hypot(after.position.x - retired.position.x, after.position.y - retired.position.y) > 5);
    assert.equal(after.phase, 'select');
    retiredEffects.push({ type, retired, after });
  }
  record('missed sticky and completed repel/attract remain inert when physically struck by a later normal shot', retiredEffects);

  const damping = await page.evaluate(() => {
    const d = window.__flockDebug, h = d.host, walls = Object.values(d.world.scene.matter.world.walls).filter(Boolean);
    const configured = walls[0].restitution;
    const sample = restitution => {
      h.start('solo'); walls.forEach(wall => { wall.restitution = restitution; });
      for (const [type, payload] of [['SELECT_BALL', { ballTypeId: 'normal' }], ['PREVIEW_SHOT', { aimDeg: 90, power01: 1 }], ['ARM_SHOT', {}], ['FIRE', {}]]) h.submit(h.command(type, payload));
      const ball = d.world.balls[0], before = ball.body.speed;
      d.stepFrames(1); const freeRatio = ball.body.speed / before;
      let reflectionRatio = null;
      for (let i = 0; i < 100; i++) {
        const prior = ball.body.velocity.x; d.stepFrames(1);
        if (prior > 0 && ball.body.velocity.x < 0) { reflectionRatio = -ball.body.velocity.x / prior; break; }
      }
      return { restitution, initialSpeed: before, freeRatio, reflectionRatio };
    };
    // Comparison fixture temporarily restores only the former wall coefficient.
    // All subsequent checks use the actual current configuration again.
    try { return { previousWall: sample(0.7), currentWall: sample(configured) }; }
    finally { walls.forEach(wall => { wall.restitution = configured; }); }
  });
  assert.equal(damping.currentWall.initialSpeed, 35); assert.equal(damping.currentWall.restitution, 0.85);
  assert.ok(Math.abs(damping.currentWall.freeRatio - 0.985) < 1e-6);
  assert.ok(damping.currentWall.reflectionRatio > damping.previousWall.reflectionRatio + 0.1);
  record('actual free-step speed retention is 98.5%; the 0.85 wall coefficient loses less speed than the previous 0.7', damping);

  const wallResults = [];
  for (const [wall, aim] of [['top', 0], ['left', -90], ['right', 90]]) {
    await start(); await launch('normal', aim, 1);
    const result = await page.evaluate(wall => {
      const d = window.__flockDebug, axis = wall === 'top' ? 'y' : 'x';
      let reflected = false, previous = d.world.balls[0].body.velocity[axis], minX = 1000, maxX = 0, minY = 700;
      for (let i = 0; i < 1200 && d.host.getContext().phase === 'resolving'; i++) {
        d.stepFrames(1); const ball = d.world.balls[0], v = ball.body.velocity[axis];
        if ((wall === 'right' ? previous > 0 && v < 0 : previous < 0 && v > 0)) reflected = true;
        previous = v; minX = Math.min(minX, ball.x); maxX = Math.max(maxX, ball.x); minY = Math.min(minY, ball.y);
      }
      return { wall, reflected, minX, maxX, minY, ball: d.world.snapshot()[0], bodies: d.world.scene.matter.world.localWorld.bodies.length };
    }, wall);
    assert.equal(result.reflected, true); assert.equal(result.ball.inPlay, wall !== 'top');
    assert.ok(result.minX >= 16 && result.maxX <= 984 && result.minY >= 16);
    assert.equal(result.bodies, wall === 'top' ? 3 : 4); wallResults.push(result);
  }
  record('35-speed shots rebound off three walls; ±90° stays horizontal and top rebound can leave the open bottom', wallResults);
  await start();
  const exit = await page.evaluate(() => {
    const d = window.__flockDebug;
    // Deliberately constructed physics fixture, not a legal player throw (aim is normally ±90°).
    d.world.spawn({ sessionId: d.host.getContext().sessionId, shotId: 'bottom-exit-fixture', ownerId: 'A', typeId: 'normal', origin: { x: 500, y: 680 }, aimDeg: 180, power01: 1 });
    d.stepFrames(100);
    return { ball: d.world.snapshot()[0], bodies: d.world.scene.matter.world.localWorld.bodies.length };
  });
  assert.equal(exit.ball.inPlay, false); assert.ok(exit.ball.y - exit.ball.radius > 700); assert.equal(exit.bodies, 3);
  record('constructed downward physics fixture exits the open bottom and is removed', exit);

  const soloResults = [];
  for (let level = 0; level < 5; level++) {
    await start('solo', level);
    // A visible, reproducible set of legal shots; no injected positions or scores.
    for (const [type, aim, power] of [['normal', -9, 0.11], ['attract', 0, 0.11], ['sticky', 9, 0.11], ['repel', 20, 0.10]]) await shoot(type, aim, power);
    current = await state();
    assert.equal(current.context.scene, 'result'); assert.equal(current.result.passed, true);
    soloResults.push({ level: level + 1, score: current.result.score.A, target: current.result.target, balls: current.balls });
  }
  record('five solo levels reachable in actual Matter world', soloResults);
  await page.screenshot({ path: path.join(output, '05-solo-result.png'), fullPage: true });
  await start();
  for (const type of ['normal', 'repel', 'attract', 'sticky']) await shoot(type, 90, 0);
  current = await state(); assert.equal(current.result.passed, false); assert.equal(current.result.score.A, 0);
  await page.locator('#result-overlay [data-action="retry"]').click();
  assert.equal((await state()).shotsTaken, 0);
  record('four low-power shots / solo zero-score failure / retry');

  const duels = [];
  await start('duel');
  for (let match = 0; match < 3; match++) {
    const owners = [];
    for (let turn = 0; turn < 8; turn++) {
      owners.push((await state()).context.activePlayerId);
      await shoot(['normal', 'repel', 'attract', 'sticky'][Math.floor(turn / 2)], [-8, 8, 0, -5, 5, 0, -12, 12][turn], 0.11);
    }
    current = await state(); assert.equal(current.context.scene, 'result');
    assert.deepEqual(owners, Array.from({ length: 8 }, (_, i) => (i + match) % 2 === 0 ? 'A' : 'B'));
    const effects = await page.evaluate(() => window.__flockDebug.world.balls.filter(ball => ['repel', 'attract'].includes(ball.typeId)).map(ball => ball.effect));
    assert.equal(effects.every(effect => effect.phase === 'done' && effect.activations === 1), true);
    assert.equal(await page.evaluate(() => window.__flockDebug.world.scene.matter.world.localWorld.constraints.length), 0);
    for (const owner of ['A', 'B']) assert.deepEqual(current.balls.filter(ball => ball.ownerId === owner).map(ball => ball.typeId), ['normal', 'repel', 'attract', 'sticky']);
    duels.push({ match: match + 1, owners, result: current.result, effects });
    if (match === 0) await page.screenshot({ path: path.join(output, '06-duel-result.png'), fullPage: true });
    await page.locator('#result-overlay [data-action="retry"]').click();
  }
  record('three complete eight-throw duels, one of each type per player, rematch starters and completed effects', duels);
  await page.goto(`${base}/dev/stack.html`); await page.locator('#synthetic').click();
  await page.waitForFunction(() => window.__stackCheck?.lastResult?.kind === 'RESULT', undefined, { timeout: 20000 });
  const synthetic = await page.evaluate(() => window.__stackCheck);
  assert.equal(synthetic.error, null);
  record('preserved local OpenCV Worker synthetic-image diagnostic', synthetic.lastResult.candidates);
  assert.deepEqual(errors, []);
  record('no browser runtime errors');
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ base, browser: await browser.version(), checks, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ base, checks, errors, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
