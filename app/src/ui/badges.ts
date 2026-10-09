// Badges tab: rank, streak and the twelve badges.
import { html, nothing } from "lit-html";
import { state } from "../app/state";
import { BADGES } from "../game/badges";
import { RANKS, rankFor } from "../game/rules";
import { streakView } from "../game/streak";
import { dayKey } from "../game/time";
import { compassView, questList } from "./home";
import { icon } from "./icons";
import { getBoard, playerName } from "../app/community";

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
    ${community()}
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

/** Anonymous community rankings: top walkers by XP, your place, and who's out right now. */
function community() {
  const b = getBoard();
  const me = playerName();
  const row = (r: { rank: number; name: string; xp: number; voices: number; online: boolean }, mine = false) =>
    html`<li class="board-row ${mine ? "me" : ""}">
      <span class="board-rank num">${r.rank}</span>
      <span class="board-name">${r.name}${mine ? html` <small>you</small>` : nothing}${r.online ? html`<i class="board-dot" title="Walking now"></i><span class="visually-hidden">, walking now</span>` : nothing}</span>
      <span class="board-xp num">${r.xp.toLocaleString()} XP</span>
    </li>`;
  return html`<section class="board" aria-labelledby="board-title">
    <h2 id="board-title" class="section-title">Community <span class="num muted">${b ? `${b.online} walking now · ${b.players} ${b.players === 1 ? "player" : "players"}` : ""}</span></h2>
    ${!b
      ? html`<p class="muted small">${navigator.onLine ? "Loading the rankings…" : "The rankings need a connection."}</p>`
      : !b.top.length
        ? html`<p class="muted small">No one on the board yet. Be the first.</p>`
        : html`<ol class="board-list">${b.top.slice(0, 10).map((r) => row(r, b.me?.rank === r.rank))}</ol>
          ${b.me && b.me.rank > 10 ? html`<ol class="board-list" start=${b.me.rank}>${row(b.me, true)}</ol>` : nothing}`}
    <p class="muted small">${me ? html`You appear as <strong>${me}</strong>. Anonymous: only your nickname, XP, voices and streak are shared. Turn it off in About.` : "You’re not on the board. Turn it on in About."}</p>
  </section>`;
}
