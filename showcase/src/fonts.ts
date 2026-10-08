// The app's self-hosted fonts (copied into public/fonts by `npm run assets`). Rendering waits for them.
import { continueRender, delayRender, staticFile } from "remotion";

const FACES: [string, string, FontFaceDescriptors][] = [
  ["EB Garamond", "fonts/eb-garamond.woff2", { weight: "400 800", style: "normal" }],
  ["EB Garamond", "fonts/eb-garamond-italic.woff2", { weight: "400 800", style: "italic" }],
  ["Atkinson Hyperlegible Next", "fonts/atkinson-400.woff2", { weight: "400" }],
  ["Atkinson Hyperlegible Next", "fonts/atkinson-600.woff2", { weight: "600" }],
  ["Atkinson Hyperlegible Next", "fonts/atkinson-700.woff2", { weight: "700" }],
];

let started = false;
export function loadFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Loading fonts");
  Promise.all(
    FACES.map(async ([family, file, desc]) => {
      const face = new FontFace(family, `url(${staticFile(file)}) format("woff2")`, desc);
      await face.load();
      document.fonts.add(face);
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}
