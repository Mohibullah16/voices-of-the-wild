// Badges tab: rank, streak and the twelve badges.
import { html } from "lit-html";
import { state } from "../app/state";
import { BADGES } from "../game/badges";
import { RANKS, rankFor } from "../game/rules";
import { streakView } from "../game/streak";
import { dayKey } from "../game/time";
import { compassView, questList } from "./home";
import { icon } from "./icons";

export function badgesView() {
  const g = state.game;
  const { rank, next, progress } = rankFor(g.xp);
  const sv = streakView(g.streak, dayKey(new Date()));
  const earned = BADGES.filter((b) => g.badges[b.id]).length;
  const met = Object.keys(g.met).filter((id) => !state.world?.owners.get(id)?.guardian).length;
  return html`<section class="badges-view" aria-labelledby="badges-title">
    <header class="rank-card">
      <div class="medal" aria-hidden="true">${icon("medal")}</div>
      <div>
        <h1 id="badges-title" tabindex="-1" class="display-2">${rank.name}</h1>
        <p class="num">${g.xp.toLocaleString()} XP${next ? html` <span class="muted">· ${(next.min - g.xp).toLocaleString()} to ${next.name}</span>` : ""}</p>
        <div class="rank-meter big" role="progressbar" aria-label="Progress to ${next?.name ?? "the top"}" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(progress * 100)}><i style="transform: scaleX(${progress})"></i></div>
      </div>
    </header>
    <dl class="stat-row">
      <div><dt>${icon("flame")}<span>Streak</span></dt><dd class="num">${sv.count}</dd></div>
      <div><dt>${icon("sparkle")}<span>Voices</span></dt><dd class="num">${met}/${state.world?.totalCharacters ?? 0}</dd></div>
      <div><dt>${icon("walk")}<span>Walks</span></dt><dd class="num">${g.wanders}</dd></div>
    </dl>
    ${questList(true)}
    <section aria-labelledby="badge-grid-title">
      <h2 id="badge-grid-title" class="section-title">Badges <span class="num muted">${earned}/${BADGES.length}</span></h2>
      <ul class="badge-grid">
        ${BADGES.map((b) => {
          const got = Boolean(g.badges[b.id]);
          return html`<li class="badge ${got ? "earned" : "locked"}">
            <span class="medal" aria-hidden="true">${icon(got ? b.icon : "lock")}</span>
            <span class="badge-name">${b.name}</span>
            <span class="badge-hint">${got ? "Earned" : b.hint}</span>
          </li>`;
        })}
      </ul>
    </section>
    <section aria-labelledby="ranks-title">
      <h2 id="ranks-title" class="section-title">Ranks</h2>
      <ol class="rank-ladder">
        ${RANKS.map((r) => html`<li class=${g.xp >= r.min ? "reached" : ""}><span>${r.name}</span><span class="num muted">${r.min.toLocaleString()}</span></li>`)}
      </ol>
    </section>
    ${compassView(9)}
  </section>`;
}
