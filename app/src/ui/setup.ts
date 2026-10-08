// First run: "Get ready for the trail".
import { html, nothing } from "lit-html";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { CATEGORY_IDS, emblemSvg, SHORT_NAME } from "../art/emblems";
import { markSvg } from "../art/logo";
import { adoptEmbedder, createEmbedder, wantsMock } from "../app/embedder";
import { announce, state, update } from "../app/state";
import { audioPaths } from "../data";
import { EmbedError, type LoadInfo, type LoadProgress } from "../embed/client";
import {
  downloadKit, estimateBytes, hasWebGPU, KitError, mb, modelCached, modelIsSelfHosted, planKit, requestPersistence, storageInfo,
  type KitProgress, type StorageInfo,
} from "../firstrun";
import { saveSettings } from "../store";
import { SIZES } from "../config";
import { icon } from "./icons";
import { card } from "./card";

type Step =
  | { kind: "intro"; webgpu: boolean | null; storage: StorageInfo | null; need: number; selfHosted: boolean | null }
  | { kind: "downloading"; kit: KitProgress | null; model: { loaded: number; total: number }; stage: string; device?: string }
  | { kind: "ready"; info: LoadInfo; missingVoices: number }
  | { kind: "error"; code: string; message: string };

let step: Step = { kind: "intro", webgpu: null, storage: null, need: 0, selfHosted: null };
let checked = false;

const set = (s: Step) => { step = s; update(); };

async function runChecks() {
  if (checked) return;
  checked = true;
  const data = state.data!;
  const files = planKit(audioPaths(data.roster), data.source === "real");
  const [webgpu, storage, selfHosted] = await Promise.all([hasWebGPU(), storageInfo(), modelIsSelfHosted(data.roster.model.id)]);
  if (step.kind === "intro") set({ kind: "intro", webgpu, storage, need: estimateBytes(files, webgpu || wantsMock()), selfHosted });
}

async function start() {
  const data = state.data!;
  const intro = step.kind === "intro" ? step : null;
  const files = planKit(audioPaths(data.roster), data.source === "real");
  const modelBytes = intro?.webgpu === false && !wantsMock() ? SIZES.modelCpu : SIZES.model;
  set({ kind: "downloading", kit: null, model: { loaded: 0, total: modelBytes }, stage: "Field notes and voices" });
  announce("Downloading the field kit.");
  void requestPersistence();
  try {
    const kit = await downloadKit(files, (p) => {
      if (step.kind === "downloading") { step.kit = p; update(); }
    });
    const missingVoices = kit.voices.missing;
    const selfHosted = intro?.selfHosted ?? (await modelIsSelfHosted(data.roster.model.id));
    const embedder = createEmbedder(selfHosted ? "local" : "remote");
    if (step.kind === "downloading") step.stage = "Model";
    update();
    const info = await embedder.load((p: LoadProgress) => {
      if (step.kind !== "downloading") return;
      const fs = Object.values(p.files);
      const loaded = fs.reduce((n, f) => n + f.loaded, 0);
      const total = Math.max(modelBytes, fs.reduce((n, f) => n + f.total, 0));
      step.model = { loaded, total };
      step.stage = p.stage === "warmup" ? "Tuning up" : p.stage === "weights" || p.stage === "session" ? "Model" : "Model";
      step.device = p.device;
      update();
    });
    if (embedder.kind === "model" && !selfHosted && !(await modelCached())) {
      throw new KitError("quota", "The model downloaded but the browser would not keep it. This usually means storage is full or the tab is private.");
    }
    state.settings = { ...state.settings, setupDone: true, modelSource: selfHosted ? "local" : "remote", lastDevice: info.device };
    await saveSettings(state.settings);
    adoptEmbedder(embedder, info);
    // "Go offline" is only true once the service worker has the app shell. It installs in seconds;
    // wait for it (bounded) so the ready screen never promises offline too early.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 60_000))]);
    }
    set({ kind: "ready", info, missingVoices });
    announce("Ready. You can go offline now.");
    requestAnimationFrame(() => document.getElementById("ready-title")?.focus());
  } catch (err) {
    const code = err instanceof KitError || err instanceof EmbedError ? err.code : "unknown";
    set({ kind: "error", code, message: (err as Error).message });
    announce("The download stopped.");
    requestAnimationFrame(() => document.getElementById("setup-error")?.focus());
  }
}

function finish() {
  update((s) => (s.phase = "app"));
  location.hash = "#/";
}

function brand() {
  return html`<div class="setup-brand">
    <a class="wordmark" href="#/" aria-label="Voices of the Wild">${unsafeSVG(markSvg(34))}<span class="wordmark-text">Voices <i>of the</i> Wild</span></a>
    <figure class="plate" aria-label="The thirteen kinds of things that talk">
      <figcaption class="plate-title"><span>Things that talk</span><span>13 kinds</span></figcaption>
      ${CATEGORY_IDS.map((c) => html`<figure>${unsafeSVG(emblemSvg(c, 64))}<figcaption>${SHORT_NAME[c]}</figcaption></figure>`)}
      <p class="plate-legend">A guardian and six voices each.</p>
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

function intro(s: Extract<Step, { kind: "intro" }>) {
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
    <h1 class="display-1" id="setup-title" tabindex="-1">Photos stay on your phone.</h1>
    <p class="lede">One download. Then it works offline.</p>
    ${dots}
    ${tight
      ? html`<div class="banner banner-caution">${icon("warning")}<p><strong>Low storage.</strong> Needs ${mb(s.need)}, ${mb(free!)} free.</p></div>`
      : nothing}
    ${s.webgpu === false
      ? html`<div class="banner banner-info">${icon("cpu")}<p><strong>No WebGPU here.</strong> Only the full-size model runs: about ${mb(s.need)}. Fine on a laptop. Chrome on Android has WebGPU.</p></div>`
      : nothing}
    <div class="btn-row">
      <button class="btn btn-primary" type="button" @click=${start}>${icon("download")} Get the field kit</button>
      <span class="small muted num">${s.need ? mb(s.need) : "…"}${s.webgpu ? ", Wi-Fi" : ""}</span>
    </div>
    <details class="details">
      <summary>Details</summary>
      <dl class="checks">
        <div><dt>Download, once</dt><dd class="num">${s.need ? `about ${mb(s.need)}` : "checking…"}</dd></div>
        <div><dt>Listening engine</dt><dd>${s.webgpu == null ? "checking…" : s.webgpu ? "Graphics chip (WebGPU)" : "Processor only"}</dd></div>
        <div><dt>Free space</dt><dd class="num">${free == null ? (s.storage ? "unknown" : "checking…") : mb(free)}</dd></div>
        <div><dt>Network after setup</dt><dd>None</dd></div>
      </dl>
      ${wantsMock() ? html`<p class="small muted">Dev: the model step is simulated (?model=real for the real one).</p>` : nothing}
    </details>
  </div>`;
}

function bar(label: string, loaded: number, total: number, done: boolean, note = "") {
  const fr = total > 0 ? Math.min(1, loaded / total) : 0;
  return html`<li class="progress-item" data-state=${done ? "done" : "busy"}>
    <header><span>${label}</span><span class="num">${note || `${mb(loaded)} of ${mb(total)}`}</span></header>
    <div class="bar" role="progressbar" aria-label=${label} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round((done ? 1 : fr) * 100)}><i style="transform: scaleX(${done ? 1 : fr})"></i></div>
  </li>`;
}

function downloading(s: Extract<Step, { kind: "downloading" }>) {
  const k = s.kit;
  const kitLoaded = k ? k.data.loaded + k.voices.loaded + k.runtime.loaded : 0;
  const kitTotal = k ? k.data.total + k.voices.total + k.runtime.total : 1;
  const all = (kitLoaded + s.model.loaded) / (kitTotal + s.model.total);
  const pct = Math.min(99, Math.floor(all * 100));
  const g = (x: keyof KitProgress) => k?.[x];
  const modelDone = s.stage === "Tuning up";
  return html`<div class="setup-main" aria-busy="true">
    <h1 class="display-2" id="setup-title" tabindex="-1">Packing</h1>
    <p class="big-percent num" aria-live="off">${pct}%</p>
    <ul class="progress-list">
      ${g("data")?.files ? bar("Field notes", g("data")!.loaded, g("data")!.total, g("data")!.done === g("data")!.files) : nothing}
      ${g("voices")?.files ? bar("Voices", g("voices")!.done, g("voices")!.files, g("voices")!.done === g("voices")!.files, `${g("voices")!.done} of ${g("voices")!.files} lines`) : nothing}
      ${g("runtime") ? bar("Runtime", g("runtime")!.loaded, g("runtime")!.total, g("runtime")!.done === g("runtime")!.files) : bar("Runtime", 0, 1, false, "waiting")}
      ${bar(
        `EmbeddingGemma 2${s.device ? ` (${s.device === "webgpu" ? "WebGPU" : "processor"})` : ""}`,
        s.model.loaded,
        s.model.total,
        modelDone,
        modelDone ? "tuning up" : s.model.loaded ? "" : "waiting",
      )}
    </ul>
    <p class="small muted">Keep this open.</p>
  </div>`;
}

function ready(s: Extract<Step, { kind: "ready" }>) {
  return html`<div class="setup-main">
    <span class="ready-mark" aria-hidden="true">${icon("check")}</span>
    <h1 class="display-1" id="ready-title" tabindex="-1">Ready. Go offline.</h1>
    <p class="lede">Everything is on this phone now.</p>
    <div class="checks"><dl>
      <div><dt>Listening engine</dt><dd>${s.info.device === "webgpu" ? "WebGPU" : s.info.device === "wasm" ? "Processor (WebAssembly)" : "Simulated (dev fixture)"}</dd></div>
      ${s.info.warmupMs ? html`<div><dt>First test photo</dt><dd class="num">${(s.info.warmupMs / 1000).toFixed(1)} s</dd></div>` : nothing}
    </dl></div>
    ${s.info.fallbackReason ? html`<div class="banner banner-info">${icon("cpu")}<p>${s.info.fallbackReason} Using the slower processor path instead.</p></div>` : nothing}
    ${s.missingVoices ? html`<div class="banner banner-info">${icon("info")}<p>${s.missingVoices} voice files are not available yet. Those lines will show their captions on their own.</p></div>` : nothing}
    <div class="btn-row"><button class="btn btn-primary" type="button" @click=${finish}>${icon("path")} Start the trail</button></div>
  </div>`;
}

function errorView(s: Extract<Step, { kind: "error" }>) {
  const headline =
    s.code === "quota" ? "Not enough room on this phone."
    : s.code === "network" ? "The download stopped."
    : s.code === "webgpu" ? "This browser can’t run the listener on this phone."
    : "Something went wrong.";
  const help =
    s.code === "quota"
      ? "Free up some space (about 400 MB), leave private browsing if you are in it, and try again. Finished files are kept."
      : s.code === "network"
        ? "Check your connection, ideally Wi-Fi, and try again. Files that already arrived are kept."
        : s.code === "webgpu"
          ? "The model runs on the phone’s graphics chip (WebGPU), and this browser didn’t offer it. Update Chrome and try again. Without it, the model would need about 1.8 GB of memory, which is too much for a phone."
          : s.message;
  return html`<div class="setup-main">
    <h1 class="display-2" id="setup-title">Get ready for the trail</h1>
    <div class="error-box" role="alert"><strong id="setup-error" tabindex="-1">${headline}</strong><p>${help}</p>${s.code !== "unknown" ? html`<p class="small muted">${s.message}</p>` : nothing}</div>
    <div class="btn-row"><button class="btn btn-primary" type="button" @click=${start}>${icon("retry")} Try again</button></div>
  </div>`;
}

export function setupView() {
  const s = step;
  return html`<main class="setup" id="main">
    <div class="setup-inner">
      ${brand()}
      ${s.kind === "intro" ? intro(s) : s.kind === "downloading" ? downloading(s) : s.kind === "ready" ? ready(s) : errorView(s)}
    </div>
    <div id="announcer" class="visually-hidden" role="log" aria-live="polite" aria-relevant="additions"></div>
  </main>`;
}

/** Allows About → "download again" to restart setup. */
export function resetSetup() {
  slide = 0;
  step = { kind: "intro", webgpu: null, storage: null, need: 0, selfHosted: null };
  checked = false;
}
