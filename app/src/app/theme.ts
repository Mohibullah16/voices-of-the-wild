// Theme: "system" follows prefers-color-scheme; light/dark pin it.
const LIGHT_BG = "#f1eee3";
const DARK_BG = "#0e1613";

export function applyTheme(theme: "system" | "light" | "dark") {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.content = dark ? DARK_BG : LIGHT_BG;
  document.head.append(meta);
}

/** Captions are always on; this only changes their size. */
export function applyCaptionSize(large: boolean) {
  document.documentElement.toggleAttribute("data-large-captions", large);
}
