import defaults from '../../shared/defaults.json';
export const isSlow = (speed: number, angularSpeed: number) => speed < defaults.physics.settleLinearSpeed && Math.abs(angularSpeed) < defaults.physics.settleAngularSpeed;
export class Settling {
  private heldMs = 0;
  reset(): void { this.heldMs = 0; }
  step(allSlow: boolean, effectsDone: boolean, delta: number): boolean {
    this.heldMs = allSlow && effectsDone ? this.heldMs + delta : 0;
    return this.heldMs + 1e-7 >= defaults.physics.settleHoldMs;
  }
}
