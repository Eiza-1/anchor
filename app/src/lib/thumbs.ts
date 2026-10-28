// News pictures shrunk to the size they're shown at. Feeds hand over full-size
// photos (often 4000+ px wide, 1–2 MB) for ~330 px cards; Chromium decoding
// those while you scroll is what made Tech Spotlight's scroll stall. Each one
// is fetched through main (anchor-img://, see main.js), then decoded, scaled
// and re-encoded in a worker (thumbs.worker.ts), and kept as a small blob: URL.
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
    if (cache.size > KEEP) {
      const [oldest, dropped] = cache.entries().next().value!;
      cache.delete(oldest);
      // a card still showing it keeps its decoded picture; the blob itself can go
      void dropped.then((u) => { if (u) URL.revokeObjectURL(u); });
    }
  }
  return job;
}

/** Starts shrinking pictures before they're needed, in list order. */
export function prepareThumbs(urls: (string | null)[], width: number) {
  for (const u of urls) if (u) void thumb(u, width);
}

const preloaded = new Set<string>();
/** Fetches already-small pictures (YouTube's ~480 px thumbnails) ahead of time,
 *  so an <img> of them shows at once. They skip the shrink queue: nothing to
 *  gain from re-encoding them, and they'd hold up the article pictures. */
export function preloadImages(urls: (string | null)[]) {
  for (const u of urls) {
    if (!u || preloaded.has(u)) continue;
    preloaded.add(u);
    const img = new Image();
    img.decoding = "async";
    img.src = u;
  }
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

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 0;
const replies = new Map<number, (blob: Blob | null) => void>();

/** A worker that won't load or has crashed answers nothing: settle every
 *  pending job as failed (so cards fall back to the original picture and the
 *  queue frees up) and stop using it for the rest of the session. */
function workerDown() {
  workerFailed = true;
  worker?.terminate();
  worker = null;
  replies.forEach((reply) => reply(null));
  replies.clear();
}

function shrink(url: string, px: number): Promise<string | null> {
  if (workerFailed) return Promise.resolve(null);
  if (!worker) {
    worker = new Worker(new URL("./thumbs.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; blob: Blob | null }>) => {
      replies.get(e.data.id)?.(e.data.blob);
      replies.delete(e.data.id);
    };
    worker.onerror = workerDown;
    worker.onmessageerror = workerDown;
  }
  const id = nextId++;
  return new Promise((resolve) => {
    replies.set(id, (blob) => resolve(blob ? URL.createObjectURL(blob) : null));
    worker!.postMessage({ id, url, px });
  });
}
