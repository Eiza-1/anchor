// Tech news + videos via public RSS/Atom feeds — no accounts, no tracking, no API keys.
const { XMLParser } = require("fast-xml-parser");

const FEEDS = {
  WindowsLatest: "https://www.windowslatest.com/feed/",
  "Windows Blog": "https://blogs.windows.com/feed/",
  "Windows Central": "https://www.windowscentral.com/feeds/all",
  CNET: "https://www.cnet.com/rss/news/",
  TechCrunch: "https://techcrunch.com/feed/",
  "The Verge": "https://www.theverge.com/rss/index.xml",
  Engadget: "https://www.engadget.com/rss.xml",
  "Ars Technica": "https://feeds.arstechnica.com/arstechnica/index",
  "Tom's Hardware": "https://www.tomshardware.com/feeds/all",
  Gizmodo: "https://gizmodo.com/feed",
  "9to5Google": "https://9to5google.com/feed/",
  XDA: "https://www.xda-developers.com/feed/",
};

const VIDEO_CHANNELS = {
  TechLinked: "UCeeFfhMcJa1kjtfZAGskOCA",
  Vex: "UChRFo9vcnuwvcz0DWTEaBNw",
  Mrwhosetheboss: "UCMiJRAwDNSNzuYeN2uWa0pA",
  "Marques Brownlee": "UCBJycsmduvYEL83R_U4JriQ",
  ShortCircuit: "UCdBK94H6oZT2Q7l0-b0xmMg",
  Techquickie: "UC0vBXGSyV14uvJ4hECDOl0Q",
  "LMG Clips": "UCFLFc8Lpbwt4jPtY1_Ai5yA",
  "Unbox Therapy": "UCsTcErHg8oDvUnTzoqsYeNw",
  TechCrunch: "UCCjyq_K1Xwfg8Lndy7lKMpA",
  CNET: "UCOmcA3f_RrH6b9NmcNa4tdg",
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const UA = { "User-Agent": "Anchor/0.3 (Windows optimization app; open-source)" };

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (typeof x === "object" && x != null ? x["#text"] ?? "" : x ?? "");

function strip(html) {
  const t = String(html).replace(/<[^>]*>/g, " ").replace(/&#?\w+;/g, (m) => decodeEntity(m)).replace(/\s+/g, " ").trim()
    // tails feeds tack on: "The post … appeared first on …", "[…]", "Read more", "more…"
    .replace(/\s*The post .* appeared first on .*$/i, "")
    .replace(/\s*(\[(…|\.\.\.)\]|read more|continue reading|more\s*(…|\.\.\.))\s*$/i, "")
    .trim();
  return t.length > 220 ? t.slice(0, 220).trimEnd() + "…" : t;
}
const title = (x) => String(text(x)).replace(/&#?\w+;/g, (m) => decodeEntity(m)).trim() || "(untitled)";
function decodeEntity(m) {
  const map = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
  if (map[m]) return map[m];
  const num = m.match(/&#(\d+);/); if (num) return String.fromCodePoint(+num[1]);
  const hex = m.match(/&#x([\da-f]+);/i); if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
  return " ";
}

function firstHttpsImage(...candidates) {
  for (const u of candidates) {
    // some feeds leave the &amp; / &#038; of the URL's query string encoded
    if (u && typeof u === "string" && u.startsWith("https://")) return u.replace(/&(amp|#0?38);/g, "&");
  }
  return null;
}
function imgFromHtml(html) {
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function extractImage(item, html) {
  const media = asArray(item["media:content"]).find(
    (m) => (m?.["@_medium"] ?? "image") === "image" || String(m?.["@_type"] ?? "").startsWith("image")
  );
  const thumb = asArray(item["media:thumbnail"])[0];
  const enclosure = asArray(item.enclosure).find((e) => String(e?.["@_type"] ?? "").startsWith("image"));
  return firstHttpsImage(media?.["@_url"], thumb?.["@_url"], enclosure?.["@_url"], imgFromHtml(html));
}

async function fetchFeed(source, url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
  const xml = await res.text();
  const doc = parser.parse(xml);
  const items = [];

  if (doc.feed) {
    // Atom (The Verge)
    for (const e of asArray(doc.feed.entry)) {
      const summary = text(e.summary);
      const content = text(e.content);
      const link = asArray(e.link).find((l) => l?.["@_rel"] !== "self")?.["@_href"] ?? "";
      items.push({
        title: title(e.title),
        link, source,
        published: Date.parse(e.published ?? e.updated ?? "") || 0,
        summary: strip(summary || content),
        imageUrl: extractImage(e, summary + content),
      });
    }
  } else {
    // RSS 2.0
    const ch = doc.rss?.channel;
    for (const e of asArray(ch?.item)) {
      const desc = text(e.description);
      const full = text(e["content:encoded"]);
      items.push({
        title: title(e.title),
        link: text(e.link).trim(),
        source,
        published: Date.parse(text(e.pubDate)) || 0,
        summary: strip(desc || full),
        imageUrl: extractImage(e, desc + full),
      });
    }
  }
  return items;
}

async function fetchArticles(sources) {
  const wanted = (sources ?? Object.keys(FEEDS)).filter((s) => FEEDS[s]);
  const results = await Promise.all(
    wanted.map((s) => fetchFeed(s, FEEDS[s]).catch(() => []))
  );
  return results.flat().sort((a, b) => b.published - a.published);
}

/** One YouTube feed entry → [item], or [] when it has no video id. Shorts link to /shorts/<id>. */
function videoFromEntry(e, source) {
  const vid = e["yt:videoId"];
  if (!vid) return [];
  const href = asArray(e.link).find((l) => l?.["@_rel"] === "alternate")?.["@_href"] ?? "";
  return [{
    title: title(e.title),
    link: `https://www.youtube.com/watch?v=${vid}`,
    source,
    published: Date.parse(e.published ?? "") || 0,
    summary: "",
    imageUrl: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
    isShort: href.includes("/shorts/"),
  }];
}

// A channel that fails gives null, not []. When every channel fails (YouTube's
// feed server goes down now and then), reject instead of returning an empty list,
// so the cache keeps the last good videos and the page can say what happened.
async function fetchVideos() {
  const results = await Promise.all(
    Object.entries(VIDEO_CHANNELS).map(async ([name, id]) => {
      try {
        const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {
          headers: UA, signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        const doc = parser.parse(await res.text());
        return asArray(doc.feed?.entry).flatMap((e) => videoFromEntry(e, name));
      } catch { return null; }
    })
  );
  if (results.every((r) => r === null)) throw new Error("YouTube's video feeds aren't responding");
  return results.flatMap((r) => r ?? []).sort((a, b) => b.published - a.published);
}

/// og:image backfill for articles whose feed shipped no image — reads only the
/// first 64 KB of the article page (og:image sits in <head>).
async function backfillImages(links, max = 40) {
  const targets = links.filter((l) => l.startsWith("https://")).slice(0, max);
  const out = {};
  const CONCURRENCY = 6;
  let idx = 0;
  async function worker() {
    while (idx < targets.length) {
      const link = targets[idx++];
      try {
        const res = await fetch(link, { headers: UA, signal: AbortSignal.timeout(10000) });
        const reader = res.body.getReader();
        let html = "", got = 0;
        while (got < 65536) {
          const { done, value } = await reader.read();
          if (done) break;
          got += value.length;
          html += Buffer.from(value).toString("utf8");
        }
        reader.cancel().catch(() => {});
        const m =
          html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i);
        if (m && m[1].startsWith("https://")) out[link] = m[1].replace(/&amp;/g, "&");
      } catch { /* page unreachable — card stays text-only */ }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return out;
}

/* ------------------------------ source logos ------------------------------ */
// Each source's own picture for its badge: a site's touch icon, a channel's
// YouTube avatar. Read from the sources' public pages, no API keys; the page
// remembers them for a week (Q.logos).

/** Where a site lists its icons: its homepage (Ars Technica's feed lives on a feeds. subdomain). */
const HOMEPAGES = { "Ars Technica": "https://arstechnica.com/" };
const homepage = (name) => HOMEPAGES[name] ?? `${new URL(FEEDS[name]).origin}/`;

/** Reads a page until `done(html)` is true or `max` bytes, whichever comes first. */
async function readUntil(url, headers, done, max) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok || !res.body) return { html: "", url: res.url || url };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  while (html.length < max && !done(html)) {
    const { done: end, value } = await reader.read();
    if (end) break;
    html += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return { html, url: res.url || url };
}

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];

/** The best icon a page's <head> lists: its apple-touch-icon, else its largest
 *  rel="icon", else /favicon.ico. Always https. */
function siteIcon(html, pageUrl) {
  const fallback = `${new URL(pageUrl).origin}/favicon.ico`;
  const icons = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") ?? "").toLowerCase().split(/\s+/);
    const href = attr(tag, "href");
    if (!href || !rel.some((r) => r === "icon" || r === "apple-touch-icon")) continue;
    let url;
    try { url = new URL(href.replace(/&amp;/g, "&"), pageUrl).href; } catch { continue; }
    if (!url.startsWith("https://")) continue;
    // a touch icon is 180 px unless it says otherwise; a plain icon with no size is the small one
    const size = parseInt(attr(tag, "sizes") ?? "", 10) || (rel.includes("apple-touch-icon") ? 180 : 16);
    icons.push({ url, size, touch: rel.includes("apple-touch-icon") });
  }
  icons.sort((a, b) => Number(b.touch) - Number(a.touch) || b.size - a.size);
  return icons[0]?.url ?? fallback;
}

const OG_IMAGE = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i;

/** A channel page's avatar (its og:image), as an 88 px copy; null when the page has none. */
function channelAvatar(html) {
  const url = html.match(OG_IMAGE)?.[1];
  if (!url?.startsWith("https://")) return null;
  return url.replace(/&amp;/g, "&").replace(/=s\d+-/, "=s88-");
}

// YouTube's channel pages are ~3 MB and the avatar sits ~800 KB in, so reading
// stops as soon as it's found. The cookie skips the EU consent page.
const YT_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", Cookie: "SOCS=CAI" };

/** { articles: { name: iconUrl }, videos: { name: avatarUrl } }; a source that can't be read is left out. */
async function fetchLogos() {
  const out = { articles: {}, videos: {} };
  await Promise.all([
    ...Object.keys(FEEDS).map(async (name) => {
      try {
        const page = await readUntil(homepage(name), UA, (h) => /<\/head>/i.test(h), 512 * 1024);
        out.articles[name] = siteIcon(page.html, page.url);
      } catch { /* unreachable: the badge keeps its letter */ }
    }),
    ...Object.entries(VIDEO_CHANNELS).map(async ([name, id]) => {
      try {
        const page = await readUntil(`https://www.youtube.com/channel/${id}`, YT_HEADERS, (h) => OG_IMAGE.test(h), 2 * 1024 * 1024);
        const avatar = channelAvatar(page.html);
        if (avatar) out.videos[name] = avatar;
      } catch { /* unreachable: the badge keeps its letter */ }
    }),
  ]);
  return out;
}

module.exports = {
  FEEDS, VIDEO_CHANNELS, fetchArticles, fetchVideos, backfillImages, fetchLogos, strip, videoFromEntry, siteIcon, channelAvatar,
};
