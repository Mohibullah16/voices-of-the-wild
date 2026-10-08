// First run: three short slides, then straight into the app. The field kit downloads in the background
// (src/app/kit.ts); nothing here touches the GPU.
import { html, nothing } from "lit-html";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { CATEGORY_IDS, emblemSvg, SHORT_NAME } from "../art/emblems";
import { markSvg } from "../art/logo";
import { useCloud, wantsMock } from "../app/embedder";
import { startKit } from "../app/kit";
import { state, update } from "../app/state";
import { audioPaths } from "../data";
import { estimateBytes, hasWebGPU, mb, planKit, storageInfo, type StorageInfo } from "../firstrun";
import { saveSettings } from "../store";
import { icon } from "./icons";
import { card } from "./card";

type Step = { kind: "intro"; webgpu: boolean | null; storage: StorageInfo | null; need: number; phone: boolean };

let step: Step = { kind: "intro", webgpu: null, storage: null, need: 0, phone: false };
let checked = false;

async function runChecks() {
  if (checked) return;
  checked = true;
  const data = state.data!;
  const files = planKit(audioPaths(data.roster), data.source === "real");
  const [webgpu, storage] = await Promise.all([hasWebGPU(), storageInfo()]);
  const cloud = useCloud();
  const need = cloud ? files.reduce((n, f) => n + (f.group === "voices" ? 30_000 : f.group === "runtime" ? 13_500_000 : 450_000), 0) : estimateBytes(files, webgpu || wantsMock());
  step = { kind: "intro", webgpu: webgpu || cloud, storage, need, phone: matchMedia("(pointer: coarse)").matches };
  update();
}

async function start() {
  state.settings = { ...state.settings, started: true };
  await saveSettings(state.settings);
  void startKit().catch(() => {}); // errors show on the trail, with a retry
  update((s) => (s.phase = "app"));
  location.hash = "#/";
  requestAnimationFrame(() => document.getElementById("listen-title")?.focus());
}

function brand() {
  return html`<div class="setup-brand">
    <a class="wordmark" href="#/" aria-label="Voices of the Wild">${unsafeSVG(markSvg(34))}<span class="wordmark-text">Voices <i>of the</i> Wild</span></a>
    <figure class="plate" aria-label="The thirteen kinds of things that talk">
      <figcaption class="plate-title"><span>Things that talk</span><span>13 kinds</span></figcaption>
      ${CATEGORY_IDS.map((c) => html`<figure>${unsafeSVG(emblemSvg(c, 64))}<figcaption>${SHORT_NAME[c]}</figcaption></figure>`)}
      <p class="plate-legend">A guardian and six or more voices each.</p>
    </figure>
  </div>`;
}

let slide = 0;

function goSlide(n: number) {
  slide = n;
  update();
  requestAnimationFrame(() => document.getElementById("setup-title")?.focus());
}

function sampleOwner() {
  const d = state.data!;
  return d.ordered.find((o) => o.elder && !o.guardian) ?? d.ordered[1]!;
}

function intro(s: Step) {
  void runChecks();
  const free = s.storage?.free;
  const tight = free != null && free < s.need * 1.15;
  const dots = html`<div class="dots" aria-hidden="true">${[0, 1, 2].map((i) => html`<i class=${i === slide ? "on" : ""}></i>`)}</div>`;
  if (slide === 0) {
    return html`<div class="setup-main onboard">
      <div class="onboard-visual orbit" aria-hidden="true">
        ${["trees", "birds", "water", "vehicles", "sky", "flowers"].map((c, i) => html`<span style="--i:${i}">${unsafeSVG(emblemSvg(c, 44))}</span>`)}
        <span class="orbit-camera">${icon("camera")}</span>
      </div>
      <h1 class="display-1" id="setup-title" tabindex="-1">Photograph something outside.</h1>
      ${dots}
      <div class="btn-row"><button class="btn btn-primary" type="button" @click=${() => goSlide(1)}>Next ${icon("arrowRight")}</button>
        <button class="btn btn-quiet" type="button" @click=${() => goSlide(2)}>Skip</button></div>
    </div>`;
  }
  if (slide === 1) {
    return html`<div class="setup-main onboard">
      <div class="onboard-visual" aria-hidden="true">${card(sampleOwner())}</div>
      <h1 class="display-1" id="setup-title" tabindex="-1">It talks back.</h1>
      ${dots}
      <div class="btn-row"><button class="btn btn-primary" type="button" @click=${() => goSlide(2)}>Next ${icon("arrowRight")}</button></div>
    </div>`;
  }
  return html`<div class="setup-main onboard">
    <div class="onboard-visual shield" aria-hidden="true">${icon("shield")}</div>
    <h1 class="display-1" id="setup-title" tabindex="-1">Nothing to sign up for.</h1>
    <p class="lede">Look around right away. Field notes and voices download in the background.</p>
    ${dots}
    ${tight
      ? html`<div class="banner banner-caution">${icon("warning")}<p><strong>Low storage.</strong> Needs ${mb(s.need)}, ${mb(free!)} free.</p></div>`
      : nothing}
    ${s.webgpu === false
      ? html`<div class="banner banner-info">${icon("cpu")}<p><strong>No WebGPU here.</strong> ${s.phone ? "This phone’s browser can’t run the listener. Update Chrome and try again." : html`Only the full-size model runs: about ${mb(s.need)}. Fine on a laptop. Chrome on Android has WebGPU.`}</p></div>`
      : nothing}
    <div class="btn-row">
      <button class="btn btn-primary" type="button" @click=${start}>${icon("path")} Start the trail</button>
      <span class="small muted num">${s.need ? `${mb(s.need)} downloads in the background` : "…"}${s.webgpu ? ", Wi-Fi" : ""}</span>
    </div>
    <details class="details">
      <summary>Details</summary>
      <dl class="checks">
        <div><dt>Download, once</dt><dd class="num">${s.need ? `about ${mb(s.need)}` : "checking…"}</dd></div>
        <div><dt>Listening engine</dt><dd>${s.webgpu == null ? "checking…" : s.webgpu ? "Graphics chip (WebGPU)" : "Processor only"}</dd></div>
        <div><dt>Free space</dt><dd class="num">${free == null ? (s.storage ? "unknown" : "checking…") : mb(free)}</dd></div>
      </dl>
      ${wantsMock() ? html`<p class="small muted">Dev: the model step is simulated (?model=real for the real one).</p>` : nothing}
    </details>
  </div>`;
}

export function setupView() {
  return html`<main class="setup" id="main">
    <div class="setup-inner">
      ${brand()}
      ${intro(step)}
    </div>
    <div id="announcer" class="visually-hidden" role="log" aria-live="polite" aria-relevant="additions"></div>
  </main>`;
}

export function resetSetup() {
  slide = 0;
  step = { kind: "intro", webgpu: null, storage: null, need: 0, phone: false };
  checked = false;
}
