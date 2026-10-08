// Trail (home): today's three quests, streak, rank, the capture button, where to go next.
import { html, nothing } from "lit-html";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { emblemSvg } from "../art/emblems";
import { announce, state, update } from "../app/state";
import { asset } from "../config";
import { loadSamples, type Sample } from "../samples";
import { compass, PLACE_LABEL, type Place } from "../game/habitats";
import { activeQuest, canSkip, questProgress, trailFor, type Quest } from "../game/quests";
import { gameFastForward, gameSkip, SKIP_COST } from "../app/game";
import { rankFor } from "../game/rules";
import { streakView } from "../game/streak";
import { dayKey } from "../game/time";
import { icon, type IconName } from "./icons";
import { kitPercent, startKit } from "../app/kit";
import { useCloud } from "../app/embedder";
import { mb } from "../firstrun";

const QUEST_ICON: Partial<Record<Quest["kind"], IconName>> = { new: "star", walk: "footprints" };

/** Today's chain and its active quest. */
export function todayActive(): Quest | undefined {
  return activeQuest(todayActive.quests(), state.game.days[dayKey(new Date())]);
}
todayActive.quests = () => { const d = dayKey(new Date()); return trailFor(d, state.game.days[d], state.world!); };
export const PLACE_ICON: Record<Place, IconName> = {
  street: "roadHorizon", park: "tree", market: "storefront", water: "drop", beach: "waves", sky: "cloud", countryside: "barn", "old-city": "buildings", ground: "mountains",
};

export function questIcon(q: Quest) {
  const name = QUEST_ICON[q.kind];
  if (name) return icon(name);
  return unsafeSVG(emblemSvg(q.category ?? "ground", 24));
}

export function statusStrip() {
  const g = state.game;
  const today = dayKey(new Date());
  const sv = streakView(g.streak, today);
  const { rank, next, progress } = rankFor(g.xp);
  return html`<div class="status-strip">
    <a class="chip streak-chip ${sv.state}" href="#/badges" aria-label="${sv.count} day streak${sv.state === "at-risk" ? ", at risk: finish today’s trail" : ""}">
      ${icon("flame")}<span class="num">${sv.count}</span>
    </a>
    <a class="chip rank-chip" href="#/badges" aria-label="${rank.name}, ${g.xp} XP${next ? `, ${next.min - g.xp} to ${next.name}` : ""}">
      ${icon("medal")}<span>${rank.name}</span><span class="xp num">${g.xp.toLocaleString()} XP</span>
      <span class="rank-meter" aria-hidden="true"><i style="transform: scaleX(${progress})"></i></span>
    </a>
  </div>`;
}

/** The background download: progress while it runs, a retry if it stopped. Nothing once done. */
export function kitBanner() {
  const k = state.kit;
  if (k.phase === "running") {
    const pct = kitPercent();
    return html`<div class="kit-chip" role="status" aria-live="off">
      <span class="kit-chip-row">${icon("download")}<span><b>Getting the listener ready</b> <span class="num">${pct}%</span></span>
        <span class="num muted small">${mb(k.loaded)} of ${mb(k.total)}</span></span>
      <span class="kit-bar" aria-hidden="true"><i style="transform: scaleX(${pct / 100})"></i></span>
      <span class="small muted">Look around meanwhile.${useCloud() ? "" : " Once it’s done, it works offline."}</span>
    </div>`;
  }
  if (k.phase === "error") {
    return html`<div class="banner banner-caution" role="alert">${icon("warning")}<div><p><strong>The download stopped.</strong> ${k.message}</p>
      ${k.code === "webgpu" ? nothing : html`<button class="btn" type="button" @click=${() => void startKit().catch(() => {})}>${icon("retry")} Try again</button>`}</div></div>`;
  }
  return nothing;
}

export function questList(compact = false) {
  const today = dayKey(new Date());
  const day = state.game.days[today];
  const qs = trailFor(today, day, state.world!);
  const active = activeQuest(qs, day);
  const ahead = day?.ahead ?? 0;
  const done = qs.filter((q) => questProgress(q, day).done).length;
  return html`<section class="quests ${compact ? "compact" : ""}" aria-labelledby="quests-title">
    <header class="quests-head">
      <h2 id="quests-title">${ahead ? `Trail · day +${ahead}` : "Today’s trail"}</h2>
      <span class="quests-count num"><span aria-hidden="true">${done}/${qs.length}</span><span class="visually-hidden">${done} of ${qs.length} done</span></span>
    </header>
    <ol class="quest-list">
      ${qs.map((q) => {
        const p = questProgress(q, day);
        const now = q.id === active?.id;
        const skipped = day?.skipped?.includes(q.id);
        const st = skipped ? "done skipped" : p.done ? "done" : now ? "now" : "locked";
        return html`<li class="quest ${st}" aria-current=${now ? "step" : nothing}>
          <span class="quest-icon" aria-hidden="true">${p.done || now ? questIcon(q) : icon("lock")}</span>
          <span class="quest-label">${q.label}${now ? html` <small>now</small>` : skipped ? html` <small>skipped</small>` : nothing}</span>
          <span class="quest-state">
            <span aria-hidden="true">${p.done ? icon("checkCircle") : now && q.kind === "walk" ? html`<span class="num">${p.have}/${p.need}</span>` : icon("circle")}</span>
            <span class="visually-hidden">${p.done ? "done" : now ? `now${q.kind === "walk" ? `, ${p.have} of ${p.need} steps` : ""}` : "locked"}</span>
          </span>
        </li>`;
      })}
    </ol>
    ${compact ? nothing : trailTools(active)}
  </section>`;
}

/** Skip the active find quest (costs XP) or fast-forward to the next day's trail (MVP: more quests today).
 * Fast-forward with quests left asks for a second tap instead of a blocking dialog. */
let ffArmed = false;
function trailTools(active: Quest | undefined) {
  const skip = canSkip(active);
  const ff = () => {
    if (active && !ffArmed) {
      ffArmed = true;
      announce("Tap again to start tomorrow’s trail. Today’s unfinished quests are dropped; your XP stays.");
      update();
      return;
    }
    ffArmed = false;
    gameFastForward();
  };
  return html`<div class="trail-tools">
    ${skip ? html`<button class="btn btn-quiet" type="button" @click=${() => { ffArmed = false; gameSkip(); update(); }}>${icon("skipForward")} Skip quest <span class="num">−${SKIP_COST} XP</span></button>` : nothing}
    <button class="btn btn-quiet ${ffArmed ? "armed" : ""}" type="button" @click=${ff} aria-label=${ffArmed ? "Confirm: start tomorrow’s trail now" : "Fast-forward a day: start the next day’s trail now"}>
      ${icon("fastForward")} ${ffArmed ? "Tap again: start tomorrow" : "Next day"}</button>
  </div>`;
}

export function compassView(limit = 5) {
  const places = compass(state.world!, state.game.met).slice(0, limit);
  if (!places.length) return nothing;
  return html`<section class="compass" aria-labelledby="compass-title">
    <h2 id="compass-title">${icon("compass")} Go next</h2>
    <ul class="place-list">
      ${places.map((p) => html`<li class="place">
        <span aria-hidden="true">${icon(PLACE_ICON[p.place])}</span>
        <span>${PLACE_LABEL[p.place]}</span>
        <b class="num">${p.remaining}<span class="visually-hidden"> still hiding</span></b>
      </li>`)}
    </ul>
  </section>`;
}

let samples: Sample[] | null = null;

function sampleStrip(onPick: (s: Sample) => void) {
  if (!samples) {
    void loadSamples().then((s) => { samples = s; update(); });
    return nothing;
  }
  if (!samples.length) return nothing;
  return html`<section class="samples" aria-labelledby="samples-title">
    <h2 id="samples-title">${icon("images")} No camera? Try one</h2>
    <ul class="sample-list">
      ${samples.map((s) => html`<li><button class="sample" type="button" @click=${() => onPick(s)}>
        <img src=${asset(s.src)} alt="" width="88" height="88" loading="lazy" decoding="async" />
        <span>${s.label}</span>
      </button></li>`)}
    </ul>
  </section>`;
}

export function homeView(actions: { camera(): void; gallery(): void; viewfinder(): void; coarse: boolean; sample(s: Sample): void; walk(): void }) {
  const active = todayActive();
  if (active?.kind === "walk") {
    return html`<section class="home" aria-labelledby="listen-title">
      <h1 class="visually-hidden" id="listen-title" tabindex="-1">Today’s trail</h1>
      ${statusStrip()}
      ${kitBanner()}
      ${questList()}
      <div class="shutter-zone">
        <button class="shutter walk-shutter" type="button" @click=${actions.walk} aria-label="Start walking: ${active.label}">
          ${icon("footprints")}<span>Walk</span>
        </button>
        <div class="shutter-alt">
          <button class="btn btn-quiet" type="button" @click=${actions.coarse ? actions.camera : actions.gallery}>${icon(actions.coarse ? "camera" : "images")} Listen anyway</button>
        </div>
      </div>
      ${actions.coarse ? nothing : sampleStrip(actions.sample)}
      ${compassView()}
      ${actions.coarse ? sampleStrip(actions.sample) : nothing}
    </section>`;
  }
  return html`<section class="home" aria-labelledby="listen-title">
    <h1 class="visually-hidden" id="listen-title" tabindex="-1">Today’s trail</h1>
    ${statusStrip()}
    ${kitBanner()}
    ${questList()}
    <div class="shutter-zone">
      <button class="shutter" type="button" @click=${actions.coarse ? actions.camera : actions.gallery}
        aria-label=${actions.coarse ? "Open the camera and listen" : "Choose a photo and listen"}>
        ${icon(actions.coarse ? "camera" : "images")}<span>Listen</span>
      </button>
      <div class="shutter-alt">
        ${actions.coarse
          ? html`<button class="btn btn-quiet" type="button" @click=${actions.gallery}>${icon("images")} Photo</button>`
          : html`<button class="btn btn-quiet" type="button" @click=${actions.viewfinder}>${icon("aperture")} Webcam</button>`}
      </div>
    </div>
    ${actions.coarse ? nothing : sampleStrip(actions.sample)}
    ${compassView()}
    ${actions.coarse ? sampleStrip(actions.sample) : nothing}
  </section>`;
}
