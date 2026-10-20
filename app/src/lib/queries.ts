// Every page's data, in one place: the cache key, how long it stays fresh, and
// how to fetch it. Pages and the launch-time prefetch both go through here, so
// a tab opened right after launch usually finds its data already loaded.
import { cached } from "@/lib/store";
import type { NewsItem } from "@/types";

const MIN = 60_000;
type Api = typeof window.anchor;
type Data<K extends keyof Api> = Api[K] extends (...a: never[]) => Promise<infer R> ? R : never;

const q = <K extends keyof Api>(key: string, ttl: number, method: K) =>
  () => cached(key, ttl, () => (window.anchor[method] as () => Promise<Data<K>>)());

export const Q = {
  cleanupScan: q("cleanup:scan", 5 * MIN, "cleanupScan"),
  startup: q("startup", 5 * MIN, "startupList"),
  bootScan: q("boot:scan", 10 * MIN, "bootScan"),
  bloatware: q("bloatware", 10 * MIN, "bloatwareList"),
  privacy: q("privacy", 10 * MIN, "privacyList"),
  perfTweaks: q("perf:tweaks", 5 * MIN, "perfList"),
  powerPlan: q("perf:power", 5 * MIN, "powerPlan"),
  gpuPrefs: q("perf:gpuPrefs", 5 * MIN, "gpuPrefs"),
  gpuInfo: q("perf:gpuInfo", 30 * MIN, "gpuInfo"),
  pcie: q("perf:pcie", 5 * MIN, "pcieState"),
  cpuInfo: q("cpu:info", Infinity, "cpuInfo"),
  drives: q("drives", 5 * MIN, "driveHealth"),
  volumes: q("volumes", 5 * MIN, "volumes"),
  buildInfo: q("build", 60 * MIN, "buildInfo"),
  diagState: q("diag:state", MIN, "diagState"),
  diagErrors: () => cached("diag:errors", 10 * MIN, () => window.anchor.diagErrors(7)),
  diagRepairs: q("diag:repairs", Infinity, "diagRepairs"),
  lastRestorePoint: q("restore:last", 10 * MIN, "lastRestorePoint"),
  feeds: q("news:feeds", Infinity, "feeds"),
  videos: q("news:videos", 10 * MIN, "videos"),
  releases: q("games:releases", 24 * 60 * MIN, "gameReleases"),
  freeGames: q("games:free", 6 * 60 * MIN, "freeGames"),
};

/* ------------------------------- Articles -------------------------------- *
 * Each feed is requested separately and the list is shown as feeds arrive,
 * instead of waiting for the slowest of twelve. Thumbnails missing from a
 * feed are looked up once per article and remembered across launches.       */
const IMAGES_KEY = "anchor:news-images";

function loadImages(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(IMAGES_KEY) ?? "{}"); } catch { return {}; }
}
function saveImages(map: Record<string, string>) {
  const entries = Object.entries(map).slice(-600); // keep it bounded
  try { localStorage.setItem(IMAGES_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* ignore */ }
}

// Pages listening for partial lists. A page that opens while the launch
// prefetch is already loading still gets the next feeds as they land.
const partialListeners = new Set<(list: NewsItem[]) => void>();

export function articles(onPartial?: (list: NewsItem[]) => void) {
  if (onPartial) partialListeners.add(onPartial);
  const done = cached("news:articles", 10 * MIN, async () => {
    const { articles: sources } = await Q.feeds();
    const images = loadImages();
    let merged: NewsItem[] = [];
    await Promise.all(
      sources.map(async (s) => {
        const items = await window.anchor.articles([s]).catch(() => [] as NewsItem[]);
        merged = [...merged, ...items.map((x) => (x.imageUrl || !images[x.link] ? x : { ...x, imageUrl: images[x.link] }))]
          .sort((a, b) => b.published - a.published);
        partialListeners.forEach((l) => l(merged));
      })
    );
    // "" marks an article already checked with no image, so it isn't fetched again
    const missing = merged
      .filter((x) => !x.imageUrl && !(x.link in images) && x.link.startsWith("https://"))
      .map((x) => x.link)
      .slice(0, 40);
    if (missing.length) {
      const found = await window.anchor.backfillImages(missing).catch(() => ({} as Record<string, string>));
      for (const link of missing) images[link] = found[link] ?? "";
      saveImages(images);
      merged = merged.map((x) => (x.imageUrl || !images[x.link] ? x : { ...x, imageUrl: images[x.link] }));
    }
    return merged;
  });
  if (onPartial) done.finally(() => partialListeners.delete(onPartial)).catch(() => {});
  return done;
}

const WINDOWS_SOURCES = ["WindowsLatest", "Windows Blog", "Windows Central"];
const UPDATE_WORDS = ["update", "kb5", "build", "patch", "cumulative", "24h2", "25h2", "26h2", "security"];

/** Windows-update stories, taken from the same article list Spotlight uses. */
export const windowsNews = (list: NewsItem[]) =>
  list.filter(
    (i) => WINDOWS_SOURCES.includes(i.source) && UPDATE_WORDS.some((w) => i.title.toLowerCase().includes(w))
  );

/* ------------------------------- Prefetch -------------------------------- */
/** Loads the main tabs in the background shortly after launch. Each request
 *  is a no-op if that data is already fresh. Failures are ignored here — the
 *  page shows its own state when it's opened. */
export function prefetch() {
  const jobs = [
    Q.perfTweaks, Q.powerPlan, Q.pcie, Q.gpuPrefs, Q.gpuInfo,
    Q.startup, Q.drives, Q.volumes, Q.buildInfo, Q.cleanupScan,
    () => articles(), Q.videos, Q.releases, Q.freeGames,
  ];
  for (const job of jobs) job().catch(() => {});
}
