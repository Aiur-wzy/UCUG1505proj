import { menuMarkup } from '../scenes/MenuScene';
import { birdSvg } from './art';
export function layout(debug: boolean): string {
  return `<header class="site-header"><a class="brand" href="#" aria-label="Flock and Flick 首页"><span class="brand-symbol">${birdSvg()}</span><span>flock <em>&</em> flick</span></a><span class="project-tag">A LITTLE CURLING. A LOT OF CHARACTER.</span><button id="mute" class="sound-button" aria-pressed="false" aria-label="静音">♫ <span>声音开启</span></button></header>
  <main>${menuMarkup()}
  <section id="play-screen" hidden>
    <div class="play-heading"><div><p class="eyebrow" id="mode-label"></p><h1 id="level-title"></h1></div><div class="play-tools"><button class="text-button" data-action="menu">← 首页</button><button class="secondary compact" data-action="retry">重新开始</button><button id="pause" class="secondary compact" data-action="pause">Ⅱ 暂停</button></div></div>
    <div class="game-layout"><div class="arena-column">
      <div class="scoreboard"><div id="player-a" class="player-summary"><b class="player-badge">A</b><div><strong>青羽队</strong><span id="stock-a"></span></div><span class="player-turn" id="turn-a">当前回合</span></div><div id="goal-summary" class="goal-summary"><span>目标</span><strong id="goal-value"></strong></div><div id="player-b" class="player-summary player-b" hidden><b class="player-badge">B</b><div><strong>珊瑚队</strong><span id="stock-b"></span></div><span class="player-turn" id="turn-b" hidden>当前回合</span></div><div class="turn-count"><span>投掷进度</span><strong id="turn-counter"></strong></div></div>
      <div class="arena-wrap"><div id="game"></div><div class="arena-caption"><span>FLOCK & FLICK / LITTLE ICE CLUB</span><span id="arena-rule"></span></div>
        <div id="pause-overlay" class="arena-overlay" hidden><div><span class="eyebrow">TAKE A BREATHER</span><h2>小鸟休息一下。</h2><p>瞄准已解锁，场上的小鸟会等你。</p><button class="primary" data-action="pause">继续游戏 ↗</button></div></div>
        <div id="result-overlay" class="arena-overlay result-overlay" hidden></div>
      </div>
      <div class="arena-footer"><span><i class="status-dot"></i> <span id="field-status"></span></span><span id="provisional-score"></span></div>
      <div class="keyboard-help"><span><kbd>1</kbd><kbd>2</kbd> 选球</span><span><kbd>←</kbd><kbd>→</kbd> 瞄准</span><span><kbd>↑</kbd><kbd>↓</kbd> 力度</span><span><kbd>Enter</kbd> 锁定</span><span><kbd>Space</kbd> 发射</span><span><kbd>Esc</kbd> 取消</span></div>
    </div><aside class="control-panel">
      <div class="step-indicator"><span class="step-dot" data-step="select">1</span><i></i><span class="step-dot" data-step="adjust">2</span><i></i><span class="step-dot" data-step="armed">3</span></div>
      <p class="eyebrow" id="phase-kicker"></p><h2 id="phase-title"></h2><p id="phase-description" class="phase-description"></p><div id="inventory" class="inventory"></div>
      <div class="shot-settings"><div class="setting-row"><label for="aim-range">瞄准角度</label><output id="aim-value">0°</output></div><input id="aim-range" type="range" min="-50" max="50" step="1" value="0"><div class="range-labels"><span>左 −50°</span><span>右 +50°</span></div><div class="setting-row power-row"><label for="power-range">投掷力度</label><output id="power-value">58<span>%</span></output></div><input id="power-range" type="range" min="0" max="100" step="1" value="58"><div class="range-labels"><span>轻轻一拨</span><span>全力出发</span></div><p id="preview-note" class="preview-note">虚线显示预计轨迹</p></div>
      <button id="shot-action" class="primary full-width" disabled>先选择一只小鸟</button><button id="cancel-shot" class="text-button full-width" disabled>取消 · Esc</button>
      <div class="input-source"><span class="source-heading">瞄准方式</span><div class="source-buttons"><button id="keyboard-source" aria-pressed="true">键盘 / 鼠标</button><button id="motion-source" aria-pressed="false">双色手套</button></div><p id="motion-status" class="small-note"></p><button id="calibrate" class="text-button" hidden>启动 / 重新校准手套</button></div>
    </aside></div><div id="diagnostic" class="diagnostic" hidden role="alert"></div>
    <div id="camera-panel" class="camera-panel" hidden><div><h2>手套校准</h2><p>完成校准后进入游戏。也可以直接使用键鼠继续。</p><button class="secondary" data-action="skip-calibration">使用键鼠继续</button></div><div id="camera-mount"></div></div>
  </section>
  ${debug ? '<details class="debug-panel" open><summary>游戏联调台 · 模拟体感，不使用摄像头</summary><div class="debug-controls"><button data-debug="ready">持续模拟手套就绪</button><button data-debug="lost">模拟遮挡</button><button data-debug="silent">停止反馈</button><button data-debug="select">体感选普通球</button><button data-debug="preview">体感预览 12° / 60%</button><button data-debug="replay">重放最近 FIRE</button><label>焦点隔离测试 <input id="debug-focus" placeholder="在此按 Enter / 空格，不应发射"></label></div><pre id="debug-state"></pre></details>' : ''}
  </main><footer class="site-footer"><span>FLOCK & FLICK <i>©</i> 2026</span><span>Creative Coding & Interactive Art · UCUG1505</span><span>让每一次轻拨，都有回应。</span></footer><div id="toast" class="toast" role="status" hidden></div>`;
}
