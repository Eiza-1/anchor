using System.Xml.Linq;

namespace Anchor.Services;

public record NewsItem(string Title, string Link, string Source, DateTime Published, string Summary, string? ImageUrl = null)
{
    public bool HasImage => !string.IsNullOrWhiteSpace(ImageUrl);
    public string Meta => Published == DateTime.MinValue ? Source : $"{Source} · {Published:MMM d}";
}

/// <summary>Fetches tech news and videos via public RSS/Atom feeds — no accounts, no
/// tracking, no API keys. Videos come from the sources' official YouTube feeds.</summary>
public static class NewsService
{
    public static readonly Dictionary<string, string> Feeds = new()
    {
        ["WindowsLatest"] = "https://www.windowslatest.com/feed/",
        ["Windows Blog"] = "https://blogs.windows.com/feed/",
        ["Windows Central"] = "https://www.windowscentral.com/feeds/all",
        ["CNET"] = "https://www.cnet.com/rss/news/",
        ["TechCrunch"] = "https://techcrunch.com/feed/",
        ["The Verge"] = "https://www.theverge.com/rss/index.xml",
    };

    /// <summary>Official YouTube channels for the video section (channel-ID feeds need no API key).</summary>
    public static readonly Dictionary<string, string> VideoChannels = new()
    {
        ["The Verge"] = "UCddiUEpeqJcYeBxX1IVBKvQ",
        ["CNET"] = "UCOmcA3f_RrH6b9NmcNa4tdg",
        ["TechCrunch"] = "UCCjyq_K1Xwfg8Lndy7lKMpA",
    };

    /// <summary>Sources used by the Windows Update tab for article previews.</summary>
    public static readonly string[] WindowsSources = { "WindowsLatest", "Windows Blog", "Windows Central" };

    private static readonly XNamespace Atom = "http://www.w3.org/2005/Atom";
    private static readonly XNamespace Media = "http://search.yahoo.com/mrss/";
    private static readonly XNamespace Yt = "http://www.youtube.com/xml/schemas/2015";

    private static readonly HttpClient Http = CreateClient();
    private static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        c.DefaultRequestHeaders.UserAgent.ParseAdd("Anchor/0.1 (Windows optimization app; open-source)");
        return c;
    }

    public static async Task<List<NewsItem>> FetchAsync(IEnumerable<string>? sources = null)
    {
        var wanted = (sources ?? Feeds.Keys).Where(Feeds.ContainsKey).ToList();
        var tasks = wanted.Select(async s =>
        {
            try { return await FetchFeedAsync(s, Feeds[s]); }
            catch { return new List<NewsItem>(); }
        });
        var results = await Task.WhenAll(tasks);
        return results.SelectMany(r => r).OrderByDescending(i => i.Published).ToList();
    }

    /// <summary>Latest videos from the sources' YouTube channels, thumbnails included.</summary>
    public static async Task<List<NewsItem>> FetchVideosAsync()
    {
        var tasks = VideoChannels.Select(async kv =>
        {
            try
            {
                var xml = await Http.GetStringAsync(
                    $"https://www.youtube.com/feeds/videos.xml?channel_id={kv.Value}");
                var doc = XDocument.Parse(xml);
                var list = new List<NewsItem>();
                foreach (var e in doc.Root!.Elements(Atom + "entry"))
                {
                    string id = e.Element(Yt + "videoId")?.Value ?? "";
                    if (id.Length == 0) continue;
                    list.Add(new NewsItem(
                        e.Element(Atom + "title")?.Value.Trim() ?? "(untitled)",
                        $"https://www.youtube.com/watch?v={id}",
                        kv.Key,
                        ParseDate(e.Element(Atom + "published")?.Value),
                        "",
                        $"https://i.ytimg.com/vi/{id}/mqdefault.jpg"));
                }
                return list;
            }
            catch { return new List<NewsItem>(); }
        });
        var results = await Task.WhenAll(tasks);
        return results.SelectMany(r => r).OrderByDescending(i => i.Published).ToList();
    }

    /// <summary>Windows Update related articles only (for the Updates page preview tab).</summary>
    public static async Task<List<NewsItem>> FetchWindowsUpdateNewsAsync()
    {
        string[] kw = { "update", "kb5", "build", "patch", "cumulative", "24h2", "25h2", "26h2", "security" };
        var all = await FetchAsync(WindowsSources);
        return all.Where(i => kw.Any(k => i.Title.Contains(k, StringComparison.OrdinalIgnoreCase))).ToList();
    }

    private static async Task<List<NewsItem>> FetchFeedAsync(string source, string url)
    {
        var xml = await Http.GetStringAsync(url);
        var doc = XDocument.Parse(xml);
        var items = new List<NewsItem>();

        if (doc.Root?.Name.LocalName == "feed") // Atom (The Verge)
        {
            foreach (var e in doc.Root.Elements(Atom + "entry"))
            {
                string html = e.Element(Atom + "summary")?.Value ?? e.Element(Atom + "content")?.Value ?? "";
                items.Add(new NewsItem(
                    e.Element(Atom + "title")?.Value.Trim() ?? "(untitled)",
                    e.Elements(Atom + "link").FirstOrDefault(l => (string?)l.Attribute("rel") != "self")?.Attribute("href")?.Value ?? "",
                    source,
                    ParseDate(e.Element(Atom + "published")?.Value ?? e.Element(Atom + "updated")?.Value),
                    Strip(html),
                    ExtractImage(e, html)));
            }
        }
        else // RSS 2.0
        {
            foreach (var e in doc.Descendants("item"))
            {
                string html = e.Element("description")?.Value ?? "";
                items.Add(new NewsItem(
                    e.Element("title")?.Value.Trim() ?? "(untitled)",
                    e.Element("link")?.Value.Trim() ?? "",
                    source,
                    ParseDate(e.Element("pubDate")?.Value),
                    Strip(html),
                    ExtractImage(e, html)));
            }
        }
        return items;
    }

    /// <summary>Finds a preview image: media:content / media:thumbnail / enclosure,
    /// falling back to the first &lt;img&gt; inside the article HTML.</summary>
    private static string? ExtractImage(XElement item, string html)
    {
        string? FromAttr(XElement? el) => el?.Attribute("url")?.Value;

        var candidates = new List<string?>
        {
            FromAttr(item.Descendants(Media + "content")
                .FirstOrDefault(m => (m.Attribute("medium")?.Value ?? "image") == "image"
                                  || (m.Attribute("type")?.Value ?? "").StartsWith("image"))),
            FromAttr(item.Descendants(Media + "thumbnail").FirstOrDefault()),
            item.Elements("enclosure")
                .FirstOrDefault(en => (en.Attribute("type")?.Value ?? "").StartsWith("image"))
                ?.Attribute("url")?.Value,
        };

        var m = System.Text.RegularExpressions.Regex.Match(html,
            "<img[^>]+src=[\"']([^\"']+)[\"']", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        if (m.Success) candidates.Add(m.Groups[1].Value);

        return candidates.FirstOrDefault(u =>
            !string.IsNullOrWhiteSpace(u) && Uri.TryCreate(u, UriKind.Absolute, out var uri) && uri.Scheme == "https");
    }

    private static DateTime ParseDate(string? s) =>
        DateTime.TryParse(s, out var d) ? d : DateTime.MinValue;

    private static string Strip(string html)
    {
        var text = System.Text.RegularExpressions.Regex.Replace(html, "<.*?>", " ");
        text = System.Net.WebUtility.HtmlDecode(text).Trim();
        text = System.Text.RegularExpressions.Regex.Replace(text, @"\s+", " ");
        return text.Length > 220 ? text[..220] + "…" : text;
    }

    public static void OpenInBrowser(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == "https" || u.Scheme == "http"))
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
    }
}
