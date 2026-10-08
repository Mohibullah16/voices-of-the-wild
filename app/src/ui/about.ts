// About: how it works, credits, safety, settings and your data.
import { html, nothing } from "lit-html";
import { state, toast, update } from "../app/state";
import { mb, storageInfo, type StorageInfo } from "../firstrun";
import { clearCollection, exportPayload, mergeCollections, parseCollection, saveCollection, saveSettings, type Settings } from "../store";
import { applyCaptionSize, applyTheme } from "../app/theme";
import { startKit } from "../app/kit";
import { releaseEmbedder, useCloud } from "../app/embedder";
import { setRankings } from "../app/community";
import { icon } from "./icons";
import { loadSamples, type Sample } from "../samples";
import { clearPhotos, photoCount } from "../photos";

let storage: StorageInfo | null = null;
let samples: Sample[] | null = null;
let storageAsked = false;

function setListener(v: "device" | "cloud") {
  const wasCloud = useCloud();
  state.settings = { ...state.settings, listener: v };
  releaseEmbedder();
  // Moving to on-device needs the model on the phone: fetch it in the background.
  if (wasCloud && !useCloud()) state.settings = { ...state.settings, setupDone: false, started: true };
  void saveSettings(state.settings);
  if (!state.settings.setupDone) void startKit().catch(() => {});
  update();
}

function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  state.settings = { ...state.settings, [k]: v };
  void saveSettings(state.settings);
  if (k === "theme") applyTheme(state.settings.theme);
  if (k === "largeCaptions") applyCaptionSize(state.settings.largeCaptions);
  update();
}

function exportGuide() {
  const blob = new Blob([JSON.stringify(exportPayload(state.collection), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `voices-of-the-wild-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importGuide(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const incoming = parseCollection(JSON.parse(await file.text()), new Set(state.data!.owners.keys()));
    state.collection = mergeCollections(state.collection, incoming);
    await saveCollection(state.collection);
    toast(`Imported ${Object.keys(incoming.entries).length} pages into your field guide.`);
    update();
  } catch (err) {
    toast((err as Error).message || "That file could not be read.");
  }
}

async function resetGuide() {
  if (!confirm("Clear every page of your field guide? This cannot be undone.")) return;
  state.collection = { version: 1, entries: {} };
  await clearCollection();
  await clearPhotos();
  toast("Field guide cleared.");
  update();
}

async function deletePhotos() {
  if (!confirm("Delete every photo kept on this phone? Your field guide stays.")) return;
  await clearPhotos();
  toast("Photos deleted.");
  update();
}

async function redownload() {
  state.settings = { ...state.settings, setupDone: false, started: true };
  await saveSettings(state.settings);
  void startKit().catch(() => {});
  location.hash = "#/";
}

export function aboutView() {
  if (!storageAsked) {
    storageAsked = true;
    void storageInfo().then((s) => { storage = s; update(); });
    void loadSamples().then((s) => { samples = s; update(); });
  }
  const st = state.embedderStatus;
  const device = st.info?.device ?? state.settings.lastDevice;
  const data = state.data!;
  // Engine credits come from the data: whatever voiced each owner's lines.
  const byEngine = (e: string) => data.ordered.filter((o) => o.lines.first_meet?.engine === e);
  const eleven = byEngine("elevenlabs");
  const kokoro = byEngine("kokoro");
  const elevenGuardians = eleven.filter((o) => o.guardian).length;
  return html`<section class="about" aria-labelledby="about-title">
    <header style="display:grid;gap:10px">
      <h1 class="display-1" id="about-title" tabindex="-1">How it works</h1>
      <p class="lede">A walk, a photo, a voice. The screen is the shortest part of it.</p>
    </header>

    <section aria-labelledby="h-device">
      <h2 id="h-device">How it hears you</h2>
      <p>The photo is shrunk, turned into 768 numbers by <strong>EmbeddingGemma 2</strong>, Google DeepMind’s open embedding model, and compared with numbers prepared earlier from short visual descriptions of every character. The model runs inside the browser with Transformers.js and ONNX Runtime, on the graphics chip through WebGPU when it can, otherwise on the processor. On phones, whose graphics chips run out of memory with this model, the shrunk photo goes instead to the same open model on a small server (the cloud listener), which sends back the 768 numbers and keeps nothing; switch the listener to “On this device” below to keep every photo on the device and use the app offline. The matching itself always happens on your device. With “Keep my photos” on, one small copy of your latest photo of each character stays in this browser’s storage, on this phone only, so it can sit on the card instead of the illustration. Switch it off or delete the photos in Settings below.</p>
      <ol class="flow">
        <li><p><strong>Category first.</strong> Is it a tree, a bird, a bicycle? If nothing clears the bar, nobody answers.</p></li>
        <li><p><strong>Then the species.</strong> If one character clearly wins inside that category, it speaks.</p></li>
        <li><p><strong>Unsure? The guardian.</strong> When two look alike, the category’s guardian steps in and tells you what to photograph next, rather than guessing.</p></li>
        <li><p><strong>Then the voice.</strong> Lines were recorded ahead of time, so nothing is generated while you walk.</p></li>
      </ol>
      <pre class="diagram" aria-label="How a photo becomes a voice">photo
  │  shrunk on the phone, never sent anywhere
  ▼
EmbeddingGemma 2   (WebGPU, or WebAssembly on the processor)
  │  768 numbers
  ▼
cosine against precomputed description vectors, best per character
  │
  ├── best category below its bar ──►  "Nobody here wants to talk."
  ├── species not clear enough ─────►  the guardian gives a tip
  └── one clear winner ─────────────►  it speaks, and joins your field guide</pre>
    </section>


    <section aria-labelledby="h-safety">
      <h2 id="h-safety">Stay safe out there</h2>
      <p>Look up, not down, while you listen, and keep one ear free near traffic. Characters will never ask you to touch wildlife, pick plants, climb, taste anything, step into a road or look at the sun. Some things warn you to keep your distance. Please listen to them.</p>
    </section>

    <section aria-labelledby="h-credits">
      <h2 id="h-credits">Credits</h2>
      <div class="credits">
        <div class="credit lead"><strong>Voices by ElevenLabs</strong><span>The ${eleven.length} ${eleven.length === eleven.filter((o) => o.elder).length ? "Elder voices" : "premium voices"}${elevenGuardians ? `, ${elevenGuardians} of them guardians` : ""}, performed with Eleven v4 and generated once before release. Never called from the app.</span></div>
        <div class="credit"><strong>Kokoro</strong><span>Open-source text-to-speech (Apache 2.0) for the other ${kokoro.length} voices, guardians included, also generated ahead of time.</span></div>
        <div class="credit"><strong>EmbeddingGemma 2</strong><span>Google DeepMind, Apache 2.0. Matches photos to characters, on your device.</span></div>
        <div class="credit"><strong>Transformers.js and ONNX Runtime Web</strong><span>Hugging Face (Apache 2.0) and Microsoft (MIT). Run the model in the browser.</span></div>
        <div class="credit"><strong>Type and icons</strong><span>EB Garamond and Atkinson Hyperlegible Next (SIL OFL), Phosphor Icons (MIT).</span></div>
        <div class="credit"><strong>Photos</strong><span>Sample and calibration photos from Wikimedia Commons contributors (CC0, public domain, CC BY, CC BY-SA). Credits below.</span></div>
        <div class="credit"><strong>Built with</strong><span>Vite, lit-html, Workbox and idb-keyval. Card art is drawn by code, one plate per character.</span></div>
      </div>
    </section>

    ${samples?.length ? html`<section aria-labelledby="h-samples">
      <h2 id="h-samples">Sample photo credits</h2>
      <ul class="sample-credits">${samples.map((s) => html`<li><strong>${s.label}</strong>: <a href=${s.source} rel="noopener" target="_blank">${s.title}</a> by ${s.author}, <a href=${s.licenseUrl} rel="noopener" target="_blank">${s.license}</a>. Downscaled.</li>`)}</ul>
    </section>` : nothing}

    <section aria-labelledby="h-storage">
      <h2 id="h-storage">On this device</h2>
      <p>Your field guide, voices and progress live in this browser’s storage. You can export the field guide below.</p>
      <dl class="checks" style="margin:0"><div><dt>Listening engine</dt><dd>${device === "webgpu" ? "WebGPU" : device === "wasm" ? "Processor (WebAssembly)" : device === "mock" ? "Simulated (dev fixture)" : device === "cloud" ? "Cloud listener" : "Not loaded yet"}${st.state === "loading" ? ", waking" : ""}</dd></div>
        <div><dt>Stored on this device</dt><dd class="num">${storage?.usage != null ? mb(storage.usage) : "unknown"}</dd></div>
        <div><dt>Protected from clean-up</dt><dd>${storage?.persisted ? "Yes" : "Not guaranteed"}</dd></div>
        <div><dt>Field data</dt><dd>${data.source === "real" ? "Generated" : "Dev fixture"}</dd></div></dl>
      ${st.state === "error" ? html`<div class="banner banner-caution">${icon("warning")}<p><strong>The listener could not start.</strong> ${st.error?.message}</p></div>` : nothing}
    </section>

    <section aria-labelledby="h-settings" class="settings">
      <h2 id="h-settings">Settings and your data</h2>
      <div class="setting">
        <div class="setting-label" id="listener-label">Listener<span>${useCloud()
          ? "Cloud: your shrunk photo is read by the same open model on a server, then discarded. Fast on any phone; needs a connection."
          : "On this device: nothing leaves the device and it works offline. Needs a strong graphics chip and a ~320 MB download."}</span></div>
        <div class="segmented" role="radiogroup" aria-labelledby="listener-label">
          ${(["cloud", "device"] as const).map((t) => html`<label><input type="radio" name="listener" .checked=${(state.settings.listener === "device" ? "device" : "cloud") === t} @change=${() => setListener(t)} /><span>${t === "device" ? "On this device" : "Cloud"}</span></label>`)}
        </div>
      </div>
      <div class="setting">
        <div class="setting-label" id="theme-label">Appearance<span>Paper by day, forest by night.</span></div>
        <div class="segmented" role="radiogroup" aria-labelledby="theme-label">
          ${(["system", "light", "dark"] as const).map((t) => html`<label><input type="radio" name="theme" .checked=${state.settings.theme === t} @change=${() => setSetting("theme", t)} /><span>${t === "system" ? "Automatic" : t === "light" ? "Paper" : "Forest"}</span></label>`)}
        </div>
      </div>
      <div class="setting">
        <label class="setting-label" for="rankings-toggle">Community rankings<span>Show me on the board under a generated nickname${state.settings.playerName ? ` (${state.settings.playerName})` : ""}. Only XP, voices met and streak are shared. Turning it off removes you.</span></label>
        <span class="switch"><input id="rankings-toggle" type="checkbox" role="switch" .checked=${state.settings.rankings !== false} @change=${(e: Event) => void setRankings((e.target as HTMLInputElement).checked)} /><span></span></span>
      </div>
      <div class="setting">
        <label class="setting-label" for="captions-toggle">Large captions<span>Every voice is always captioned. This makes the words bigger.</span></label>
        <span class="switch"><input id="captions-toggle" type="checkbox" role="switch" .checked=${state.settings.largeCaptions} @change=${(e: Event) => setSetting("largeCaptions", (e.target as HTMLInputElement).checked)} /><span></span></span>
      </div>
      <div class="setting">
        <label class="setting-label" for="photos-toggle">Keep my photos<span>Show your own photo on each card. Stored on this phone only, never uploaded. ${photoCount()} saved.</span></label>
        <span class="switch"><input id="photos-toggle" type="checkbox" role="switch" .checked=${state.settings.keepPhotos} @change=${(e: Event) => setSetting("keepPhotos", (e.target as HTMLInputElement).checked)} /><span></span></span>
      </div>
      ${photoCount() > 0
        ? html`<div class="setting">
            <div class="setting-label">Saved photos<span>Delete every photo kept on this phone. Your field guide stays, with the illustrations back on the cards.</span></div>
            <div class="btn-row"><button class="btn" type="button" @click=${deletePhotos}>${icon("trash")} Delete my photos</button></div>
          </div>`
        : nothing}
      <div class="setting">
        <label class="setting-label" for="debug-toggle">Show match scores<span>The top five cosine scores behind every encounter.</span></label>
        <span class="switch"><input id="debug-toggle" type="checkbox" role="switch" .checked=${state.settings.debug} @change=${(e: Event) => setSetting("debug", (e.target as HTMLInputElement).checked)} /><span></span></span>
      </div>
      <div class="setting">
        <div class="setting-label">Your field guide<span>Export a copy, or bring one over from another phone.</span></div>
        <div class="btn-row">
          <button class="btn" type="button" @click=${exportGuide}>${icon("download")} Export</button>
          <button class="btn" type="button" @click=${() => document.getElementById("import-file")?.click()}>${icon("upload")} Import</button>
          <input id="import-file" class="file-input" type="file" tabindex="-1" aria-hidden="true" accept="application/json,.json" @change=${importGuide} />
        </div>
      </div>
      <div class="setting">
        <div class="setting-label">Start over<span>Clear the field guide, or download the field kit again.</span></div>
        <div class="btn-row">
          <button class="btn btn-danger" type="button" @click=${resetGuide}>${icon("trash")} Clear field guide</button>
          <button class="btn" type="button" @click=${redownload}>${icon("retry")} Download again</button>
        </div>
      </div>
    </section>
  </section>`;
}
