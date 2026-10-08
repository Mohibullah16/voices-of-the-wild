// Your own photos, kept on this phone only. One downscaled JPEG per character (your latest photo of it)
// sits in IndexedDB next to the field guide and replaces the illustration on that card. Nothing is uploaded:
// there is no server, and the service worker serves everything else from cache.
import { del, get, keys, set } from "idb-keyval";

const PREFIX = "votw:photo:";
const urls = new Map<string, string>();

/** Object URL of your photo of this character, if you have one. */
export const photoUrl = (id: string): string | undefined => urls.get(id);
export const photoCount = (): number => urls.size;

function remember(id: string, blob: Blob) {
  const old = urls.get(id);
  if (old) URL.revokeObjectURL(old);
  urls.set(id, URL.createObjectURL(blob));
}

export async function loadPhotos(): Promise<void> {
  try {
    for (const k of await keys()) {
      if (typeof k !== "string" || !k.startsWith(PREFIX)) continue;
      const blob = await get(k);
      if (blob instanceof Blob) remember(k.slice(PREFIX.length), blob);
    }
  } catch {
    // Storage blocked or unavailable: the illustrations stay.
  }
}

/** Saves the on-screen (already downscaled) photo as this character's picture. */
export async function savePhoto(id: string, previewUrl: string): Promise<void> {
  const blob = await (await fetch(previewUrl)).blob();
  await set(PREFIX + id, blob);
  remember(id, blob);
}

export async function clearPhotos(): Promise<void> {
  try {
    for (const k of await keys()) if (typeof k === "string" && k.startsWith(PREFIX)) await del(k);
  } catch {
    // Nothing to clear.
  }
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
}
