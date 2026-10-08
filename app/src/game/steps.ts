// Step detection from the accelerometer. Pure: feed samples in, get steps out.
// Each step is a bounce in the magnitude of acceleration (gravity included). We track gravity with a slow
// average, smooth the signal with a fast one, and count a step when the bounce rises past a threshold after
// having settled. A minimum gap between steps stops shaking the phone from counting faster than a person runs.

export const STEP = {
  rise: 1.1, // m/s² above the baseline to count a step
  settle: 0.3, // m/s² the signal must drop below before the next step can count
  minGapMs: 270, // about 3.7 steps per second at most
  baseline: 0.02, // slow average: gravity
  smooth: 0.35, // fast average: noise
} as const;

export class StepDetector {
  private base = NaN;
  private smooth = NaN;
  private armed = true;
  private last = -Infinity;

  /** Feeds one sample (m/s², gravity included; t in ms). Returns 1 when it completes a step, else 0. */
  push(x: number, y: number, z: number, t: number): 0 | 1 {
    const m = Math.hypot(x, y, z);
    if (!Number.isFinite(m)) return 0;
    if (Number.isNaN(this.base)) {
      this.base = this.smooth = m;
      return 0;
    }
    this.base += (m - this.base) * STEP.baseline;
    this.smooth += (m - this.smooth) * STEP.smooth;
    const d = this.smooth - this.base;
    if (!this.armed) {
      if (d < STEP.settle) this.armed = true;
      return 0;
    }
    if (d > STEP.rise && t - this.last >= STEP.minGapMs) {
      this.armed = false;
      this.last = t;
      return 1;
    }
    return 0;
  }
}
