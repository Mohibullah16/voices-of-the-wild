// <voice-line>: one spoken line with a play/pause control, a waveform that
// fills as it plays, and a caption that follows the voice word by word.
// Light DOM (global styles apply); renders itself with lit-html.
import { html, render, svg } from "lit-html";
import { lineDuration, peaksFor, playLine, type PlayEnd, type PlayHandle } from "../audio";
import { captionOf, timeWords, wordAt, type CaptionWord } from "../captions";
import { announce } from "../app/state";
import type { RuntimeLine } from "../types";
import { icon } from "./icons";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export class VoiceLine extends HTMLElement {
  line!: RuntimeLine;
  who = "";
  label = "";
  elder = false;
  compact = false;
  autoplay = false;

  private handle: PlayHandle | null = null;
  private words: CaptionWord[] = [];
  private peaks: number[] = [];
  private fraction = 0;
  private seconds = 0;
  private status: "idle" | "playing" | "paused" | "ended" | "blocked" = "idle";
  private missing = false;
  private started = false;

  connectedCallback() {
    // Every line is captioned: the pipeline caption, or the tag-stripped text if it is ever missing.
    this.words = timeWords(captionOf(this.line));
    this.draw();
    void peaksFor(this.line, this.compact ? 36 : 48).then((p) => {
      this.peaks = p;
      this.draw();
    });
    if (this.autoplay && !this.started) queueMicrotask(() => void this.play());
  }

  disconnectedCallback() {
    this.handle?.stop();
    this.handle = null;
  }

  /** Plays from the start. Resolves when the line ends (or is stopped / blocked). */
  play(): Promise<PlayEnd> {
    this.started = true;
    this.fraction = 0;
    this.missing = false;
    // Screen readers hear the caption whenever a voice starts, on every playback path.
    announce(`${this.who}, ${this.label}: ${captionOf(this.line)}`);
    const h = playLine(this.line, {
      title: this.who,
      subtitle: this.label,
      onTick: (fr, sec) => {
        this.fraction = fr;
        this.seconds = sec;
        this.draw();
      },
      onState: (s) => {
        if (s === "playing") this.status = "playing";
        else if (s === "paused") this.status = "paused";
        this.draw();
      },
    });
    this.handle = h;
    this.status = "playing";
    this.draw();
    return h.done.then((end) => {
      if (this.handle !== h) return end;
      this.handle = null;
      this.status = end === "blocked" ? "blocked" : end === "stopped" ? "idle" : "ended";
      if (end === "missing") this.missing = true;
      if (end === "stopped") this.fraction = 0;
      this.draw();
      this.dispatchEvent(new CustomEvent("voice-end", { detail: end, bubbles: true }));
      return end;
    });
  }

  private onButton = () => {
    if (this.handle && (this.status === "playing" || this.status === "paused")) this.handle.toggle();
    else void this.play();
  };

  private draw() {
    const playing = this.status === "playing";
    const n = this.peaks.length;
    const on = Math.round(this.fraction * n);
    const current = this.status === "idle" || this.status === "blocked" ? -1 : this.status === "ended" ? this.words.length : wordAt(this.words, this.fraction);
    const action = playing ? "Pause" : this.status === "paused" ? "Resume" : this.status === "ended" ? "Replay" : "Play";
    const glyph = playing ? icon("pause") : this.status === "ended" ? icon("replay") : icon("play");
    const dur = lineDuration(this.line);
    render(
      html`<div class="voice ${this.compact ? "compact" : ""}" ?data-elder=${this.elder}>
        ${this.compact ? null : html`<div class="voice-who"><span>${this.who}</span><span>${this.label}</span></div>`}
        <div class="voice-row">
          <button class="voice-play" type="button" @click=${this.onButton} aria-label="${action}: ${this.who}, ${this.label}">${glyph}</button>
          <svg class="wave" viewBox="0 0 ${Math.max(1, n) * 6} 40" preserveAspectRatio="none" aria-hidden="true">
            ${this.peaks.map((p, i) => svg`<rect class=${i < on ? "on" : ""} x=${i * 6 + 1} y=${20 - p * 18} width="3.2" height=${Math.max(2, p * 36)} rx="1.6"></rect>`)}
          </svg>
          <span class="voice-time num" aria-hidden="true">${fmt(this.status === "idle" ? dur : this.seconds)}</span>
        </div>
        <p class="caption" data-caption>${this.words.map((w, i) => html`<span class="w ${i < current ? "said" : i === current ? "now" : ""}">${w.text}</span> `)}</p>
        ${this.status === "blocked"
          ? html`<p class="voice-note">Your browser held the voice back. Tap play to hear it.</p>`
          : this.missing
            ? html`<p class="voice-note">The voice file is not on this phone yet, so here is the caption on its own.</p>`
            : null}
      </div>`,
      this,
    );
  }
}

if (!customElements.get("voice-line")) customElements.define("voice-line", VoiceLine);

/** lit-html helper: renders a <voice-line> with properties set. */
export function voiceLine(opts: { line: RuntimeLine; who: string; label: string; elder: boolean; compact?: boolean; autoplay?: boolean; key?: string }) {
  return html`<voice-line
    data-key=${opts.key ?? ""}
    .line=${opts.line}
    .who=${opts.who}
    .label=${opts.label}
    .elder=${opts.line.engine === "elevenlabs" /* gold styling follows the real engine */}
    .compact=${Boolean(opts.compact)}
    .autoplay=${Boolean(opts.autoplay)}
  ></voice-line>`;
}
