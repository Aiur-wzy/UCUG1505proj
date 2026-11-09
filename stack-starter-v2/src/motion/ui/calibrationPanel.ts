import type { PlayerId } from '../../shared/contract';
import type { ColorId, VisionConfig } from '../../shared/vision-worker';
import type { CalibrationStep } from '../calibration';
import type { GloveMode, HandPair, Observation } from '../types';
import { colorConfig, sampleHue, validateColors } from '../colors';
import { SyntheticScene } from '../dev/synthetic';
import type { VisionResult } from '../visionClient';
import './motion.css';

interface Actions {
  start: (camera: boolean) => void; stop: () => void;
  recalibrate: () => void;
  configure: (mode: GloveMode, config: VisionConfig) => void;
  capture: (step: CalibrationStep) => void; save: (sign: 1 | -1) => void; cancel: () => void;
}
const steps: Record<CalibrationStep, string> = { neutral: '自然水平姿势', close: '舒适近距离', far: '舒适远距离' };
export class CalibrationPanel {
  readonly root = document.createElement('section');
  readonly canvas: HTMLCanvasElement;
  readonly video = document.createElement('video');
  readonly synthetic: SyntheticScene;
  private overlay: HTMLCanvasElement;
  private abort = new AbortController();
  private mode: GloveMode = 'red-green';
  private config = colorConfig(this.mode);
  private camera = false;
  private picking: ColorId | null = null;
  private dragging: ColorId | null = null;
  constructor(mount: HTMLElement, private actions: Actions) {
    this.root.className = 'motion-panel';
    this.root.innerHTML = `
      <div class="motion-heading"><strong>双手向量 · 输入实验室</strong><span data-role="source-label">尚未启动</span></div>
      <div class="motion-toolbar"><label>手套配置 <select data-role="mode"><option value="red-green">一绿一红（推荐）</option><option value="green-green">两只绿色</option></select></label>
      <button type="button" data-action="camera">启动摄像头</button><button type="button" data-action="synthetic">启动模拟画面</button><button type="button" data-action="stop">停止输入</button></div>
      <button type="button" data-action="recalibrate" disabled>重新校准当前玩家（保留颜色）</button>
      <p class="motion-help">面对摄像头，绿色手套放在预览左侧。双绿模式请保持左右顺序、不交叉。转动双手连线改变方向，拉开双手增加力度。</p>
      <div class="motion-view"><canvas width="320" height="240" data-role="image"></canvas><canvas width="320" height="240" data-role="overlay" aria-label="双手画面；模拟模式下可拖动两只手"></canvas></div>
      <p data-role="status" role="status">选择一个输入源。模拟画面无需摄像头权限。</p>
      <div class="motion-metrics"><span>方向 <b data-role="angle">—</b></span><span>力度 <b data-role="power">—</b></span><span>就绪 <b data-role="ready">否</b></span></div>
      <p class="motion-small" data-role="timing">等待图像</p>
      <div class="motion-slots" data-role="slots"></div>
      <fieldset data-role="simulation" hidden><legend>模拟窗口 · 可拖动色块</legend>
        <label>右转角度 <input data-sim="angle" type="range" min="-85" max="85" step="1" value="0"></label>
        <label>双手距离 <input data-sim="distance" type="range" min="32" max="210" step="1" value="100"></label>
        <label>中点左右 <input data-sim="midpointX" type="range" min="40" max="280" step="1" value="160"></label>
        <label>背景噪声 <input data-sim="noise" type="range" min="0" max="1" step="0.05" value="0.35"></label>
        <label>画面亮度 <input data-sim="brightness" type="range" min="0.1" max="1" step="0.05" value="1"></label>
        <div class="motion-checks"><label><input data-sim="hideAnchor" type="checkbox">遮挡左手</label><label><input data-sim="hideGuide" type="checkbox">遮挡右手</label><label><input data-sim="distractor" type="checkbox">同色大干扰块</label></div>
      </fieldset>
      <details><summary>颜色阈值与取色</summary><p class="motion-small">改变颜色配置后需重新校准。点击取色按钮，再点画面中手套的中央。</p>
        <div class="motion-toolbar"><button type="button" data-pick="anchor">取左手绿色</button><button type="button" data-pick="guide">取右手颜色</button></div>
        <label>左手色相 <input data-color="anchor" type="range" min="0" max="359" value="120"></label>
        <label>右手色相 <input data-color="guide" type="range" min="0" max="359" value="0"></label>
        <label>色相容差 ±° <input data-color="span" type="range" min="5" max="35" value="18"></label>
        <label>最低饱和度 <input data-color="saturation" type="range" min="0.15" max="0.85" step="0.05" value="0.4"></label>
        <label>最低亮度 <input data-color="value" type="range" min="0.1" max="0.8" step="0.05" value="0.25"></label>
      </details>
      <fieldset data-role="calibration" hidden><legend data-role="calibration-title">玩家校准</legend>
        <p class="motion-small">固定站位，每步保持约 1 秒。近距离保持色块分开，远距离使用舒适的最大距离。</p>
        <div class="motion-toolbar">${(Object.keys(steps) as CalibrationStep[]).map((step, i) => `<button type="button" data-capture="${step}">${i + 1}. ${steps[step]}</button>`).join('')}</div>
        <progress data-role="progress" max="1" value="0"></progress><p data-role="calibration-note">依次记录三个姿势。</p>
        <label class="motion-inline"><input type="checkbox" data-role="invert">反转转动方向</label>
        <label class="motion-inline"><input type="checkbox" data-role="confirm-direction">已确认：向右转时读数为正，拉开时力度增加</label>
        <div class="motion-toolbar"><button type="button" data-action="save" disabled>保存当前玩家校准</button><button type="button" data-action="cancel">取消校准</button></div>
      </fieldset>
      <p class="motion-help">玩法：合拢到近距离并保持约 1 秒重新就绪；中点对准上方球槽停留选球。实时调整后，点击游戏画布恢复焦点，再用 Enter 锁定、空格发射、Esc 取消。</p>`;
    mount.replaceChildren(this.root);
    this.canvas = this.get<HTMLCanvasElement>('[data-role="image"]');
    this.overlay = this.get<HTMLCanvasElement>('[data-role="overlay"]');
    this.video.muted = true; this.video.playsInline = true;
    this.synthetic = new SyntheticScene(this.canvas); this.synthetic.draw();
    this.root.addEventListener('click', this.onClick, { signal: this.abort.signal });
    this.root.addEventListener('input', this.onInput, { signal: this.abort.signal });
    this.overlay.addEventListener('pointerdown', this.pointerDown, { signal: this.abort.signal });
    this.overlay.addEventListener('pointermove', this.pointerMove, { signal: this.abort.signal });
    this.overlay.addEventListener('pointerup', () => { this.dragging = null; }, { signal: this.abort.signal });
    this.overlay.addEventListener('pointercancel', () => { this.dragging = null; }, { signal: this.abort.signal });
  }
  private get<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  status(message: string): void { this.get('[data-role="status"]').textContent = message; }
  clearObservation(): void {
    for (const role of ['angle', 'power']) this.get(`[data-role="${role}"]`).textContent = '—';
    this.get('[data-role="ready"]').textContent = '否'; this.overlay.getContext('2d')!.clearRect(0, 0, 320, 240);
  }
  starting(): void { this.root.querySelectorAll<HTMLButtonElement>('[data-action="camera"],[data-action="synthetic"]').forEach(b => { b.disabled = true; }); this.status('正在启动本地识别…'); }
  source(camera: boolean): void { this.camera = camera; this.get('[data-role="simulation"]').hidden = camera; this.get('[data-role="source-label"]').textContent = camera ? '摄像头 · 镜像预览' : '模拟图像 · 同一识别管线'; }
  calibration(player: PlayerId): void {
    this.get<HTMLButtonElement>('[data-action="recalibrate"]').disabled = true;
    this.get('[data-role="calibration"]').hidden = false;
    this.get('[data-role="calibration-title"]').textContent = `玩家 ${player} · 三步校准`;
    this.get<HTMLInputElement>('[data-role="confirm-direction"]').checked = false;
    this.get<HTMLButtonElement>('[data-action="save"]').disabled = true;
    this.root.querySelectorAll<HTMLElement>('[data-capture]').forEach(b => { delete b.dataset.done; });
    this.progress(0, '依次记录中立姿势、近距离、远距离。');
  }
  completedStep(step: CalibrationStep): void { this.get(`[data-capture="${step}"]`).dataset.done = 'true'; this.canSave(); }
  startStep(step: CalibrationStep): void { delete this.get(`[data-capture="${step}"]`).dataset.done; this.canSave(); }
  canSave(): void { this.get<HTMLButtonElement>('[data-action="save"]').disabled = this.root.querySelectorAll('[data-capture][data-done]').length !== 3 || !this.get<HTMLInputElement>('[data-role="confirm-direction"]').checked; }
  finishCalibration(): void { this.get('[data-role="calibration"]').hidden = true; this.get<HTMLButtonElement>('[data-action="recalibrate"]').disabled = false; }
  progress(value: number, message: string): void { this.get<HTMLProgressElement>('[data-role="progress"]').value = value; this.get('[data-role="calibration-note"]').textContent = message; }
  get sign(): 1 | -1 { return this.get<HTMLInputElement>('[data-role="invert"]').checked ? -1 : 1; }
  slots(options: { id: string; label: string; remaining: number }[], focused: string | null, progress: number): void {
    this.get('[data-role="slots"]').replaceChildren(...options.map(option => {
      const el = document.createElement('span'); el.textContent = `${option.label} ×${option.remaining}`;
      el.className = option.id === focused ? 'focused' : ''; el.style.setProperty('--hold', `${option.id === focused ? progress * 100 : 0}%`); return el;
    }));
  }
  display(result: VisionResult, pair: HandPair | null, observation: Observation | null): void {
    if (this.camera && this.video.readyState >= 2) this.canvas.getContext('2d')!.drawImage(this.video, 0, 0, 320, 240);
    const ctx = this.overlay.getContext('2d')!; ctx.clearRect(0, 0, 320, 240);
    for (const [id, candidates] of Object.entries(result.candidates)) {
      if (this.mode === 'green-green' && id === 'guide') continue;
      ctx.strokeStyle = id === 'anchor' ? '#9be7b2' : '#ff9eab'; ctx.lineWidth = 1;
      for (const b of candidates) ctx.strokeRect(320 - b.x - b.width, b.y, b.width, b.height);
    }
    if (pair) {
      const a = pair.anchor, b = pair.guide; ctx.strokeStyle = '#fff4af'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x * 320, a.y * 320); ctx.lineTo(b.x * 320, b.y * 320); ctx.stroke();
      for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p.x * 320, p.y * 320, 4, 0, Math.PI * 2); ctx.stroke(); }
    }
    this.get('[data-role="angle"]').textContent = observation ? `${observation.aimDeg.toFixed(1)}°` : '—';
    this.get('[data-role="power"]').textContent = observation ? `${Math.round(observation.power01 * 100)}%` : '—';
    this.get('[data-role="ready"]').textContent = observation?.rearmed ? '是' : '否';
    this.get('[data-role="timing"]').textContent = `候选 ${result.candidates.anchor.length} / ${result.candidates.guide.length} · Worker ${result.processingMs.toFixed(1)} ms · 帧 ${result.token.frameId}${observation ? ` · 距离比 ${observation.r.toFixed(2)}` : ''}`;
  }
  private onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'camera' || action === 'synthetic') this.actions.start(action === 'camera');
    else if (action === 'stop') this.actions.stop();
    else if (action === 'recalibrate') this.actions.recalibrate();
    else if (action === 'save') this.actions.save(this.sign);
    else if (action === 'cancel') this.actions.cancel();
    else if (button.dataset.capture) this.actions.capture(button.dataset.capture as CalibrationStep);
    else if (button.dataset.pick) { this.picking = button.dataset.pick as ColorId; this.status('点击画面中的手套中央取色'); }
  };
  private configure(): void {
    try { validateColors(this.config, this.mode); this.actions.configure(this.mode, structuredClone(this.config)); }
    catch (error) { this.status(String(error instanceof Error ? error.message : error)); }
  }
  private onInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.sim) { this.synthetic.set({ [input.dataset.sim]: input.type === 'checkbox' ? input.checked : Number(input.value) }); return; }
    if (input.dataset.role === 'confirm-direction') { this.canSave(); return; }
    if (input.dataset.role === 'mode') {
      this.mode = input.value as GloveMode; this.config = colorConfig(this.mode); this.synthetic.mode = this.mode; this.synthetic.draw();
      for (const color of this.config.colors) this.get<HTMLInputElement>(`[data-color="${color.id}"]`).value = String(color.hueDeg);
      this.configure(); return;
    }
    const field = input.dataset.color;
    if (field) {
      const value = Number(input.value);
      if (field === 'anchor' || field === 'guide') {
        this.config.colors[field === 'anchor' ? 0 : 1].hueDeg = value;
        if (this.mode === 'green-green') this.config.colors.forEach(c => { c.hueDeg = value; });
      } else this.config.colors.forEach(color => {
        if (field === 'span') color.halfWidthDeg = value;
        if (field === 'saturation') color.saturationMin = value;
        if (field === 'value') color.valueMin = value;
      });
      this.configure();
    }
  };
  private pointer(event: PointerEvent): { x: number; y: number } {
    const rect = this.overlay.getBoundingClientRect();
    return { x: Math.max(12, Math.min(308, (event.clientX - rect.left) / rect.width * 320)), y: Math.max(16, Math.min(224, (event.clientY - rect.top) / rect.height * 240)) };
  }
  private pointerDown = (event: PointerEvent) => {
    const p = this.pointer(event);
    if (this.picking) {
      try {
        const rawX = Math.max(4, Math.min(315, Math.round(320 - p.x))), rawY = Math.round(p.y);
        const hue = sampleHue(this.canvas.getContext('2d')!.getImageData(rawX - 4, rawY - 4, 9, 9).data);
        this.config.colors[this.picking === 'anchor' ? 0 : 1].hueDeg = hue;
        if (this.mode === 'green-green') this.config.colors.forEach(c => { c.hueDeg = hue; });
        this.config.colors.forEach(c => { this.get<HTMLInputElement>(`[data-color="${c.id}"]`).value = String(Math.round(c.hueDeg)); });
        this.configure();
      } catch (error) { this.status(String(error)); }
      this.picking = null; return;
    }
    if (this.camera) return;
    const pair = this.synthetic.positions();
    const hands: ColorId[] = ['anchor', 'guide'];
    hands.sort((a, b) => Math.hypot(pair[a].x - p.x, pair[a].y - p.y) - Math.hypot(pair[b].x - p.x, pair[b].y - p.y));
    if (Math.hypot(pair[hands[0]].x - p.x, pair[hands[0]].y - p.y) > 35) return;
    this.dragging = hands[0]; this.overlay.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent) => { if (this.dragging) this.synthetic.move(this.dragging, this.pointer(event)); };
  destroy(): void { this.abort.abort(); this.root.remove(); }
}
