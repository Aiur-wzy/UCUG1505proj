type Cue = 'select' | 'arm' | 'fire' | 'collision' | 'result';
export class GameAudio {
  muted = false;
  private context: AudioContext | null = null;
  private lastCollision = -Infinity;
  unlock(): void {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(cue: Cue): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    if (cue === 'collision' && now - this.lastCollision < 0.12) return;
    if (cue === 'collision') this.lastCollision = now;
    const notes: Record<Cue, number[]> = { select: [440], arm: [660, 880], fire: [360, 180], collision: [210], result: [523.25, 659.25, 783.99] };
    for (const [index, frequency] of notes[cue].entries()) {
      const at = now + index * 0.085, oscillator = this.context.createOscillator(), gain = this.context.createGain();
      oscillator.type = cue === 'fire' ? 'sine' : 'triangle'; oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(cue === 'collision' ? 0.035 : 0.065, at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      oscillator.connect(gain); gain.connect(this.context.destination); oscillator.start(at); oscillator.stop(at + 0.17);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  }
  destroy(): void { void this.context?.close().catch(() => {}); this.context = null; }
}
