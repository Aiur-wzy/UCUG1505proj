/** Real image/Worker acceptance with a fresh browser; never opens a physical camera. */
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FLOCK_PLAYWRIGHT || 'playwright-core');
const base = process.env.FLOCK_TEST_URL || 'http://127.0.0.1:4173';
const output = path.resolve(process.env.FLOCK_TEST_OUTPUT || 'test-results/motion-browser');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.FLOCK_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const checks = [], errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
await page.addInitScript(() => {
  window.__cameraRequests = 0;
  navigator.mediaDevices.getUserMedia = async () => { window.__cameraRequests++; throw new DOMException('Test permission denial; no physical camera requested', 'NotAllowedError'); };
});
const record = name => { checks.push(name); console.log(`PASS ${name}`); };
const inspect = () => page.evaluate(() => window.__motionLab.inspect());
const set = settings => page.evaluate(settings => window.__motionLab.setSynthetic(settings), settings);
const tween = async settings => {
  const current = await page.evaluate(() => {
    const root = document.querySelector('.motion-panel');
    return Object.fromEntries([...root.querySelectorAll('[data-sim]')].map(e => [e.dataset.sim, e.type === 'checkbox' ? e.checked : Number(e.value)]));
  });
  // Drive the visible controls; their pixel canvas goes through the real Worker.
  for (let i = 1; i <= 10; i++) {
    for (const [key, value] of Object.entries(settings)) {
      const next = Number(current[key]) + (value - Number(current[key])) * i / 10;
      await page.locator(`[data-sim="${key}"]`).evaluate((input, value) => { input.value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, next);
    }
    await page.waitForTimeout(70);
  }
};
async function capture(step, distance) {
  await page.locator('[data-sim="angle"]').fill('0');
  await page.locator('[data-sim="distance"]').fill(String(distance));
  await page.locator('[data-sim="midpointX"]').fill('160');
  await page.waitForTimeout(400);
  await page.locator(`[data-capture="${step}"]`).click();
  await page.locator(`[data-capture="${step}"][data-done]`).waitFor({ timeout: 10000 });
}
async function calibrate(close = 50, far = 180) {
  await capture('neutral', 100); await capture('close', close); await capture('far', far);
  await page.locator('[data-role="confirm-direction"]').check(); await page.locator('[data-action="save"]').click();
}
try {
  await page.goto(`${base}/dev/motion.html`);
  await page.locator('#calibrate-b').check();
  await page.locator('[data-action="synthetic"]').click();
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.frame !== null, undefined, { timeout: 20000 });
  const first = await inspect();
  assert.equal(first.diagnostics.frame.candidates.anchor.length, 1); assert.equal(first.diagnostics.frame.candidates.guide.length, 1);
  assert.ok(Math.abs(first.diagnostics.frame.candidates.anchor[0].cx - 209.5) < 1);
  assert.equal(await page.evaluate(() => window.__cameraRequests), 0);
  record('red/green noisy RGBA frame -> real local OpenCV Worker; known centroids; no camera request');
  await calibrate();
  await page.waitForFunction(() => document.querySelector('[data-role="calibration-title"]').textContent.includes('B'));
  await calibrate(70, 210);
  assert.deepEqual((await inspect()).diagnostics.profileVersions, { A: 1, B: 1 });
  record('three continuous calibration samples per player; A/B profiles stay independent');
  await tween({ distance: 50, midpointX: 80 });
  await page.waitForFunction(() => window.__motionLab.inspect().context.phase === 'adjust', undefined, { timeout: 10000 });
  assert.equal((await inspect()).context.selectedBallId, 'normal');
  await tween({ midpointX: 160, distance: 150, angle: 25 });
  await page.waitForFunction(() => { const c = window.__motionLab.inspect().context; return c.previewShot?.aimDeg > 20 && c.previewShot?.power01 > .6; });
  assert.equal((await inspect()).context.phase, 'adjust');
  record('neutral reacquisition + dwell selection + simultaneous angle/power preview without holding still');
  await page.screenshot({ path: path.join(output, '01-red-green-ready.png'), fullPage: true });
  await page.locator('[data-command="ARM_SHOT"]').click(); const locked = (await inspect()).context.lockedShot;
  await tween({ angle: -20, distance: 90 });
  assert.deepEqual((await inspect()).context.lockedShot, locked);
  assert.equal((await inspect()).commands.filter(item => item.command.source === 'motion' && ['ARM_SHOT', 'FIRE', 'CANCEL_SHOT'].includes(item.command.type)).length, 0);
  await page.locator('[data-command="FIRE"]').click(); assert.equal((await inspect()).context.phase, 'resolving');
  record('keyboard locks frozen values and fires; body motion never confirms or fires in phase one');
  await page.locator('#switch-player').click();
  await tween({ distance: 140, angle: 0 }); await page.waitForTimeout(1100);
  assert.equal((await inspect()).diagnostics.observation.rearmed, false);
  await tween({ distance: 70 });
  await page.waitForFunction(() => window.__motionLab.inspect().context.motionEnabled, undefined, { timeout: 8000 });
  record('player change clears readiness and requires the other player’s neutral pose');
  await page.waitForFunction(() => window.__motionLab.inspect().context.phase === 'adjust');
  await page.locator('[data-command="ARM_SHOT"]').click(); await set({ hideGuide: true });
  await page.waitForFunction(() => !window.__motionLab.inspect().context.motionEnabled);
  assert.equal((await inspect()).context.lockedShot, null); assert.equal((await inspect()).diagnostics.observation, null);
  await page.locator('[data-command="ARM_SHOT"]').click(); await page.waitForTimeout(300);
  assert.equal((await inspect()).context.phase, 'armed');
  record('missing hand invalidates current motion lock once; keyboard remains usable while missing');
  await page.locator('#restart-lab').click(); await page.locator('#calibrate-b').uncheck();
  await page.locator('[data-role="mode"]').selectOption('green-green');
  await page.locator('[data-action="synthetic"]').click(); await calibrate();
  await set({ distance: 50, angle: 0 });
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.observation?.rearmed === true, undefined, { timeout: 10000 });
  const green = await inspect(); assert.equal(green.diagnostics.frame.candidates.anchor.length, 2);
  assert.notDeepEqual(green.diagnostics.observation.pair.anchor, green.diagnostics.observation.pair.guide);
  await page.screenshot({ path: path.join(output, '02-double-green.png'), fullPage: true });
  record('two green components form two distinct hands, with one shared colour mask');
  await page.locator('[data-action="recalibrate"]').click();
  assert.equal(await page.locator('[data-role="mode"]').inputValue(), 'green-green');
  await page.locator('[data-action="cancel"]').click();
  assert.equal((await inspect()).diagnostics.profileVersions.A, 1);
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.observation?.rearmed === true, undefined, { timeout: 8000 });
  record('local recalibration preserves colour settings; cancel preserves the previous valid profile');
  await set({ distance: 10 });
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.feedback?.validPair === false);
  await set({ distance: 100, angle: 90 });
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.feedback?.reason === 'AMBIGUOUS_BLOBS');
  await set({ angle: 0, distractor: true });
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.frame?.candidates.anchor.length === 3);
  assert.equal((await inspect()).diagnostics.feedback.validPair, false);
  record('merged green hands, vertical crossing and ambiguous third green component all disable input');
  await set({ distractor: false, noise: 1, brightness: .55, distance: 50 });
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.observation?.rearmed === true, undefined, { timeout: 10000 });
  assert.equal((await inspect()).stats.maxInFlight, 1);
  record('recovers under dense small noise and reduced brightness; maximum one frame in flight');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, '03-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  record('motion lab and control panel fit a 390px viewport');
  for (let i = 0; i < 3; i++) {
    await page.locator('#restart-lab').click(); await page.locator('[data-action="synthetic"]').click();
    await page.waitForFunction(() => window.__motionLab.inspect().stats?.received > 2);
    await page.locator('[data-action="stop"]').click();
    await page.waitForFunction(() => document.querySelector('.motion-panel') === null);
    assert.equal((await inspect()).stats, null);
  }
  record('three start/stop cycles close the pipeline and settle pending calibration');
  await page.locator('#restart-lab').click(); await page.locator('[data-action="camera"]').click();
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.feedback?.reason === 'CAMERA_DENIED');
  assert.equal(await page.evaluate(() => window.__cameraRequests), 1);
  record('simulated camera permission denial reports CAMERA_DENIED without retry loops');
  await page.locator('#restart-lab').click();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      const draw = () => { ctx.fillStyle = '#26343b'; ctx.fillRect(0, 0, 320, 240); ctx.fillStyle = '#00df40'; ctx.fillRect(200, 100, 20, 28); ctx.fillStyle = '#f62535'; ctx.fillRect(100, 100, 20, 28); };
      draw(); window.__testCameraTimer = setInterval(draw, 40);
      window.__testCameraStream = canvas.captureStream(25); return window.__testCameraStream;
    };
  });
  await page.locator('[data-action="camera"]').click();
  await page.waitForFunction(() => window.__motionLab.inspect().diagnostics.frame?.candidates.anchor.length === 1, undefined, { timeout: 20000 });
  assert.equal(await page.evaluate(() => window.__testCameraStream.getVideoTracks()[0].readyState), 'live');
  await page.locator('[data-action="stop"]').click();
  assert.equal(await page.evaluate(() => window.__testCameraStream.getVideoTracks()[0].readyState), 'ended');
  await page.evaluate(() => clearInterval(window.__testCameraTimer));
  record('synthetic MediaStream exercises video.play, camera frame capture and track shutdown (no physical camera)');
  await page.goto(`${base}/dev/game.html`);
  await page.locator('#start-game:not([disabled])').waitFor();
  await page.locator('#input-select').selectOption('motion'); await page.locator('#start-game').click();
  await page.locator('[data-action="synthetic"]').click(); await calibrate();
  await page.locator('[data-sim="distance"]').fill('50');
  await page.waitForFunction(() => window.__flockDebug.host.getContext().motionEnabled, undefined, { timeout: 10000 });
  await page.waitForFunction(() => window.__flockDebug.host.getContext().phase === 'adjust');
  await tween({ distance: 140, angle: 20 });
  await page.waitForFunction(() => window.__flockDebug.host.getContext().previewShot?.aimDeg > 15);
  await page.locator('#game canvas').click({ position: { x: 300, y: 200 } }); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__flockDebug.host.getContext().phase), 'armed');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__flockDebug.host.getContext().phase === 'select', undefined, { timeout: 15000 });
  assert.equal(await page.evaluate(() => window.__flockDebug.host.getSnapshot().shotsTaken), 1);
  await page.screenshot({ path: path.join(output, '04-game-integrated.png'), fullPage: true });
  record('A game loads B factory: synthetic pixels -> calibrated motion preview -> keyboard lock/fire -> real physics next turn');
  assert.equal(await page.evaluate(() => window.__cameraRequests), 0);
  assert.deepEqual(errors, []); record('no browser runtime or HTTP errors');
} catch (error) {
  errors.push(String(error));
  await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
  try { await writeFile(path.join(output, 'failure-state.json'), JSON.stringify(await inspect(), null, 2)); } catch {}
  process.exitCode = 1;
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ date: new Date().toISOString(), base, checks, errors }, null, 2));
  console.log(JSON.stringify({ checks: checks.length, errors })); await browser.close();
}
