import { createRequire } from "module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const news = require("../main/services/news.js") as {
  strip(html: string): string;
  videoFromEntry(e: Record<string, unknown>, source: string): { link: string; isShort: boolean; imageUrl: string }[];
  fetchVideos(): Promise<{ link: string; source: string }[]>;
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
