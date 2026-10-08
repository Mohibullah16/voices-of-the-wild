// @vitest-environment happy-dom
// Guarantee: no voice ever plays without a visible caption and a screen-reader announcement.
import { describe, expect, it, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { render } from "lit-html";
import { captionOf, stripTags, toWebVTT } from "../captions";
import { flattenOwners } from "../data";
import fixture from "../dev-fixtures/roster.runtime.json";
import type { RuntimeLine, RuntimeRoster } from "../types";
import { voiceLine, type VoiceLine } from "./voice";

const SRC = join(__dirname, "..");
const REAL = join(__dirname, "..", "..", "public", "data", "roster.runtime.json");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

const rosters: Array<[string, RuntimeRoster]> = [["fixture", fixture as unknown as RuntimeRoster]];
if (existsSync(REAL)) rosters.push(["real", JSON.parse(readFileSync(REAL, "utf8"))]);

function mount(line: RuntimeLine): VoiceLine {
  const host = document.createElement("div");
  document.body.append(host);
  render(voiceLine({ line, who: "Granny Neem", label: "First meeting", elder: true }), host);
  return host.querySelector("voice-line") as VoiceLine;
}
const shown = (el: Element) => el.querySelector("[data-caption]")?.textContent?.replace(/\s+/g, " ").trim() ?? "";

beforeEach(() => {
  // Waveform peaks fetch the mp3; there is no server in tests (peaks fall back to a stand-in).
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
  document.body.innerHTML = '<div id="announcer" role="log" aria-live="polite"></div>';
});

describe("every playback path is captioned", () => {
  it("only <voice-line> starts playback, and only audio.ts owns an audio element", () => {
    for (const f of files(SRC)) {
      const code = readFileSync(f, "utf8");
      const rel = f.slice(SRC.length + 1).replace(/\\/g, "/");
      if (rel !== "audio.ts") {
        expect(code, `${rel} must not create audio elements`).not.toMatch(/new Audio\(|createElement\(["']audio["']\)|<audio[\s>]/);
        if (rel !== "ui/voice.ts") expect(code, `${rel} must play through <voice-line>`).not.toMatch(/\bplayLine\(/);
      }
    }
  });

  it("renders the caption as visible text", () => {
    const el = mount({ text: "[cackles] I'm Granny Neem, friend!", caption: "I'm Granny Neem, friend!", src: "", engine: "kokoro", duration: 2 });
    expect(shown(el)).toBe("I'm Granny Neem, friend!");
  });

  it("falls back to the tag-stripped text when a caption is missing", () => {
    const el = mount({ text: "[sighs] Go and look up.", caption: "", src: "", engine: "kokoro", duration: 2 });
    expect(shown(el)).toBe("Go and look up.");
  });

  it("announces the caption to screen readers when it plays", async () => {
    const el = mount({ text: "Off you go, friend.", caption: "Off you go, friend.", src: "", engine: "kokoro", duration: 0.2 });
    void el.play();
    expect(document.getElementById("announcer")!.textContent).toContain("Off you go, friend.");
  });

  for (const [name, roster] of rosters) {
    it(`${name} roster: every line of every owner renders a non-empty caption`, () => {
      let n = 0;
      for (const owner of flattenOwners(roster.categories)) {
        for (const [key, line] of Object.entries(owner.lines)) {
          expect(captionOf(line!), `${owner.id}.${key}`).not.toBe("");
          const el = mount(line!);
          expect(shown(el), `${owner.id}.${key}`).toBe(captionOf(line!).replace(/\s+/g, " "));
          el.parentElement!.remove();
          n++;
        }
      }
      expect(n).toBeGreaterThanOrEqual(91 * 3);
    });
  }
});

describe("voice engine labels follow the data", () => {
  for (const [name, roster] of rosters) {
    it(`${name} roster: Elders are exactly the ElevenLabs voices, guardians are not Elders`, () => {
      for (const o of flattenOwners(roster.categories)) {
        if (o.guardian) expect(o.elder, o.id).toBe(roster.categories.find((c) => c.guardian.id === o.id)!.guardian.tier === "elder");
        const engines = new Set(Object.values(o.lines).map((l) => l!.engine));
        if (name === "real" && engines.has("elevenlabs")) expect(o.elder, `${o.id} uses ElevenLabs`).toBe(true);
      }
    });
  }

  it("styles a voice gold only when its line really is ElevenLabs", () => {
    const k = mount({ text: "Hello.", caption: "Hello.", src: "", engine: "kokoro", duration: 1 });
    expect(k.querySelector(".voice")!.hasAttribute("data-elder")).toBe(false);
    const e = mount({ text: "Hello.", caption: "Hello.", src: "", engine: "elevenlabs", duration: 1 });
    expect(e.querySelector(".voice")!.hasAttribute("data-elder")).toBe(true);
  });
});

describe("WebVTT", () => {
  it("cues the whole caption in order inside the clip", () => {
    const cap = stripTags("[warm] Hmm, a visitor. I'm the shade over every street you've walked, friend. Come meet us one by one.");
    const vtt = toWebVTT(cap, 6);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    const cues = [...vtt.matchAll(/(\d\d:\d\d:\d\d\.\d{3}) --> (\d\d:\d\d:\d\d\.\d{3})\n(.+)\n/g)];
    expect(cues.map((c) => c[3]).join(" ")).toBe(cap);
    const secs = (t: string) => { const [h, m, s] = t.split(":"); return +h! * 3600 + +m! * 60 + +s!; };
    for (const c of cues) {
      expect(secs(c[2]!)).toBeGreaterThan(secs(c[1]!));
      expect(secs(c[2]!)).toBeLessThanOrEqual(6);
    }
  });
});
