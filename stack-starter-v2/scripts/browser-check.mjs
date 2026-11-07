/** Optional local browser acceptance. Uses a fresh headless profile, never the user's browser. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

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
page.on('response', response => { if (response.status() >= 400) console.error(`HTTP ${response.status()} ${response.url()}`); });
const record = (name, details = true) => { checks.push({ name, details }); console.log(`PASS ${name}`); };
const state = () => page.evaluate(() => window.__flockDebug.host.getSnapshot());
const send = (type, payload = {}) => page.evaluate(({ type, payload }) => { const h = window.__flockDebug.host; return h.submit(h.command(type, payload)); }, { type, payload });
const start = (mode = 'solo', level = 0) => page.evaluate(({ mode, level }) => window.__flockDebug.host.start(mode, level), { mode, level });
const settle = () => page.evaluate(() => { window.__flockDebug.stepFrames(1200); return window.__flockDebug.inspect(); });
const shoot = async (type, aim, power) => {
  assert.equal((await send('SELECT_BALL', { ballTypeId: type })).accepted, true);
  assert.equal((await send('PREVIEW_SHOT', { aimDeg: aim, power01: power })).accepted, true);
  assert.equal((await send('ARM_SHOT')).accepted, true);
  assert.equal((await send('FIRE')).accepted, true);
  return settle();
};
try {
  await page.goto(base); await page.locator('#start-game:not([disabled])').waitFor();
  await page.screenshot({ path: path.join(output, '01-menu.png'), fullPage: true });
  assert.equal(await page.evaluate(() => !!window.__flockDebug), false);
  await page.locator('#start-game').click(); await page.locator('[data-ball="normal"]').click();
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
  record('production UI: live preview / freeze / cancel / one real-time shot');
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

  await start();
  await shoot('normal', 0, 0.58);
  const firstPosition = (await state()).balls[0];
  await shoot('normal', 0, 0.68);
  assert.ok(Math.hypot((await state()).balls[0].x - firstPosition.x, (await state()).balls[0].y - firstPosition.y) > 5);
  record('settled birds remain dynamic and can be struck by later shots');
  await start();
  await send('SELECT_BALL', { ballTypeId: 'repel' }); await send('ARM_SHOT'); await send('FIRE');
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
  record('pending and active repel effects block turn completion in real physics', effectLifecycle);

  const soloResults = [];
  for (let level = 0; level < 5; level++) {
    await start('solo', level);
    // A visible, reproducible set of legal shots; no injected positions or scores.
    for (const [type, aim, power] of [['normal', -9, 0.58], ['normal', 0, 0.58], ['normal', 9, 0.58], ['repel', 20, 0.56]]) await shoot(type, aim, power);
    current = await state();
    assert.equal(current.context.scene, 'result'); assert.equal(current.result.passed, true);
    soloResults.push({ level: level + 1, score: current.result.score.A, target: current.result.target, balls: current.balls });
  }
  record('five solo levels reachable in actual Matter world', soloResults);
  await page.screenshot({ path: path.join(output, '05-solo-result.png'), fullPage: true });
  await start();
  for (const type of ['normal', 'normal', 'normal', 'repel']) await shoot(type, 0, 1);
  current = await state(); assert.equal(current.result.passed, false); assert.equal(current.result.score.A, 0);
  assert.equal(current.balls.every(ball => !ball.inPlay), true);
  await page.locator('#result-overlay [data-action="retry"]').click();
  assert.equal((await state()).shotsTaken, 0);
  record('out-of-play shots / solo failure / retry');

  const duels = [];
  await start('duel');
  for (let match = 0; match < 3; match++) {
    const owners = [];
    for (let turn = 0; turn < 8; turn++) {
      owners.push((await state()).context.activePlayerId);
      await shoot(turn < 6 ? 'normal' : 'repel', [-8, 8, 0, -5, 5, 0, -12, 12][turn], 0.58);
    }
    current = await state(); assert.equal(current.context.scene, 'result');
    assert.deepEqual(owners, Array.from({ length: 8 }, (_, i) => (i + match) % 2 === 0 ? 'A' : 'B'));
    const effects = await page.evaluate(() => window.__flockDebug.world.balls.filter(ball => ball.typeId === 'repel').map(ball => ball.effect));
    assert.equal(effects.every(effect => effect.phase === 'done' && effect.activations === 1), true);
    duels.push({ match: match + 1, owners, result: current.result, effects });
    if (match === 0) await page.screenshot({ path: path.join(output, '06-duel-result.png'), fullPage: true });
    await page.locator('#result-overlay [data-action="retry"]').click();
  }
  record('three complete eight-throw duels, rematch starters and one-shot repel effects', duels);
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
