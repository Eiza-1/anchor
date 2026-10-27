import { createRequire } from "module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const news = require("../main/services/news.js") as {
  strip(html: string): string;
  videoFromEntry(e: Record<string, unknown>, source: string): { link: string; isShort: boolean; imageUrl: string }[];
  fetchVideos(): Promise<{ link: string; source: string }[]>;
  fetchArticles(sources?: string[]): Promise<Record<string, unknown>[]>;
  VIDEO_CHANNELS: Record<string, string>;
};

describe("strip", () => {
  it("drops the 'more…' tail feeds append", () => {
    expect(news.strip("<p>The value of LineageOS 24 certainly has. more…</p>")).toBe("The value of LineageOS 24 certainly has.");
    expect(news.strip("Head below for a closer look. more...")).toBe("Head below for a closer look.");
  });

  it("drops '[…]', 'Read more' and 'The post … appeared first on …'", () => {
    expect(news.strip("Something happened [&#8230;]")).toBe("Something happened");
    expect(news.strip("Something happened. Read more")).toBe("Something happened.");
    expect(news.strip("Body text. The post Foo appeared first on Windows Latest.")).toBe("Body text.");
  });

  it("keeps a sentence that merely ends with the word 'more'", () => {
    expect(news.strip("Prices are going up once more")).toBe("Prices are going up once more");
  });

  it("still caps long summaries with a single ellipsis", () => {
    const out = news.strip("word ".repeat(100));
    expect(out.length).toBeLessThanOrEqual(221);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("videoFromEntry", () => {
  const entry = (href: string) => ({
    "yt:videoId": "abc123",
    title: "A video",
    published: "2026-10-22T10:00:00Z",
    link: { "@_rel": "alternate", "@_href": href },
  });

  it("flags Shorts from their /shorts/ link", () => {
    const [v] = news.videoFromEntry(entry("https://www.youtube.com/shorts/abc123"), "MKBHD");
    expect(v.isShort).toBe(true);
    expect(v.link).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("treats watch links as regular videos", () => {
    const [v] = news.videoFromEntry(entry("https://www.youtube.com/watch?v=abc123"), "MKBHD");
    expect(v.isShort).toBe(false);
    expect(v.imageUrl).toBe("https://i.ytimg.com/vi/abc123/mqdefault.jpg");
  });

  it("skips entries without a video id", () => {
    expect(news.videoFromEntry({ title: "x" }, "MKBHD")).toEqual([]);
  });
});

describe("fetchVideos", () => {
  afterEach(() => vi.unstubAllGlobals());

  const feed = (id: string) =>
    `<feed><entry><yt:videoId>${id}</yt:videoId><title>Clip</title><published>2026-10-20T10:00:00Z</published>` +
    `<link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/></entry></feed>`;

  it("rejects when YouTube answers every channel with an error page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><title>Error 404</title>", { status: 404 })));
    await expect(news.fetchVideos()).rejects.toThrow(/YouTube/);
  });

  it("keeps the channels that answered when others fail", async () => {
    const [firstId] = Object.values(news.VIDEO_CHANNELS);
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes(firstId) ? new Response(feed("abc123"), { status: 200 }) : new Response("", { status: 500 })));
    const videos = await news.fetchVideos();
    expect(videos.map((v) => v.link)).toEqual(["https://www.youtube.com/watch?v=abc123"]);
  });
});

// Real feed text through XMLParser, so a fast-xml-parser upgrade is covered end to end.
describe("feed parsing", () => {
  afterEach(() => vi.unstubAllGlobals());
  const serve = (xml: string) => vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200 })));

  it("maps an RSS 2.0 item", async () => {
    serve(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel><title>WL</title>
    <item>
      <title>Windows 11 &amp; the &#8216;new&#8217; Start menu</title>
      <link>
        https://www.windowslatest.com/2026/10/20/start/
      </link>
      <pubDate>Tue, 20 Oct 2026 10:00:00 +0000</pubDate>
      <description><![CDATA[<p>Microsoft is testing a <b>new</b> Start menu.</p> The post Start appeared first on WL.]]></description>
      <enclosure url="https://img.windowslatest.com/start.jpg?w=800&amp;h=450" type="image/jpeg" length="1234"/>
    </item>
  </channel>
</rss>`);
    expect(await news.fetchArticles(["WindowsLatest"])).toEqual([{
      title: "Windows 11 & the ‘new’ Start menu",
      link: "https://www.windowslatest.com/2026/10/20/start/",
      source: "WindowsLatest",
      published: Date.parse("2026-10-20T10:00:00Z"),
      summary: "Microsoft is testing a new Start menu.",
      imageUrl: "https://img.windowslatest.com/start.jpg?w=800&h=450",
    }]);
  });

  it("maps an Atom entry", async () => {
    serve(`<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Verge</title>
  <entry>
    <title type="html">Valve&#8217;s new handheld</title>
    <link rel="self" href="https://www.theverge.com/feed/1"/>
    <link rel="alternate" type="text/html" href="https://www.theverge.com/2026/10/21/handheld"/>
    <published>2026-10-21T08:30:00-04:00</published>
    <updated>2026-10-21T09:00:00-04:00</updated>
    <summary type="html">&lt;p&gt;It runs SteamOS.&lt;/p&gt;</summary>
    <content type="html">&lt;figure&gt;&lt;img src="https://cdn.vox-cdn.com/handheld.jpg" /&gt;&lt;/figure&gt;&lt;p&gt;Full story.&lt;/p&gt;</content>
  </entry>
</feed>`);
    expect(await news.fetchArticles(["The Verge"])).toEqual([{
      title: "Valve’s new handheld",
      link: "https://www.theverge.com/2026/10/21/handheld",
      source: "The Verge",
      published: Date.parse("2026-10-21T12:30:00Z"),
      summary: "It runs SteamOS.",
      imageUrl: "https://cdn.vox-cdn.com/handheld.jpg",
    }]);
  });

  it("maps a YouTube Atom entry", async () => {
    const [firstName, firstId] = Object.entries(news.VIDEO_CHANNELS)[0];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <title>${firstName}</title>
  <entry>
    <id>yt:video:dQw4w9WgXcQ</id>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <yt:channelId>${firstId}</yt:channelId>
    <title>Tech &amp; Tips #42</title>
    <link rel="alternate" href="https://www.youtube.com/shorts/dQw4w9WgXcQ"/>
    <published>2026-10-22T15:00:00+00:00</published>
    <media:group><media:thumbnail url="https://i1.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/></media:group>
  </entry>
</feed>`;
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes(firstId) ? new Response(xml, { status: 200 }) : new Response("", { status: 500 })));
    expect(await news.fetchVideos()).toEqual([{
      title: "Tech & Tips #42",
      link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      source: firstName,
      published: Date.parse("2026-10-22T15:00:00Z"),
      summary: "",
      imageUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      isShort: true,
    }]);
  });
});
