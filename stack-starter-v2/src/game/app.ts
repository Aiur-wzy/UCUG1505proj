import Phaser from 'phaser';
import defaults from '../shared/defaults.json';
import type { InputSource } from '../shared/contract';
import { InputHost } from '../input/inputHost';
import { KeyboardInput } from '../input/keyboard';
import { MotionBridge } from '../input/motionBridge';
import type { BallSnapshot, GameState, Mode } from './core/gameState';
import { totalShots } from './core/modeRules';
import { scoreSolo } from './core/soloMode';
import { scoreCurling } from '../core/scoring';
import { levels } from './config/levels';
import { ballDefinitions } from './config/ballDefinitions';
import { GameAudio } from './audio';
import { resultMarkup } from './scenes/ResultScene';
import { PlayScene } from './scenes/PlayScene';
import { birdSvg } from './ui/art';
import { layout } from './ui/layout';
import { predictPath } from './physics/shotMath';
import { installDebug } from './dev/debug';

const feedbackReasons: Record<string, string> = {
  NONE: '等待手套重新就绪', CAMERA_DENIED: '摄像头权限未开启', CAMERA_MISSING: '未找到摄像头', COLOR_MISSING: '有一只手套不在画面中',
  AMBIGUOUS_BLOBS: '检测到相似颜色，请清理背景', PAIR_TOO_CLOSE: '请稍微分开双手', POSITION_JUMP: '手套位置变化过快', CALIBRATION_REQUIRED: '需要校准手套',
  PROFILE_MISMATCH: '请切换到当前玩家的校准档案', VISION_INIT_FAILED: '视觉模块启动失败', WORKER_FAILED: '视觉计算中断', FRAME_TIMEOUT: '手套画面已过期',
};
export function bootstrap(debug = false): () => void {
  const root = document.querySelector<HTMLElement>('#app')!;
  root.innerHTML = layout(debug);
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const audio = new GameAudio();
  let host: InputHost, input: KeyboardInput, motion: MotionBridge, scene: PlayScene;
  let menuMode: Mode = 'solo', toastTimer: ReturnType<typeof setTimeout>, previous: GameState | null = null, inventoryKey = '', resultKey = '', showPrediction = false;
  const abort = new AbortController();
  const notice = (message: string) => { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4200); };
  const on = (element: EventTarget, type: string, listener: EventListener) => element.addEventListener(type, listener, { signal: abort.signal });
  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: 1000, height: 700, backgroundColor: '#e9f0e7',
    render: { antialias: true, roundPixels: false }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'matter', matter: { gravity: { x: 0, y: 0 }, autoUpdate: false } },
    scene: [new PlayScene(readyScene => {
      scene = readyScene;
      host = new InputHost({ cameraMount: $('#camera-mount'), physics: scene.world });
      input = new KeyboardInput(host, game.canvas, notice); motion = new MotionBridge(host, notice);
      scene.events.on('settled', (session: string, shot: string, balls: BallSnapshot[]) => host.completeShot(session, shot, balls));
      scene.events.on('diagnostic', (message: string) => host.diagnostic(message));
      scene.bindTick(() => host.tick()); host.subscribe(render);
      $('#start-game').removeAttribute('disabled'); $('#start-game').innerHTML = '开始这一局 <span>↗</span>';
      const option = $('#input-select').querySelector<HTMLOptionElement>('option[value="motion"]')!;
      option.disabled = !motion.available;
      if (!motion.available) { option.textContent = '双色手套 · 待接入'; $('#motion-menu-note').hidden = false; }
      if (debug) installDebug(host, scene, input, root, abort.signal);
    }, audio)],
  });
  function render(state: GameState): void {
    const c = state.context; scene.setState(state);
    $('#menu-screen').hidden = c.scene !== 'menu'; $('#play-screen').hidden = c.scene === 'menu';
    if (previous?.context.scene === 'menu' && c.scene !== 'menu') requestAnimationFrame(() => { game.scale.refresh(); input.focus(); });
    if (previous && previous.context.phase !== c.phase) {
      if (c.phase === 'adjust' && previous.context.phase === 'select') audio.play('select');
      if (c.phase === 'armed') audio.play('arm');
      if (c.phase === 'resolving') audio.play('fire');
      if (c.scene === 'result') audio.play('result');
    }
    $('#mode-label').textContent = state.mode === 'solo' ? `SOLO FLIGHT / 单人闯关 · ${String(state.levelIndex + 1).padStart(2, '0')} / 05` : 'FRIENDLY RIVALRY / 本地双人对战';
    $('#level-title').textContent = state.mode === 'solo' ? levels[state.levelIndex].name : '好朋友，也要争个中心。';
    $('#player-b').hidden = state.mode !== 'duel'; $('#goal-summary').hidden = state.mode !== 'solo'; $('#goal-value').textContent = `${levels[state.levelIndex].target} 分`;
    for (const player of ['A', 'B'] as const) {
      const id = player.toLowerCase();
      $(`#stock-${id}`).textContent = `${Object.values(state.inventories[player]).reduce((a, b) => a + b, 0)} 只待出发`;
      $(`#turn-${id}`).hidden = c.activePlayerId !== player || c.scene === 'result';
      $(`#player-${id}`).classList.toggle('active', c.activePlayerId === player);
    }
    $('#turn-counter').textContent = `${String(Math.min(state.shotsTaken + (c.phase === 'resolving' || c.scene === 'result' ? 0 : 1), totalShots(state.mode))).padStart(2, '0')} / ${String(totalShots(state.mode)).padStart(2, '0')}`;
    $('#arena-rule').textContent = state.mode === 'solo' ? '球心入区 · 取最高分' : '更靠近中心的一方得分';
    const phaseCopy = {
      inactive: ['TAKE A MOMENT', c.scene === 'calibration' ? '先认识一下双手。' : '这一局，收好啦。', c.scene === 'calibration' ? '请完成下方校准，或用键鼠继续。' : '每一次投掷，都是新的故事。'],
      select: ['PICK YOUR BIRD', `${c.activePlayerId === 'B' ? 'B 队，' : ''}选一只，出发吧。`, '每只小鸟，都有自己的拿手好戏。'],
      adjust: ['FIND YOUR LINE', '找一个好落点。', '移动鼠标瞄准，滚轮调整力度。也可以拖动下方滑杆。'],
      armed: ['READY TO FLICK', '瞄准锁定，准备起飞。', '方向和力度已锁定。按空格发射，或按 Esc 重新调整。'],
      resolving: ['ENJOY THE SLIDE', '看它滑向哪里。', '等所有小鸟和气场停稳，下一投就可以开始。'],
    }[c.phase];
    $('#phase-kicker').textContent = phaseCopy[0]; $('#phase-title').textContent = phaseCopy[1]; $('#phase-description').textContent = phaseCopy[2];
    root.querySelectorAll<HTMLElement>('[data-step]').forEach(dot => dot.classList.toggle('current', dot.dataset.step === c.phase));
    const key = JSON.stringify([c.ballOptions, c.selectedBallId, c.phase, c.inputEnabled, c.activePlayerId]);
    if (key !== inventoryKey) {
      inventoryKey = key;
      $('#inventory').innerHTML = c.ballOptions.map((option, index) => {
        const ball = ballDefinitions.find(ball => ball.id === option.id)!;
        return `<button class="bird-card ${c.selectedBallId === option.id ? 'selected' : ''}" data-ball="${option.id}" aria-label="${option.label}，剩余 ${option.remaining} 只" ${!c.inputEnabled || c.phase !== 'select' || !option.remaining ? 'disabled' : ''}>${birdSvg('#' + ball.color.toString(16))}<span><strong>${ball.name}<small>${ball.label}</small></strong><span class="bird-description">${ball.description}</span></span><span class="stock-count">×${option.remaining}<kbd>${index + 1}</kbd></span></button>`;
      }).join('');
    }
    const shot = c.lockedShot ?? c.previewShot ?? defaults.defaultShot;
    $('#aim-value').textContent = `${shot.aimDeg > 0 ? '+' : ''}${shot.aimDeg.toFixed(0)}°`; $('#power-value').innerHTML = `${Math.round(shot.power01 * 100)}<span>%</span>`;
    for (const [name, value] of [['aim', shot.aimDeg], ['power', Math.round(shot.power01 * 100)]] as const) {
      const range = $<HTMLInputElement>(`#${name}-range`); range.value = String(value);
      range.disabled = !c.inputEnabled || !['adjust', 'armed'].includes(c.phase) || (c.phase === 'armed' && c.previewSource === 'keyboard');
    }
    const path = showPrediction && state.origin && c.previewShot ? predictPath(state.origin, shot, state.balls) : null;
    $('#preview-note').textContent = c.phase === 'armed' ? '● 已锁定 · 5 秒内发射' : !showPrediction ? '短箭头表示方向，凭手感控制落位。' : path?.event === 'collision' ? '调试预计 · 在首次碰球处结束' : path?.event === 'out' ? '调试预计 · 从下方出口离场' : '调试预计 · 含墙壁反弹，不含特殊效果';
    const action = $<HTMLButtonElement>('#shot-action');
    action.textContent = c.phase === 'adjust' ? '锁定瞄准　↵ Enter' : c.phase === 'armed' ? '轻拨，出发！　Space' : c.phase === 'resolving' ? '小鸟正在滑行…' : '先选择一只小鸟';
    action.disabled = !c.inputEnabled || !['adjust', 'armed'].includes(c.phase); $<HTMLButtonElement>('#cancel-shot').disabled = action.disabled;
    $('#keyboard-source').setAttribute('aria-pressed', String(c.previewSource === 'keyboard')); $('#motion-source').setAttribute('aria-pressed', String(c.previewSource === 'motion'));
    $<HTMLButtonElement>('#keyboard-source').disabled = c.phase === 'resolving' || c.scene === 'result'; $<HTMLButtonElement>('#motion-source').disabled = c.phase === 'resolving' || c.scene === 'result' || (!motion.available && !debug);
    $<HTMLButtonElement>('#calibrate').disabled = c.phase === 'resolving' || c.scene === 'result';
    $('#motion-status').textContent = c.previewSource === 'keyboard' ? '移动鼠标瞄准，滚轮调整力度。' : c.motionEnabled ? '手套已就绪 · Enter 锁定，空格发射。' : `${state.feedback?.reason === 'NONE' && state.feedback?.tracking === 'ready' ? '手套画面已过期，请重新就绪' : feedbackReasons[state.feedback?.reason ?? 'CALIBRATION_REQUIRED'] ?? '等待手套'}。键鼠确认仍可用。`;
    $('#calibrate').hidden = !motion.available || c.previewSource !== 'motion'; $('#camera-panel').hidden = c.previewSource !== 'motion' || !motion.available;
    $('#pause-overlay').hidden = !state.paused; $('#pause').textContent = state.paused ? '▷ 继续' : 'Ⅱ 暂停'; $<HTMLButtonElement>('#pause').disabled = c.scene !== 'play';
    $('#diagnostic').hidden = !state.diagnostic; $('#diagnostic').textContent = state.diagnostic;
    $('#field-status').textContent = c.scene === 'result' ? '本局已结束 · 所有小鸟与气场均已停稳' : state.paused ? '已暂停' : c.phase === 'resolving' ? '等待小鸟与气场停稳' : c.phase === 'armed' ? '已锁定，按空格出发' : `轮到 ${c.activePlayerId ?? 'A'} 队 · ${state.mode === 'solo' ? levels[state.levelIndex].hint : '越靠近中心，越有机会得分。'}`;
    const score = state.mode === 'solo' ? `${scoreSolo(state.balls, levels[state.levelIndex])} 分` : (() => { const value = scoreCurling(state.balls, defaults.world.house, defaults.world.scoreEpsilon); return `A ${value.A} : ${value.B} B`; })();
    $('#provisional-score').textContent = `${c.phase === 'resolving' ? '上一投布局' : '当前布局'} ${score}`;
    $('#result-overlay').hidden = c.scene !== 'result';
    if (state.result && resultKey !== c.sessionId) { resultKey = c.sessionId; $('#result-overlay').innerHTML = resultMarkup(state); }
    previous = state;
  }
  on(root, 'click', event => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('button,a.brand');
    if (!button || button.hasAttribute('disabled')) return;
    audio.unlock();
    if (button.matches('.brand')) { event.preventDefault(); if (host) { motion.stop(); host.menu(); } return; }
    if (button.id === 'mute') { audio.muted = !audio.muted; button.setAttribute('aria-pressed', String(audio.muted)); button.setAttribute('aria-label', audio.muted ? '开启声音' : '静音'); button.innerHTML = `${audio.muted ? '♩' : '♫'} <span>${audio.muted ? '已静音' : '声音开启'}</span>`; return; }
    if (button.dataset.mode) {
      menuMode = button.dataset.mode as Mode;
      root.querySelectorAll<HTMLElement>('[data-mode]').forEach(option => { const selected = option.dataset.mode === menuMode; option.classList.toggle('selected', selected); option.setAttribute('aria-pressed', String(selected)); });
      $<HTMLSelectElement>('#level-select').disabled = menuMode !== 'solo'; return;
    }
    if (!host) return;
    if (button.id === 'start-game') {
      const source = $<HTMLSelectElement>('#input-select').value as InputSource;
      motion.stop(); host.start(menuMode, Number($<HTMLSelectElement>('#level-select').value), source);
      if (source === 'motion') void motion.start(); else input.focus();
    } else if (button.dataset.ball) { input.send('SELECT_BALL', { ballTypeId: button.dataset.ball }); input.focus(); }
    else if (button.id === 'shot-action') { input.send(host.getContext().phase === 'armed' ? 'FIRE' : 'ARM_SHOT', {}); input.focus(); }
    else if (button.id === 'cancel-shot') { input.send('CANCEL_SHOT', {}); input.focus(); }
    else if (button.id === 'keyboard-source' || button.dataset.action === 'skip-calibration') {
      if (host.getContext().scene === 'calibration') { motion.stop(); host.setCalibrating(false); }
      host.setPreviewSource('keyboard'); input.focus();
    } else if (button.id === 'motion-source') { host.setPreviewSource('motion'); if (motion.available) void motion.start(); input.focus(); }
    else if (button.id === 'calibrate') void motion.start();
    else if (button.dataset.action === 'pause') { host.setPaused(!host.getSnapshot().paused); input.focus(); }
    else if (button.dataset.action === 'retry') { const calibrating = host.getContext().scene === 'calibration'; if (calibrating) motion.stop(); host.retry(); if (calibrating) void motion.start(); input.focus(); }
    else if (button.dataset.action === 'next') { host.nextLevel(); input.focus(); }
    else if (button.dataset.action === 'menu') { motion.stop(); host.menu(); }
  });
  for (const id of ['aim', 'power']) on($(`#${id}-range`), 'input', () => {
    if (!host) return;
    const value = Number($<HTMLInputElement>(`#${id}-range`).value);
    host.setPreviewSource('keyboard'); const shot = host.getContext().previewShot!;
    input.send('PREVIEW_SHOT', { aimDeg: id === 'aim' ? value : shot.aimDeg, power01: id === 'power' ? value / 100 : shot.power01 });
  });
  if (debug) on($('#debug-prediction'), 'change', () => {
    showPrediction = $<HTMLInputElement>('#debug-prediction').checked;
    scene.setPredictionVisible(showPrediction);
    render(host.getSnapshot());
  });
  on(document, 'visibilitychange', () => { if (document.hidden && host?.getContext().scene === 'play') host.setPaused(true); });
  const onHidden = () => { if (host?.getContext().scene === 'play') host.setPaused(true); };
  game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
  on(window, 'pagehide', () => { motion?.stop(); host?.setPaused(true); });
  return () => { abort.abort(); clearTimeout(toastTimer); motion?.stop(); input?.destroy(); host?.destroy(); audio.destroy(); game.events.off(Phaser.Core.Events.HIDDEN, onHidden); game.destroy(true); delete window.__flockDebug; };
}
