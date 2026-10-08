// Counts steps with the phone's motion sensor while a walk quest is open. Nothing leaves the phone.
// The screen stays on (wake lock) because browsers pause motion events when it turns off.
// With no motion sensor (a laptop), steps are estimated from time at a gentle walking pace, and the UI says so.
import { StepDetector } from "../game/steps";

export type PedometerMode = "starting" | "sensor" | "needs-permission" | "estimate";

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const ESTIMATE_STEPS_PER_SEC = 1.6;
const SENSOR_GRACE_MS = 2500;

let detector: StepDetector | null = null;
let onStep: ((n: number) => void) | null = null;
let onMode: ((m: PedometerMode) => void) | null = null;
let mode: PedometerMode = "starting";
let graceTimer = 0;
let estimateTimer = 0;
let wakeLock: { release(): Promise<void> } | null = null;
/** Motion permission (iOS and newer Chromium ask for it, and only inside a tap). */
let permission: Promise<boolean> | null = null;

const motionApi = () => (window as unknown as { DeviceMotionEvent?: MotionPermission }).DeviceMotionEvent;

/** Call inside the tap that starts a walk, so the browser may ask for motion access right then. */
export function primeMotion() {
  const DM = motionApi();
  if (typeof DM?.requestPermission !== "function") return;
  permission ??= DM.requestPermission().then((r) => r === "granted", () => false);
}

function setMode(m: PedometerMode) {
  mode = m;
  onMode?.(m);
}

function onMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null || a.z == null) return;
  if (mode !== "sensor") {
    clearTimeout(graceTimer);
    clearInterval(estimateTimer);
    setMode("sensor");
  }
  if (detector!.push(a.x, a.y, a.z, e.timeStamp)) onStep?.(1);
}

function startEstimate() {
  setMode("estimate");
  let carry = 0;
  let last = performance.now();
  estimateTimer = window.setInterval(() => {
    const now = performance.now();
    if (document.visibilityState === "visible") carry += ((now - last) / 1000) * ESTIMATE_STEPS_PER_SEC;
    last = now;
    const whole = Math.floor(carry);
    if (whole > 0) {
      carry -= whole;
      onStep?.(whole);
    }
  }, 1000);
}

async function lockScreen() {
  try {
    wakeLock = (await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
  } catch {
    wakeLock = null; // not allowed here; steps still count while the screen is on
  }
}
const relock = () => { if (detector && document.visibilityState === "visible") void lockScreen(); };

function listen() {
  window.addEventListener("devicemotion", onMotion);
  graceTimer = window.setTimeout(() => { if (mode !== "sensor") startEstimate(); }, SENSOR_GRACE_MS);
}

/** Starts counting. Calls `steps` with each batch of new steps and `modeChange` when the source changes. */
export function startPedometer(steps: (n: number) => void, modeChange: (m: PedometerMode) => void) {
  stopPedometer();
  detector = new StepDetector();
  onStep = steps;
  onMode = modeChange;
  void lockScreen();
  document.addEventListener("visibilitychange", relock);
  const DM = motionApi();
  if (!DM) return startEstimate();
  setMode("starting");
  if (typeof DM.requestPermission !== "function") return listen();
  // Asked during the tap (primeMotion); otherwise ask again with a button.
  void (permission ?? Promise.resolve(false)).then((ok) => {
    if (!detector) return;
    if (ok) listen();
    else {
      permission = null;
      setMode("needs-permission");
    }
  });
}

/** iOS: call from a tap. */
export async function allowMotion() {
  primeMotion();
  try {
    if (await permission) {
      setMode("starting");
      listen();
      return;
    }
  } catch {
    /* declined */
  }
  startEstimate();
}

export function stopPedometer() {
  window.removeEventListener("devicemotion", onMotion);
  document.removeEventListener("visibilitychange", relock);
  clearTimeout(graceTimer);
  clearInterval(estimateTimer);
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
  detector = null;
  onStep = null;
  onMode = null;
  mode = "starting";
}
