import "./styles/fonts.css";
import "./styles/app.css";
import "./styles/game.css";
import { render } from "lit-html";
import { ensureEmbedder } from "./app/embedder";
import { parseRoute, setRenderer, state, update, type Route } from "./app/state";
import { applyCaptionSize, applyTheme } from "./app/theme";
import { audioPaths, loadFieldData } from "./data";
import { buildWorld } from "./game/world";
import { dataCached, downloadKit, planKit } from "./firstrun";
import { loadCollection, loadSettings } from "./store";
import { loadPhotos } from "./photos";
import { appView, bootView, fatalView } from "./ui/shell";
import { setupView } from "./ui/setup";
import { stopAll } from "./audio";
import { initGame, walkSteps } from "./app/game";

const root = document.getElementById("app")!;

function renderApp() {
  const view =
    state.phase === "boot" ? bootView()
    : state.phase === "fatal" ? fatalView(state.fatal ?? "")
    : state.phase === "setup" ? setupView()
    : appView();
  render(view, root);
}

function headingFor(r: Route): string {
  switch (r.name) {
    case "guide": return "guide-title";
    case "detail": return "detail-title";
    case "about": return "about-title";
    case "badges": return "badges-title";
    default: return state.listen.kind === "result" ? "enc-name" : "listen-title";
  }
}

function onRoute() {
  const next = parseRoute(location.hash);
  const prev = state.route;
  if (state.phase !== "app") return;
  // Leaving an encounter on the phone: stop the voice. On desktop both panes stay visible.
  if (prev.name === "listen" && next.name !== "listen" && !matchMedia("(min-width: 1024px)").matches) stopAll();
  update((s) => (s.route = next));
  requestAnimationFrame(() => {
    const narrow = !matchMedia("(min-width: 1024px)").matches;
    if (narrow) window.scrollTo({ top: 0 });
    else document.querySelector(".pane-book")?.scrollTo?.({ top: 0 });
    document.getElementById(headingFor(next))?.focus({ preventScroll: !narrow });
  });
}

async function boot() {
  setRenderer(renderApp);
  renderApp();
  const [settings, collection] = await Promise.all([loadSettings(), loadCollection(), loadPhotos()]);
  state.settings = settings;
  state.collection = collection;
  if (new URLSearchParams(location.search).has("debug")) state.settings.debug = true;
  applyTheme(settings.theme);
  applyCaptionSize(settings.largeCaptions);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(state.settings.theme));

  try {
    state.data = await loadFieldData();
  } catch (err) {
    state.phase = "fatal";
    state.fatal = (err as Error).message;
    renderApp();
    return;
  }
  await initGame();
  state.route = parseRoute(location.hash);
  state.phase = settings.setupDone ? "app" : "setup";
  if (state.phase === "app") {
    ensureEmbedder(); // wake the model in the background
    void refreshFieldKit();
  }
  renderApp();
  document.getElementById(state.phase === "setup" ? "setup-title" : "")?.focus();

  window.addEventListener("hashchange", onRoute);
  window.addEventListener("online", () => update((s) => (s.online = true)));
  window.addEventListener("offline", () => update((s) => (s.online = false)));

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  }
  if (__FIXTURES_ALLOWED__ && (state.data.source === "fixture" || new URLSearchParams(location.search).has("mock"))) {
    // Test hook for scripted runs against the dev fixture (never present with real data).
    const fx = await import("./dev-fixtures/fixture");
    const share = await import("./share");
    const home = await import("./ui/home");
    (window as unknown as { __votw: unknown }).__votw = { state, update, setMockPlan: fx.setMockPlan, walkSteps, activeQuest: home.todayActive, quests: home.todayActive.quests, renderShareCard: share.renderShareCard };
  }
}

/**
 * After a new deploy (new data hash), fetch the new field data and any new voice files once,
 * while online. Unchanged voices are hash-named and skipped. Offline, the previous kit keeps working.
 */
async function refreshFieldKit() {
  if (state.data?.source !== "real" || !navigator.onLine || (await dataCached())) return;
  try {
    await downloadKit(planKit(audioPaths(state.data.roster), true), () => {});
    state.data = await loadFieldData();
    state.world = buildWorld(state.data.ordered);
    update();
  } catch {
    /* try again next time */
  }
}

void boot();
