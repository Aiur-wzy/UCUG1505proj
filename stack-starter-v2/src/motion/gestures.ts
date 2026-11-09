import defaults from '../shared/defaults.json';
import type { ControlCommand, ControlContext } from '../shared/contract';
import type { Observation } from './types';
import { clamp } from './types';

type Intent = Pick<Extract<ControlCommand, { type: 'SELECT_BALL' }>, 'type' | 'payload'>
  | Pick<Extract<ControlCommand, { type: 'PREVIEW_SHOT' }>, 'type' | 'payload'>;
export class MotionGestures {
  private slot = -1;
  private since = 0;
  private lastAt = -Infinity;
  private lastPreview = -Infinity;
  private sent = false;
  reset(): void { this.slot = -1; this.since = 0; this.lastAt = -Infinity; this.lastPreview = -Infinity; this.sent = false; }
  update(context: ControlContext, observation: Observation): { intent: Intent | null; focusedBallId: string | null; holdProgress01: number } {
    const result = { intent: null as Intent | null, focusedBallId: null as string | null, holdProgress01: 0 };
    const atMs = observation.atMs;
    if (atMs <= this.lastAt || atMs - this.lastAt > defaults.transport.maxSampleAgeMs) this.reset();
    this.lastAt = atMs;
    if (!observation.rearmed || !context.inputEnabled || !context.motionEnabled || context.previewSource !== 'motion') { this.reset(); return result; }
    if (context.phase === 'adjust' && context.allowedCommands.includes('PREVIEW_SHOT') && context.motionActionsEnabled.includes('PREVIEW_SHOT')) {
      if (atMs - this.lastPreview >= 1000 / defaults.gesture.previewMaxHz) {
        this.lastPreview = atMs;
        result.intent = { type: 'PREVIEW_SHOT', payload: { aimDeg: observation.aimDeg, power01: observation.power01 } };
      }
    } else if (context.phase === 'select' && context.allowedCommands.includes('SELECT_BALL') && context.motionActionsEnabled.includes('SELECT_BALL') && observation.r <= defaults.gesture.rearmNeutralMaxR) {
      const { selectionXMin: min, selectionXMax: max } = defaults.calibration;
      const x = observation.midpoint.x, count = context.ballOptions.length;
      if (!count || x < min || x > max) { this.reset(); return result; }
      const span = (max - min) / count, hysteresis = defaults.gesture.selectionHysteresis01;
      const retained = this.slot >= 0 && x >= min + this.slot * span - hysteresis && x <= min + (this.slot + 1) * span + hysteresis;
      const slot = retained ? this.slot : Math.min(count - 1, Math.floor((x - min) / span));
      if (slot !== this.slot) { this.slot = slot; this.since = atMs; this.sent = false; }
      const ball = context.ballOptions[slot];
      result.focusedBallId = ball.id;
      if (!ball.remaining) { this.since = atMs; return result; }
      result.holdProgress01 = clamp((atMs - this.since) / defaults.gesture.selectionHoldMs);
      if (!this.sent && result.holdProgress01 === 1) { this.sent = true; result.intent = { type: 'SELECT_BALL', payload: { ballTypeId: ball.id } }; }
    } else this.reset();
    // Phase 1 intentionally emits no ARM_SHOT, FIRE or CANCEL_SHOT.
    return result;
  }
}
