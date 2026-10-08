// Photo intake: decode, respect EXIF orientation, downscale. The photo never
// leaves this tab: it is turned into pixels and embedded. A downscaled copy is kept on this phone only if the player leaves "Keep my photos" on.
import { PHOTO_MAX_SIDE } from "./config";

export interface PreparedPhoto {
  image: ImageData;
  /** Object URL of the downscaled photo for on-screen display; revoke when done. */
  previewUrl: string;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function fitWithin(w: number, h: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

async function fromSource(source: CanvasImageSource, w: number, h: number): Promise<PreparedPhoto> {
  const size = fitWithin(w, h);
  const c = canvas(size.width, size.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  const image = ctx.getImageData(0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.82));
  return { image, previewUrl: blob ? URL.createObjectURL(blob) : "" };
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  if (file.type && !file.type.startsWith("image/")) throw new Error("That file is not a photo.");
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return await fromSource(bmp, bmp.width, bmp.height);
  } finally {
    bmp.close();
  }
}

export function prepareVideoFrame(video: HTMLVideoElement): Promise<PreparedPhoto> {
  return fromSource(video, video.videoWidth, video.videoHeight);
}
