// The field guide: progress per category, cards met, teasers for the rest.
import { html, nothing } from "lit-html";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { keyed } from "lit-html/directives/keyed.js";
import { emblemSvg, SHORT_NAME } from "../art/emblems";
import { state } from "../app/state";
import type { LineKey, Owner } from "../types";
import { card, tile } from "./card";
import { habitatLabel } from "./habitat";
import { icon } from "./icons";
import { voiceLine } from "./voice";
import { shareCard } from "../share";
import { toast } from "../app/state";

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" });

export function guideView() {
  const data = state.data!;
  const met = (o: Owner) => Boolean(state.collection.entries[o.id]);
  const metAll = data.ordered.filter(met);
  const elders = metAll.filter((o) => o.elder).length;
  const totalElders = data.ordered.filter((o) => o.elder).length;
  return html`<section class="guide" aria-labelledby="guide-title">
    <header class="guide-head">
      <h1 class="display-1" id="guide-title" tabindex="-1">Field guide</h1>
      <p class="guide-progress"><span><strong class="num">${metAll.length}</strong> of <span class="num">${data.ordered.length}</span> met</span><span>${elders} of ${totalElders} Elder voices</span></p>
      ${metAll.length === 0
        ? html`<p class="lede">Empty for now. <a href="#/">Go and listen</a>.</p>`
        : nothing}
    </header>
    <nav class="cat-index" aria-label="Jump to a category">
      ${data.categories.map((c) => {
        const owners = data.ordered.filter((o) => o.category === c.id);
        const n = owners.filter(met).length;
        return html`<a href="#/guide" class=${n === owners.length ? "done" : ""} @click=${(e: Event) => { e.preventDefault(); document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); document.getElementById(`cat-${c.id}-title`)?.focus({ preventScroll: true }); }}>
          ${unsafeSVG(emblemSvg(c.id, 24))}${SHORT_NAME[c.id] ?? c.name} <span class="count num">${n}/${owners.length}</span></a>`;
      })}
    </nav>
    ${data.categories.map((c) => {
      const owners = data.ordered.filter((o) => o.category === c.id);
      const n = owners.filter(met).length;
      const blessed = Boolean(state.game.blessed[c.id]);
      return html`<section class="cat-section" id="cat-${c.id}" aria-labelledby="cat-${c.id}-title">
        <div class="cat-head ${blessed ? "blessed" : ""}">
          ${unsafeSVG(emblemSvg(c.id, 44))}
          <div><h2 id="cat-${c.id}-title" tabindex="-1">${c.name}</h2><p>${blessed ? html`${icon("sealCheck")} Blessed by ${c.guardian.name}` : c.guardian.name}</p></div>
          <div class="pips" role="img" aria-label="${n} of ${owners.length} met">${owners.map((o) => html`<span class="pip ${met(o) ? "met" : ""} ${o.elder ? "elder" : ""}"></span>`)}</div>
        </div>
        <ul class="tiles">${owners.map((o) => tile(o, met(o), SHORT_NAME[c.id] ?? c.name))}</ul>
      </section>`;
    })}
  </section>`;
}

const LINE_ORDER: Array<[LineKey, string]> = [["first_meet", "First meeting"], ["again", "When you come back"], ["goodbye", "Goodbye"], ["hint", "Tip, when unsure"]];

async function doShare(owner: Owner, format: "portrait" | "wide", metOn: string) {
  try {
    const r = await shareCard(owner, owner.lines.first_meet, format, metOn);
    if (r === "downloaded") toast("Card saved.");
  } catch {
    toast("Could not make the card.");
  }
}

export function detailView(id: string) {
  const data = state.data!;
  const owner = data.owners.get(id);
  const entry = state.collection.entries[id];
  const back = html`<a class="backlink" href="#/guide">${icon("arrowLeft")} Field guide</a>`;
  if (!owner || !entry) {
    return html`<section class="detail" aria-labelledby="detail-title">${back}
      <h1 class="display-2" id="detail-title" tabindex="-1">Not met yet</h1>
      <p class="lede">This page fills in when it answers you outside.</p></section>`;
  }
  const cat = data.categories.find((c) => c.id === owner.category);
  return html`<section class="detail" aria-labelledby="detail-title">
    ${back}
    <div class="detail-grid">
      <div>${card(owner, { headingId: "detail-title", headingLevel: 1 })}</div>
      <div class="detail" style="gap: 20px">
        <dl class="facts">
          <div><dt>First met</dt><dd>${dateFmt.format(new Date(entry.firstMet))}</dd></div>
          <div><dt>Times met</dt><dd class="num">${entry.timesMet}</dd></div>
        </dl>
        ${owner.personality ? html`<p class="field-note">${owner.personality}</p>` : nothing}
        ${owner.caution
          ? html`<div class="banner banner-caution" role="note">${icon("warning")}<p><strong>Look, don’t touch.</strong> Keep your distance from this one.</p></div>`
          : nothing}
        ${owner.habitat.length ? html`<div class="card-tags" aria-label="Habitat">${owner.habitat.map((h) => html`<span class="tag">${habitatLabel(h)}</span>`)}</div>` : nothing}
        <div>
          <h2 class="display-3" style="margin-bottom: 12px">What ${owner.guardian ? "the guardian" : "they"} said</h2>
          ${keyed(owner.id, html`<ul class="lines-list">
            ${LINE_ORDER.filter(([k]) => owner.lines[k]).map(
              ([k, label]) => html`<li><h3>${label}</h3>${voiceLine({ line: owner.lines[k]!, who: owner.name, label, elder: owner.elder, compact: true, key: `${owner.id}-${k}` })}</li>`,
            )}
          </ul>`)}
        </div>
        <div class="btn-row">
          <button class="btn" type="button" @click=${() => doShare(owner, "portrait", entry.firstMet)}>${icon("share")} Share</button>
          <button class="btn btn-quiet" type="button" @click=${() => doShare(owner, "wide", entry.firstMet)}>${icon("download")} Wide image</button>
        </div>
        <p class="small muted">${cat ? html`Part of ${cat.name}, looked after by ${cat.guardian.name}.` : nothing} ${owner.lines.first_meet?.engine === "elevenlabs" ? "Voiced with ElevenLabs." : "Voiced with Kokoro, an open-source speech model."}</p>
      </div>
    </div>
  </section>`;
}
