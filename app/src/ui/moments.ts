// Big moments, one at a time, in a native modal <dialog> (focus trap, Escape, inert page for free).
import { html, nothing } from "lit-html";
import { ref } from "lit-html/directives/ref.js";
import { keyed } from "lit-html/directives/keyed.js";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { SHORT_NAME } from "../art/emblems";
import { sigilSvg } from "../art/sigil";
import { dismissMoment } from "../app/game";
import { state, type Moment } from "../app/state";
import { BADGES } from "../game/badges";
import { icon } from "./icons";
import { voiceLine } from "./voice";

let shownKey = "";

function open(el: Element | undefined) {
  const d = el as HTMLDialogElement | undefined;
  if (d && !d.open) {
    d.showModal();
    navigator.vibrate?.([30, 50, 30, 50, 140]);
  }
}

function body(m: Moment) {
  switch (m.kind) {
    case "badge": {
      const b = BADGES.find((x) => x.id === m.id)!;
      return html`<div class="medal big" aria-hidden="true">${icon(b.icon)}</div>
        <p class="moment-kicker">Badge</p>
        <h2 id="moment-title" class="moment-title">${b.name}</h2>
        <p class="moment-line">${b.hint.replace(/\.$/, "")}. Done.</p>`;
    }
    case "rank":
      return html`<div class="medal big rank" aria-hidden="true">${icon("medal")}</div>
        <p class="moment-kicker">New rank</p>
        <h2 id="moment-title" class="moment-title">${m.name}</h2>`;
    case "trail":
      return html`<div class="medal big flame" aria-hidden="true">${icon("flame")}</div>
        <p class="moment-kicker">Today’s trail</p>
        <h2 id="moment-title" class="moment-title">Done</h2>
        <p class="moment-line num">${m.streak} day streak</p>`;
    case "finale":
      return html`<div class="medal big rank" aria-hidden="true">${icon("trophy")}</div>
        <p class="moment-kicker">Every voice</p>
        <h2 id="moment-title" class="moment-title">You heard them all</h2>`;
    case "blessed": {
      const cat = state.data!.categories.find((c) => c.id === m.category)!;
      const g = state.data!.owners.get(cat.guardian.id)!;
      return html`<div class="sigil-gold" aria-hidden="true">${unsafeSVG(sigilSvg(m.category, 140))}</div>
        <p class="moment-kicker">${SHORT_NAME[m.category] ?? cat.name} complete</p>
        <h2 id="moment-title" class="moment-title">${g.name} blesses you</h2>
        ${g.lines.goodbye ? keyed(`bless-${m.category}`, voiceLine({ line: g.lines.goodbye, who: g.name, label: "Blessing", elder: g.elder, compact: true, autoplay: true })) : nothing}`;
    }
  }
}

export function momentsView() {
  const m = state.moments[0];
  if (!m) {
    shownKey = "";
    return nothing;
  }
  const key = JSON.stringify(m);
  const fresh = key !== shownKey;
  shownKey = key;
  return keyed(key, html`<dialog class="moment ${fresh ? "fresh" : ""}" aria-labelledby="moment-title"
      ${ref((el) => queueMicrotask(() => open(el)))}
      @cancel=${(e: Event) => { e.preventDefault(); dismissMoment(); }}>
    <div class="moment-inner">
      <div class="burst" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => html`<i style="--i:${i}"></i>`)}</div>
      ${body(m)}
      <button class="btn btn-primary" type="button" autofocus @click=${dismissMoment}>${state.moments.length > 1 ? "Next" : "Continue"}</button>
    </div>
  </dialog>`);
}
