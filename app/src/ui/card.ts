// The collectible card and the field-guide tiles.
import { html, nothing } from "lit-html";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { emblemSvg, SHORT_NAME } from "../art/emblems";
import { motifSvg } from "../art/motif";
import { sigilSvg } from "../art/sigil";
import { hrefFor } from "../app/state";
import { photoUrl } from "../photos";
import type { Owner } from "../types";
import { habitatHint } from "./habitat";
import { icon } from "./icons";

export const pig = (category: string) => `--pig: var(--pig-${category})`;
export const catNo = (n: number) => `No. ${String(n).padStart(3, "0")}`;

export function art(owner: Owner, cls = "") {
  // Your own photo (kept on this phone) replaces the illustration. Guardians keep their sigils.
  const shot = owner.guardian ? undefined : photoUrl(owner.id);
  if (shot) return html`<div class="card-art has-photo ${cls}"><img src=${shot} alt="Your photo of ${owner.species}" /></div>`;
  return owner.guardian
    ? html`<div class="card-art guardian ${cls}">${unsafeSVG(sigilSvg(owner.category, 160))}</div>`
    : html`<div class="card-art ${cls}">${unsafeSVG(motifSvg(owner.id, owner.category))}</div>`;
}

export function card(owner: Owner, opts: { reveal?: boolean; isNew?: boolean; headingId?: string; headingLevel?: 1 | 2 } = {}) {
  const name = opts.headingLevel === 1
    ? html`<h1 class="card-name" translate="no" id=${opts.headingId ?? nothing} tabindex="-1">${owner.name}</h1>`
    : html`<h2 class="card-name" translate="no" id=${opts.headingId ?? nothing} tabindex="-1">${owner.name}</h2>`;
  return html`<article class="card ${opts.reveal ? "reveal" : ""}" ?data-elder=${owner.elder} ?data-guardian=${owner.guardian} style=${pig(owner.category)}
      aria-label="${owner.name}, ${owner.species}${owner.elder ? ", Elder voice" : ""}">
    <div class="card-inner">
      <div class="card-top">
        <span class="num">${catNo(owner.number)}</span>
        <span class="card-cat">${unsafeSVG(emblemSvg(owner.category, 20))}${SHORT_NAME[owner.category] ?? owner.category}</span>
      </div>
      ${art(owner)}
      <div class="card-body">
        ${name}
        <p class="card-species">${owner.species}</p>
        <div class="card-tags">
          ${opts.isNew ? html`<span class="tag tag-new">${icon("sealCheck")} New in your field guide</span>` : nothing}
          ${owner.elder ? html`<span class="tag tag-elder">Elder voice</span>` : nothing}
          ${owner.guardian ? html`<span class="tag">Guardian</span>` : nothing}
          ${owner.caution ? html`<span class="tag tag-caution">${icon("warning")} Keep your distance</span>` : nothing}
        </div>
      </div>
    </div>
  </article>`;
}

function tileArt(owner: Owner) {
  const shot = owner.guardian ? undefined : photoUrl(owner.id);
  if (shot) return html`<span class="tile-art has-photo"><img src=${shot} alt="" /></span>`;
  return html`<span class="tile-art">${owner.guardian ? unsafeSVG(sigilSvg(owner.category, 80)) : unsafeSVG(motifSvg(owner.id, owner.category))}</span>`;
}

export function tile(owner: Owner, met: boolean, categoryName: string) {
  if (met) {
    return html`<li class="tile">
      <a class="tile-btn" href=${hrefFor({ name: "detail", id: owner.id })} ?data-elder=${owner.elder} style=${pig(owner.category)}>
        <span class="tile-inner">
          ${tileArt(owner)}
          <span class="tile-text">
            <span class="tile-name" translate="no">${owner.name}</span>
            <span class="tile-sub">${owner.guardian ? "Guardian" : owner.species}${owner.elder ? " · Elder" : ""}</span>
          </span>
        </span>
      </a>
    </li>`;
  }
  const teaser = owner.guardian
    ? `Photograph anything in ${categoryName.toLowerCase()} and the guardian may answer.`
    : habitatHint(owner.habitat, owner.id);
  return html`<li class="tile">
    <div class="tile-locked" ?data-elder=${owner.elder}>
      <span class="tile-art">${unsafeSVG(emblemSvg(owner.category, 48))}</span>
      <span class="tile-text">
        <span class="tile-name">${owner.guardian ? "The guardian" : "Not met yet"}</span>
        <span class="tile-sub">${teaser}${owner.elder ? html`<br />An Elder voice waits here.` : nothing}</span>
      </span>
    </div>
  </li>`;
}
