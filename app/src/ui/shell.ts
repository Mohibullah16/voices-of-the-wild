// App chrome: header, panes (two on desktop, one on phone), bottom tab bar.
import { html, nothing } from "lit-html";
import { unsafeSVG } from "lit-html/directives/unsafe-svg.js";
import { markSvg } from "../art/logo";
import { state, type Route } from "../app/state";
import { aboutView } from "./about";
import { detailView, guideView } from "./guide";
import { icon } from "./icons";
import { listenView } from "./listen";
import { badgesView } from "./badges";
import { momentsView } from "./moments";

const isBook = (r: Route) => r.name === "guide" || r.name === "detail";

export function wordmark() {
  return html`<a class="wordmark" href="#/" aria-label="Voices of the Wild, home">${unsafeSVG(markSvg(30))}<span class="wordmark-text" aria-hidden="true" translate="no">Voices <i>of the</i> Wild</span></a>`;
}

export function appView() {
  const r = state.route;
  const listenActive = r.name === "listen";
  const current = (match: boolean) => (match ? "page" : nothing);
  return html`
    <a class="skip-link" href="#main" @click=${(e: Event) => { e.preventDefault(); document.querySelector<HTMLElement>(".pane:not([hidden]) [tabindex='-1']")?.focus(); }}>Skip to content</a>
    <div class="app">
      <header class="topbar">
        ${wordmark()}
        <div style="display:flex;align-items:center;gap:12px">
          ${state.data?.source === "fixture" ? html`<span class="dev-badge" title="Running on the development fixture, not generated data">Dev fixture</span>` : nothing}
          ${!state.online ? html`<span class="top-status">${icon("wifiSlash")} Offline</span>` : nothing}
          <nav class="topnav" aria-label="Main">
            <a href="#/" aria-current=${current(listenActive)}>${icon("path")} Trail</a>
            <a href="#/guide" aria-current=${current(isBook(r))}>${icon("book")} Field guide</a>
            <a href="#/badges" aria-current=${current(r.name === "badges")}>${icon("medal")} Badges</a>
            <a href="#/about" aria-current=${current(r.name === "about")}>${icon("info")} About</a>
          </nav>
        </div>
      </header>
      <main id="main" class="panes">
        <div class="pane pane-field" ?hidden=${!listenActive}>${listenView()}</div>
        <div class="pane pane-book" ?hidden=${listenActive}>
          ${r.name === "about" ? aboutView() : r.name === "detail" ? detailView(r.id) : r.name === "badges" ? badgesView() : guideView()}
        </div>
      </main>
      <nav class="tabbar" aria-label="Main">
        <a href="#/" aria-current=${current(listenActive)}>${icon("path")}<span>Trail</span></a>
        <a href="#/guide" aria-current=${current(isBook(r))}>${icon("book")}<span>Guide</span></a>
        <a href="#/badges" aria-current=${current(r.name === "badges")}>${icon("medal")}<span>Badges</span></a>
        <a href="#/about" aria-current=${current(r.name === "about")}>${icon("info")}<span>About</span></a>
      </nav>
      <div id="announcer" class="visually-hidden" role="log" aria-live="polite" aria-relevant="additions"></div>
      ${state.toast ? html`<div class="toast" role="status">${state.toast}</div>` : nothing}
      <div class="xp-pops" aria-live="polite">
        ${state.xpPops.map((p) => html`<div class="xp-pop" role="status">
          <p class="xp-pop-xp"><b class="num">+${p.xp}</b> XP</p>
          <p class="xp-pop-parts">${p.parts.join(" · ")}</p>
          ${p.done.map((d) => html`<p class="xp-pop-done">${icon("checkCircle")} ${d}</p>`)}
          ${p.next ? html`<p class="xp-pop-next">Next: <b>${p.next}</b></p>` : nothing}
        </div>`)}
      </div>
      ${momentsView()}
    </div>`;
}

export function bootView() {
  return html`<div class="center-screen" aria-busy="true"><div>${unsafeSVG(markSvg(48))}<p class="muted">Opening the field guide…</p></div></div>`;
}

export function fatalView(message: string) {
  return html`<main class="center-screen" id="main"><div style="max-width:44ch;display:grid;gap:12px">
    ${unsafeSVG(markSvg(48))}
    <h1 class="display-2">The field guide is still being written.</h1>
    <p class="muted">${message}</p>
    <p class="small muted">If you are building this app: run the pipeline (npm run embed, npm run audio) so that public/data exists, or start the dev server to use the fixture.</p>
  </div></main>`;
}
