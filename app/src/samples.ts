// Sample photos for people without a camera at hand (judges on laptops). They run the
// real on-device pipeline but award nothing: the game is for things you find outside.
import { asset } from "./config";

export interface Sample {
  src: string;
  label: string;
  expect: "species" | "guardian" | "nobody";
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}

let cache: Promise<Sample[]> | null = null;

export function loadSamples(): Promise<Sample[]> {
  cache ??= fetch(asset("samples/samples.json"))
    .then((r) => (r.ok ? r.json() : { samples: [] }))
    .then((j: { samples: Sample[] }) => j.samples ?? [])
    .catch(() => []);
  return cache;
}

export async function sampleBlob(s: Sample): Promise<Blob> {
  const res = await fetch(asset(s.src));
  if (!res.ok) throw new Error("Sample photo missing.");
  return res.blob();
}
