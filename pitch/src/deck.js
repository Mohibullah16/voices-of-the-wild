// Slide engine: fit-to-window scaling, keyboard + click navigation, URL hash,
// presenter notes (N), print mode (?print or Ctrl+P).
(() => {
  const root = document.documentElement;
  const deck = document.querySelector(".deck");
  const slides = [...document.querySelectorAll(".slide")];
  const total = slides.length;
  const params = new URLSearchParams(location.search);

  // Page numbers and entrance stagger order.
  slides.forEach((s, i) => {
    const pg = s.querySelector(".foot .pg");
    if (pg) pg.textContent = String(i + 1).padStart(2, "0");
    s.querySelectorAll("[data-r]").forEach((el, j) => el.style.setProperty("--i", String(j)));
    s.setAttribute("aria-roledescription", "slide");
    s.setAttribute("aria-label", `${i + 1} of ${total}`);
  });

  if (params.has("print")) {
    root.classList.add("print");
    slides.forEach((s) => s.classList.add("active"));
    return;
  }

  function fit() {
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    deck.style.setProperty("--scale", String(scale));
  }
  window.addEventListener("resize", fit);
  fit();

  let current = -1;
  function go(n, push = true) {
    n = Math.max(0, Math.min(total - 1, n));
    if (n === current) return;
    slides.forEach((s, i) => {
      const on = i === n;
      s.classList.toggle("active", on);
      s.setAttribute("aria-hidden", on ? "false" : "true");
    });
    current = n;
    if (push) history.replaceState(null, "", `#${n + 1}`);
    const h = slides[n].querySelector("h1, h2, blockquote");
    document.title = `${n + 1}/${total} · Voices of the Wild`;
    if (h) live.textContent = `Slide ${n + 1} of ${total}. ${h.textContent.trim()}`;
  }

  const live = document.createElement("div");
  live.setAttribute("aria-live", "polite");
  live.className = "sr-live";
  live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);";
  document.body.appendChild(live);

  window.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter":
        e.preventDefault(); go(current + 1); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace":
        e.preventDefault(); go(current - 1); break;
      case "Home": e.preventDefault(); go(0); break;
      case "End": e.preventDefault(); go(total - 1); break;
      case "n": case "N": root.classList.toggle("show-notes"); break;
      case "f": case "F":
        if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.();
        break;
    }
  });

  // Click: left third goes back, anywhere else goes forward.
  window.addEventListener("click", (e) => {
    if (e.target.closest("a, button, aside.notes")) return;
    go(e.clientX < window.innerWidth / 3 ? current - 1 : current + 1);
  });

  // Touch swipe.
  let x0 = null;
  window.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  window.addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) go(dx < 0 ? current + 1 : current - 1);
    x0 = null;
  });

  window.addEventListener("hashchange", () => {
    const n = parseInt(location.hash.slice(1), 10);
    if (!Number.isNaN(n)) go(n - 1, false);
  });

  // Ctrl+P / browser print: show every slide.
  window.addEventListener("beforeprint", () => slides.forEach((s) => s.classList.add("active")));
  window.addEventListener("afterprint", () => slides.forEach((s, i) => s.classList.toggle("active", i === current)));

  const start = parseInt(location.hash.slice(1), 10);
  go(Number.isNaN(start) ? 0 : start - 1, false);
})();
