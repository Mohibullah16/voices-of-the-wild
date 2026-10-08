// Listen: capture a photo, match it on-device, let the thing speak.
import { html, nothing } from "lit-html";
import { keyed } from "lit-html/directives/keyed.js";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { stopAll, unlockAudio } from "../audio";
import { SHORT_NAME } from "../art/emblems";
import { announce, state, toast, update, type ListenState } from "../app/state";
import { EmbedError } from "../embed/client";
import { preparePhoto, prepareVideoFrame } from "../image";
import { match } from "../match";
import { savePhoto } from "../photos";
import { recordEncounter, saveCollection } from "../store";
import type { LineKey, Owner } from "../types";
import { card } from "./card";
import { icon } from "./icons";
import { voiceLine } from "./voice";
import { ensureEmbedder, releaseEmbedder } from "../app/embedder";
import { kitPercent, startKit } from "../app/kit";
import { allowMotion, gameEncounter, primeMotion, releaseMoments, startWalk, stopWalk } from "../app/game";
import { questProgress } from "../game/quests";
import { dayKey } from "../game/time";
import { shareCard } from "../share";
import { homeView, questIcon, todayActive } from "./home";
import { leafBurst, xpTick } from "./juice";
import { sampleBlob, type Sample } from "../samples";

const LINE_LABEL: Record<LineKey, string> = { first_meet: "First meeting", again: "Again", goodbye: "Goodbye", hint: "A tip" };
let seq = 0;
let stream: MediaStream | null = null;

const coarse = () => matchMedia("(pointer: coarse)").matches;
// Phones and narrow windows open the live camera first; file pickers stay one tap away.
const mobile = () => matchMedia("(pointer: coarse), (max-width: 700px)").matches;
function capture() {
  if (mobile()) void openViewfinder();
  else openPicker("gallery-input");
}

function focusSoon(id: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: false })));
}

function setListen(l: ListenState) {
  const prev = state.listen;
  if ((prev.kind === "result" || prev.kind === "stirring") && "preview" in prev && !(("preview" in l) && l.preview === prev.preview)) {
    URL.revokeObjectURL(prev.preview);
  }
  update((s) => (s.listen = l));
}

// ---- actions -------------------------------------------------------------------

function openPicker(id: "cam-input" | "gallery-input") {
  unlockAudio(); // inside the tap, so the voice may autoplay after inference
  stopAll();
  (document.getElementById(id) as HTMLInputElement | null)?.click();
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const photo = await preparePhoto(file);
    await runEncounter(photo.image, photo.previewUrl);
  } catch (err) {
    setListen({ kind: "error", message: (err as Error).message || "That photo could not be read." });
  }
}

/** The phone's GPU can be lost (memory pressure, the tab in the background). Errors that look like that. */
const gpuLost = (e: unknown) => /WebGPU|GPU|device|Instance reference|OrtRun|mapAsync|out of memory/i.test(String((e as Error)?.message ?? e));

/** Embeds a photo. If the GPU was lost, starts the model again once and retries. */
async function embedPhoto(image: ImageData) {
  try {
    return await ensureEmbedder().embed(image);
  } catch (err) {
    if (!gpuLost(err)) throw err;
    console.warn("[listen] GPU lost, restarting the listener", err);
    releaseEmbedder();
    update((s) => { if (s.listen.kind === "stirring") s.listen = { ...s.listen, waking: true }; });
    return await ensureEmbedder().embed(image);
  }
}

export async function runEncounter(image: ImageData, preview: string, sample = false) {
  const data = state.data!;
  const waking = state.embedderStatus.state !== "ready";
  setListen({ kind: "stirring", preview, waking });
  announce("Something is stirring. Listening on this phone.");
  focusSoon("stir-title");
  try {
    // A photo taken while the listener is still downloading waits for it (the stirring screen shows progress).
    if (state.kit.phase !== "done") await startKit();
    ensureEmbedder();
    const t0 = performance.now();
    const { vector, ms } = await embedPhoto(image);
    // Keep the stirring moment readable even on a fast GPU.
    const elapsed = performance.now() - t0;
    if (elapsed < 900 && !matchMedia("(prefers-reduced-motion: reduce)").matches) await new Promise((r) => setTimeout(r, 900 - elapsed));
    const result = match(vector, data.bank, data.roster.thresholds);
    let ownerId: string | null = null;
    let line: LineKey | null = null;
    if (result.outcome.kind === "species") ownerId = result.outcome.owner;
    else if (result.outcome.kind === "guardian") {
      const cat = data.categories.find((c) => c.id === (result.outcome as { category: string }).category);
      ownerId = cat?.guardian.id ?? null;
    }
    let first = false;
    if (ownerId) {
      first = !state.collection.entries[ownerId];
      line = result.outcome.kind === "guardian" ? "hint" : first ? "first_meet" : "again";
      if (!sample) {
        const rec = recordEncounter(state.collection, ownerId);
        state.collection = rec.collection;
        void saveCollection(rec.collection);
      }
    }
    // Keep your own photo on this phone (never uploaded) so the card shows it. Only for a named character,
    // not for a guardian's tip or the practice photos, and only if the setting is on.
    if (ownerId && !sample && result.outcome.kind === "species" && state.settings.keepPhotos) {
      try {
        await savePhoto(ownerId, preview);
      } catch {
        // Storage full or blocked: the illustration stays.
      }
    }
    const rewards = ownerId && !sample ? gameEncounter(ownerId, result.outcome.kind === "guardian" ? "guardian" : "species") : null;
    navigator.vibrate?.(first ? [30, 60, 30, 60, 90] : ownerId ? [40, 50, 40] : [20]);
    setListen({ kind: "result", preview, result, ownerId, line, first, embedMs: ms, leaving: false, seq: ++seq, rewards, sample });
    const owner = ownerId ? data.owners.get(ownerId) : undefined;
    if (result.outcome.kind === "species" && owner) {
      announce(`${first ? "New! " : ""}${owner.name}, ${owner.species}.${owner.elder ? " Elder voice." : ""}${owner.caution ? " Keep your distance." : ""}${rewards?.xp ? ` Plus ${rewards.xp} XP.` : rewards?.tooSoon ? " Too soon for XP." : ""}`); // the voice line announces its own caption
    } else if (result.outcome.kind === "guardian" && owner) {
      announce(`Not sure who this is yet. ${owner.name}, the guardian, has a tip.`);
    } else {
      announce("Nobody here wants to talk. Try something alive, or something old.");
    }
    focusSoon("enc-name");
  } catch (err) {
    const e = err as EmbedError;
    if (e.code === "webgpu" || gpuLost(e)) releaseEmbedder();
    const message =
      (err as { code?: string }).code && state.kit.phase === "error"
        ? state.kit.message
        : e.code === "not-cached"
        ? "The listening model is missing from this phone. The browser may have cleared it to save space. Open About and download the field kit again."
        : gpuLost(e) || e.code === "webgpu"
          ? "The phone’s graphics chip stopped the listener, usually because memory ran low. Close a few other tabs or apps, then try again."
          : `Something went wrong while listening: ${e.message}`;
    setListen({ kind: "error", message });
    focusSoon("listen-error");
  }
}

/** After a meeting: walk if the next quest is a walk (with a goodbye line first), else go find the next thing. */
function nextTask() {
  const l = state.listen;
  releaseMoments();
  if (todayActive()?.kind !== "walk") {
    stopAll();
    return capture();
  }
  primeMotion(); // inside the tap: the browser may ask for motion access now
  if (l.kind !== "result" || !l.ownerId) return walkNow();
  update((s) => { if (s.listen.kind === "result") s.listen = { ...s.listen, leaving: true, seq: ++seq }; });
}

function walkNow() {
  primeMotion();
  // A walk keeps the screen on for minutes; give the GPU memory back. The next photo reloads it.
  releaseEmbedder();
  stopAll();
  startWalk();
  focusSoon("walk-title");
}

export function reset() {
  stopAll();
  if (state.listen.kind === "walk") stopWalk();
  releaseMoments();
  setListen({ kind: "idle" });
  focusSoon("listen-title");
}

async function openViewfinder() {
  // About to take a photo: start the listener now, while the player frames the shot.
  if (state.kit.phase === "done") ensureEmbedder();
  unlockAudio();
  stopAll();
  setListen({ kind: "viewfinder" });
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure"), { name: window.isSecureContext ? "NotFoundError" : "InsecureContext" });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    const v = document.getElementById("vf-video") as HTMLVideoElement | null;
    if (v) {
      v.srcObject = stream;
      await v.play().catch(() => {});
    }
  } catch (err) {
    const name = (err as Error).name;
    const error =
      name === "NotAllowedError" ? "Camera permission was declined. Use your camera app or a photo instead."
      : name === "InsecureContext" ? "The live camera needs a secure (https) page. Use your camera app or a photo instead."
      : "No camera is available here. Choose a photo instead.";
    update((s) => (s.listen = { kind: "viewfinder", error }));
  }
}
function closeViewfinder() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}
async function snap() {
  const v = document.getElementById("vf-video") as HTMLVideoElement | null;
  if (!v || !v.videoWidth) return toast("The camera is still waking up.");
  unlockAudio();
  const photo = await prepareVideoFrame(v);
  closeViewfinder();
  await runEncounter(photo.image, photo.previewUrl);
}

// ---- templates -----------------------------------------------------------------

async function trySample(s: Sample) {
  unlockAudio();
  stopAll();
  try {
    const photo = await preparePhoto(await sampleBlob(s));
    await runEncounter(photo.image, photo.previewUrl, true);
  } catch (err) {
    setListen({ kind: "error", message: (err as Error).message || "That sample could not be read." });
  }
}

function idle() {
  return homeView({
    camera: () => void openViewfinder(),
    gallery: () => openPicker("gallery-input"),
    viewfinder: openViewfinder,
    coarse: mobile(),
    sample: trySample,
    walk: walkNow,
  });
}

function viewfinder(l: Extract<ListenState, { kind: "viewfinder" }>) {
  return html`<section class="viewfinder" aria-labelledby="vf-title">
    <h1 class="display-3" id="vf-title" tabindex="-1">Frame one thing</h1>
    ${l.error
      ? html`<div class="banner banner-info" role="alert">${icon("info")}<p>${l.error}</p></div>`
      : html`<div class="viewfinder-frame">
          <video id="vf-video" playsinline muted autoplay aria-label="Camera preview"></video>
          <div class="viewfinder-corners" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        </div>`}
    <div class="viewfinder-actions">
      <button class="btn btn-quiet" type="button" @click=${() => { closeViewfinder(); reset(); }}>${icon("x")} Cancel</button>
      ${l.error
        ? coarse() ? html`<button class="btn btn-primary" type="button" @click=${() => { closeViewfinder(); openPicker("cam-input"); }}>${icon("camera")} Camera app</button>` : nothing
        : html`<button class="shutter small" type="button" @click=${snap} aria-label="Take the photo">${icon("camera")}</button>`}
      <button class="btn btn-quiet" type="button" @click=${() => { closeViewfinder(); openPicker("gallery-input"); }}>${icon("images")} Photo</button>
    </div>
  </section>`;
}

// A low tuft of grass along the bottom of the specimen ring; each blade sways on its own clock.
const BLADES = (() => {
  let d = "";
  for (let i = 0; i < 26; i++) {
    const x = 6 + i * 7.4 + ((i * 37) % 5);
    const h = 14 + ((i * 53) % 19);
    const lean = (((i * 29) % 11) - 5) * 1.3;
    d += `<path d="M${x} 44Q${x + lean * 0.3} ${44 - h * 0.6} ${x + lean} ${44 - h}"/>`;
  }
  return `<svg class="blades" viewBox="0 0 200 44" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">${d}</svg>`;
})();

function stirring(l: Extract<ListenState, { kind: "stirring" }>) {
  return html`<section class="stirring" aria-labelledby="stir-title" aria-busy="true">
    <div class="specimen">
      <svg class="ring" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="98"></circle><circle cx="100" cy="100" r="98"></circle><circle cx="100" cy="100" r="98"></circle><circle cx="100" cy="100" r="98"></circle></svg>
      ${l.preview ? html`<img src=${l.preview} width="188" height="188" alt="The photo you just took" />` : nothing}
      ${unsafeSVG(BLADES)}
    </div>
    <div>
      <h2 class="display-3" id="stir-title" tabindex="-1">Something is stirring…</h2>
      <p>${state.kit.phase === "running"
        ? html`Still downloading the listener: <b class="num">${kitPercent()}%</b>. It answers as soon as it’s here.`
        : l.waking ? "Waking the listener… The first photo takes longest." : "On this phone. Nowhere else."}</p>
    </div>
  </section>`;
}

function debugPanel(l: Extract<ListenState, { kind: "result" }>) {
  if (!state.settings.debug) return nothing;
  const data = state.data!;
  const t = l.result.trace;
  const name = (id: string) => data.owners.get(id)?.name ?? id;
  const o = l.result.outcome;
  return html`<details class="debug">
    <summary>Match scores (debug)</summary>
    <dl class="num">
      <dt>Outcome</dt><dd>${o.kind}${"reason" in o ? ` (${o.reason})` : ""}</dd>
      <dt>Embedder</dt><dd>${state.embedderStatus.info?.device ?? state.embedder?.device ?? "?"}, ${Math.round(l.embedMs)} ms</dd>
      <dt>Best category</dt><dd>${t.bestCategory ?? "none"}: ${t.categoryScore.toFixed(3)} (needs ${Number.isNaN(t.categoryThreshold) ? "?" : t.categoryThreshold.toFixed(3)})</dd>
      ${t.species1 ? html`<dt>Species</dt><dd>${name(t.species1.owner)} ${t.species1.score.toFixed(3)} (needs ${t.speciesThreshold.toFixed(3)})${t.species2 ? html`, margin ${(t.species1.score - t.species2.score).toFixed(3)} over ${name(t.species2.owner)} (needs ${t.margin.toFixed(3)})` : nothing}</dd>` : nothing}
    </dl>
    <table class="num">
      <caption class="visually-hidden">Top five matches</caption>
      <thead><tr><th scope="col">Who</th><th scope="col">Category</th><th scope="col" class="score">Cosine</th></tr></thead>
      <tbody>${l.result.top.map((s) => html`<tr><td>${name(s.owner)}${s.guardian ? " (guardian)" : ""}</td><td>${SHORT_NAME[s.category] ?? s.category}</td><td class="score">${s.score.toFixed(3)}</td></tr>`)}</tbody>
    </table>
    ${data.source === "fixture" ? mockControls() : nothing}
  </details>`;
}

let mockModule: typeof import("../dev-fixtures/fixture") | null = null;
function mockControls() {
  if (!__FIXTURES_ALLOWED__) return nothing;
  if (!mockModule) {
    void import("../dev-fixtures/fixture").then((m) => { mockModule = m; update(); });
    return nothing;
  }
  const plan = mockModule.getMockPlan();
  const value = plan.kind === "species" && plan.owner ? `species:${plan.owner}` : plan.kind === "guardian" && plan.category ? `guardian:${plan.category}` : plan.kind;
  const onChange = (e: Event) => {
    const v = (e.target as HTMLSelectElement).value;
    const [kind, arg] = v.split(":") as [string, string | undefined];
    mockModule!.setMockPlan(kind === "species" ? { kind, owner: arg } : kind === "guardian" ? { kind, category: arg } : ({ kind } as never));
    toast("Next photo will follow this plan.");
  };
  return html`<label class="small">Dev fixture: next photo
    <select @change=${onChange} .value=${value}>
      <option value="auto">Random (any outcome)</option>
      <option value="species">Any species</option>
      <option value="guardian">Any guardian hint</option>
      <option value="nobody">Nobody</option>
      ${state.data!.ordered.filter((o) => !o.guardian).map((o) => html`<option value="species:${o.id}">${o.name}</option>`)}
      ${state.data!.categories.map((c) => html`<option value="guardian:${c.id}">Guardian hint: ${SHORT_NAME[c.id]}</option>`)}
    </select></label>`;
}

const CLEARING = `<svg class="clearing" viewBox="0 0 280 120" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 100H274"/>
  <path d="M30 100C29 92 27 86 22 80M30 100C31 90 34 84 39 79M30 100V84M210 100C209 93 206 88 202 84M210 100C212 92 215 87 220 83"/>
  <path d="M120 100C120 92 128 87 140 87C152 87 160 92 160 100"/>
  <path d="M168 56C168 42 183 34 200 34C217 34 232 42 232 56C232 70 217 78 200 78C196 78 192 77.6 188.5 76.8L176 84L178.5 72.5C171.6 68.4 168 62.6 168 56Z" stroke-dasharray="3 6"/>
  <circle cx="187" cy="56" r="1.6" fill="currentColor" stroke="none"/><circle cx="200" cy="56" r="1.6" fill="currentColor" stroke="none"/><circle cx="213" cy="56" r="1.6" fill="currentColor" stroke="none"/>
</svg>`;

function result(l: Extract<ListenState, { kind: "result" }>) {
  const data = state.data!;
  const owner: Owner | undefined = l.ownerId ? data.owners.get(l.ownerId) : undefined;
  if (!owner || !l.line) {
    return html`<section class="nobody" aria-labelledby="enc-name">
      ${l.preview ? html`<img class="photo-ghost" src=${l.preview} width="96" height="96" alt="The photo you took" />` : nothing}
      ${unsafeSVG(CLEARING)}
      <h2 class="display-2" id="enc-name" tabindex="-1">Nobody here wants to talk.</h2>
      <p class="lede">Try something alive, or something old.</p>
      <div class="encounter-actions">
        <button class="btn btn-primary" type="button" @click=${capture}>${icon("camera")} Try again</button>
        <button class="btn btn-quiet" type="button" @click=${reset}>${icon("path")} Trail</button>
      </div>
      ${debugPanel(l)}
    </section>`;
  }
  const guardian = l.result.outcome.kind === "guardian";
  const lineKey: LineKey = l.leaving ? "goodbye" : l.line;
  const line = owner.lines[lineKey] ?? owner.lines[l.line]!;
  const onEnd = (e: CustomEvent<string>) => {
    const finished = e.detail === "ended" || e.detail === "missing";
    if (l.leaving && finished) walkNow();
    else if (!l.leaving) releaseMoments();
  };
  return html`<section class="encounter" aria-labelledby="enc-name" @voice-end=${onEnd}>
    ${guardian
      ? html`<p class="chip-note">${icon("binoculars")} Not sure yet. A tip:</p>`
      : nothing}
    <div class="card-wrap">
      ${l.first && !guardian && !l.leaving ? leafBurst() : nothing}
      ${card(owner, { reveal: !l.leaving, isNew: l.first && !guardian && !l.sample, headingId: "enc-name" })}
    </div>
    ${l.leaving ? nothing : l.sample ? html`<p class="reward-strip quiet" role="status">${icon("images")} Sample photo. No XP. The real ones are outside.</p>` : rewardStrip(l)}
    ${owner.caution
      ? html`<div class="banner banner-caution" role="note">${icon("warning")}<p><strong>Look, don’t touch.</strong></p></div>`
      : nothing}
    ${keyed(`${l.seq}-${lineKey}`, voiceLine({ line, who: owner.name, label: LINE_LABEL[lineKey], elder: owner.elder, autoplay: true }))}
    <div class="encounter-actions">
      ${l.leaving
        ? html`<button class="btn" type="button" @click=${walkNow}>Skip</button>`
        : html`${nextButton(guardian)}
            <button class="btn ${guardian ? "btn-primary" : ""}" type="button" @click=${capture}>${icon("camera")} ${guardian ? "Closer" : "Again"}</button>
            ${guardian ? nothing : html`<button class="icon-btn" type="button" aria-label="Share ${owner.name}" @click=${() => share(owner, line)}>${icon("share")}</button>`}`}
    </div>
    ${debugPanel(l)}
  </section>`;
}

async function share(owner: Owner, line: Owner["lines"][LineKey]) {
  try {
    const r = await shareCard(owner, line, "portrait", state.collection.entries[owner.id]?.firstMet);
    if (r === "downloaded") toast("Card saved.");
  } catch {
    toast("Could not make the card.");
  }
}

function rewardStrip(l: Extract<ListenState, { kind: "result" }>) {
  const r = l.rewards;
  if (!r) return nothing;
  if (r.tooSoon) return html`<p class="reward-strip quiet" role="status">${icon("walk")} Too soon for XP. Walk a little.</p>`;
  if (!r.xp && !r.questsCompleted.length) return nothing;
  return html`<div class="reward-strip" role="status">
    ${r.xp
      ? html`<span class="xp-gain"><b>${xpTick(r.xp)}</b> XP<span class="visually-hidden">: plus ${r.xp}</span></span>
          <span class="xp-parts">${r.parts.map((p) => html`<span>${p.label} +${p.xp}</span>`)}</span>`
      : nothing}
    ${r.questsCompleted.map((q) => html`<span class="quest-done">${icon("checkCircle")} ${q.label}</span>`)}
  </div>`;
}

/** The next task in the chain, as the main button under a meeting. */
function nextButton(guardian: boolean) {
  const next = todayActive();
  const cls = `btn ${guardian ? "" : "btn-primary"}`;
  if (!next) return html`<button class=${cls} type="button" @click=${reset}>${icon("path")} Trail</button>`;
  return html`<button class=${cls} type="button" @click=${nextTask}>
    ${next.kind === "walk" ? icon("footprints") : icon("camera")} <span>Next: ${next.label}</span></button>`;
}

const MODE_NOTE = {
  starting: "Waking the motion sensor…",
  sensor: "Counted by this phone’s motion sensor. The screen stays on while you walk.",
  "needs-permission": "",
  estimate: "No motion sensor here, so steps are estimated from time.",
} as const;

function walkView(l: Extract<ListenState, { kind: "walk" }>) {
  if (l.done) {
    const walked = l.done.questsCompleted.find((q) => q.kind === "walk");
    const next = l.done.next;
    return html`<section class="walk bonus" aria-labelledby="walk-title">
      <div class="medal big" aria-hidden="true">${icon("footprints")}</div>
      <h1 class="display-2" id="walk-title" tabindex="-1">${walked ? `${walked.need.toLocaleString("en")} steps` : "Walked"}</h1>
      <p class="xp-gain big"><b>${xpTick(l.done.xp)}</b> XP</p>
      ${next
        ? html`<p class="next-up"><span class="quest-icon" aria-hidden="true">${questIcon(next)}</span><span><small>Next</small>${next.label}</span></p>
            <button class="btn btn-primary" type="button" @click=${() => { stopAll(); ensureEmbedder(); capture(); }}>${icon("camera")} Find it</button>`
        : html`<p class="lede">Today’s trail is done.</p>`}
      <button class="btn btn-quiet" type="button" @click=${reset}>${icon("path")} Trail</button>
    </section>`;
  }
  const q = todayActive();
  if (!q || q.kind !== "walk") return idle();
  const quests = todayActive.quests();
  const p = questProgress(q, state.game.days[dayKey(new Date())]);
  const after = quests[quests.findIndex((x) => x.id === q.id) + 1];
  const frac = p.have / p.need;
  return html`<section class="walk" aria-labelledby="walk-title">
    <div class="step-ring" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"></circle><circle class="on" cx="60" cy="60" r="52" pathLength="1" style="stroke-dashoffset:${1 - frac}"></circle></svg>
      <span class="step-count num">${p.have.toLocaleString("en")}</span>
      <span class="step-of">of ${p.need.toLocaleString("en")} steps</span>
    </div>
    <h1 class="display-2" id="walk-title" tabindex="-1">${q.label}</h1>
    <p class="visually-hidden" role="status">${Math.floor(p.have / 50) * 50} of ${p.need} steps</p>
    ${l.mode === "needs-permission"
      ? html`<button class="btn btn-primary" type="button" @click=${() => void allowMotion()}>${icon("footprints")} Count my steps</button>
          <p class="muted small">Your phone asks first. Motion stays on this phone.</p>`
      : html`<p class="muted small walk-mode">${MODE_NOTE[l.mode]}</p>`}
    ${after ? html`<p class="next-up locked"><span class="quest-icon" aria-hidden="true">${questIcon(after)}</span><span><small>Then</small>${after.label}</span></p>` : nothing}
    <p class="muted small">Eyes up. Mind the road.</p>
    <button class="btn" type="button" @click=${reset}>${icon("pause")} Pause</button>
  </section>`;
}

export function listenView() {
  const l = state.listen;
  const body =
    l.kind === "idle" ? idle()
    : l.kind === "walk" ? walkView(l)
    : l.kind === "viewfinder" ? viewfinder(l)
    : l.kind === "stirring" ? stirring(l)
    : l.kind === "result" ? result(l)
    : html`<section class="listen" aria-labelledby="listen-error">
        <div class="error-box" role="alert"><strong id="listen-error" tabindex="-1">That didn’t work.</strong><p>${l.message}</p></div>
        <div class="btn-row"><button class="btn btn-primary" type="button" @click=${reset}>${icon("retry")} Back to listening</button></div>
      </section>`;
  return html`${body}
    <input class="file-input" id="cam-input" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true" @change=${onFile} />
    <input class="file-input" id="gallery-input" type="file" accept="image/*" tabindex="-1" aria-hidden="true" @change=${onFile} />`;
}
