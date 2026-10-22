// News pictures shrunk to the size they're shown at. Feeds hand over full-size
// photos (often 4000+ px wide, 1–2 MB) for ~330 px cards; Chromium decoding
// those while you scroll is what made Tech Spotlight's scroll stall. Each one
// is fetched through main (anchor-img://, see main.js), decoded and scaled off
// the main thread by createImageBitmap, and kept as a small blob: URL.
import { useEffect, useState } from "react";

const MAX_AT_ONCE = 3;
const KEEP = 300;
const cache = new Map<string, Promise<string | null>>();
const waiting: (() => void)[] = [];
let running = 0;

/** A blob: URL of `url` scaled to `width` CSS px (times the display's pixel ratio), or null if it can't be. */
export function thumb(url: string, width: number): Promise<string | null> {
  const px = Math.round(width * (window.devicePixelRatio || 1));
  const key = `${px}|${url}`;
  let job = cache.get(key);
  if (!job) {
    job = queue(() => shrink(url, px));
    cache.set(key, job);
    if (cache.size > KEEP) cache.delete(cache.keys().next().value!);
  }
  return job;
}

/** Starts shrinking pictures before they're needed, in list order. */
export function prepareThumbs(urls: (string | null)[], width: number) {
  for (const u of urls) if (u) void thumb(u, width);
}

/** The shrunk picture once it's ready; the original URL if shrinking failed. */
export function useThumb(url: string | null, width: number): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    setSrc(null);
    if (!url) return;
    let live = true;
    thumb(url, width).then((t) => { if (live) setSrc(t ?? url); });
    return () => { live = false; };
  }, [url, width]);
  return src;
}

function queue<T>(job: () => Promise<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const run = () => {
      running++;
      job()
        .then(resolve, () => resolve(null))
        .finally(() => {
          running--;
          waiting.shift()?.();
        });
    };
    if (running < MAX_AT_ONCE) run();
    else waiting.push(run);
  });
}

async function shrink(url: string, px: number): Promise<string | null> {
  const res = await fetch(`anchor-img://fetch?u=${encodeURIComponent(url)}`);
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob(), { resizeWidth: px, resizeQuality: "medium" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/webp", quality: 0.85 }));
}
