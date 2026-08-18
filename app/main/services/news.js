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

const WINDOWS_SOURCES = ["WindowsLatest", "Windows Blog", "Windows Central"];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const UA = { "User-Agent": "Anchor/0.3 (Windows optimization app; open-source)" };

const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const text = (x) => (typeof x === "object" && x != null ? x["#text"] ?? "" : x ?? "");

function strip(html) {
  const t = String(html).replace(/<[^>]*>/g, " ").replace(/&#?\w+;/g, (m) => decodeEntity(m)).replace(/\s+/g, " ").trim();
  return t.length > 220 ? t.slice(0, 220) + "…" : t;
}
function decodeEntity(m) {
  const map = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
  if (map[m]) return map[m];
  const num = m.match(/&#(\d+);/); if (num) return String.fromCodePoint(+num[1]);
  const hex = m.match(/&#x([\da-f]+);/i); if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
  return " ";
}

function firstHttpsImage(...candidates) {
  for (const u of candidates) {
    if (u && typeof u === "string" && u.startsWith("https://")) return u;
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
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
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
        title: text(e.title).trim() || "(untitled)",
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
        title: text(e.title).trim() || "(untitled)",
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

async function fetchVideos() {
  const results = await Promise.all(
    Object.entries(VIDEO_CHANNELS).map(async ([name, id]) => {
      try {
        const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, {
          headers: UA, signal: AbortSignal.timeout(15000),
        });
        const doc = parser.parse(await res.text());
        return asArray(doc.feed?.entry).flatMap((e) => {
          const vid = e["yt:videoId"];
          if (!vid) return [];
          return [{
            title: text(e.title).trim() || "(untitled)",
            link: `https://www.youtube.com/watch?v=${vid}`,
            source: name,
            published: Date.parse(e.published ?? "") || 0,
            summary: "",
            imageUrl: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
          }];
        });
      } catch { return []; }
    })
  );
  return results.flat().sort((a, b) => b.published - a.published);
}

async function fetchWindowsUpdateNews() {
  const kw = ["update", "kb5", "build", "patch", "cumulative", "24h2", "25h2", "26h2", "security"];
  const all = await fetchArticles(WINDOWS_SOURCES);
  return all.filter((i) => kw.some((k) => i.title.toLowerCase().includes(k)));
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

module.exports = { FEEDS, VIDEO_CHANNELS, fetchArticles, fetchVideos, fetchWindowsUpdateNews, backfillImages };
