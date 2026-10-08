// Small pieces of feedback: an XP counter that ticks up, a countdown, a leaf burst.
import { html } from "lit-html";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** <xp-tick value="150">: counts from 0 to value once, then holds. */
class XpTick extends HTMLElement {
  value = 0;
  connectedCallback() {
    const target = this.value;
    if (reduced() || target <= 0) {
      this.textContent = `+${target}`;
      return;
    }
    const t0 = performance.now();
    const dur = Math.min(1200, 400 + target * 2);
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      this.textContent = `+${Math.round(target * eased)}`;
      if (p < 1 && this.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
if (!customElements.get("xp-tick")) customElements.define("xp-tick", XpTick);
export const xpTick = (value: number) => html`<xp-tick class="num" .value=${value} aria-hidden="true"></xp-tick>`;

/** <count-down>: shows m:ss until `until` (ms epoch), then fires "done". */
class CountDown extends HTMLElement {
  until = 0;
  private timer = 0;
  connectedCallback() {
    const tick = () => {
      const left = Math.max(0, this.until - Date.now());
      const s = Math.ceil(left / 1000);
      this.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (left <= 0) {
        clearInterval(this.timer);
        this.dispatchEvent(new CustomEvent("done", { bubbles: true }));
      }
    };
    tick();
    this.timer = window.setInterval(tick, 1000);
  }
  disconnectedCallback() {
    clearInterval(this.timer);
  }
}
if (!customElements.get("count-down")) customElements.define("count-down", CountDown);
export const countDown = (until: number) => html`<count-down class="num" .until=${until}></count-down>`;

/** Leaves thrown outward from behind a new card. Pure CSS; hidden under reduced motion. */
export const leafBurst = () =>
  html`<div class="leaf-burst" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => html`<i style="--i:${i}"></i>`)}</div>`;
