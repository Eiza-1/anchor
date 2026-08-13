using System.Xml.Linq;

namespace Anchor.Services;

public record NewsItem(string Title, string Link, string Source, DateTime Published, string Summary);

/// <summary>Fetches tech news via public RSS/Atom feeds — no accounts, no tracking, no API keys.</summary>
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

    /// <summary>Sources used by the Windows Update tab for article previews.</summary>
    public static readonly string[] WindowsSources = { "WindowsLatest", "Windows Blog", "Windows Central" };

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
            XNamespace a = "http://www.w3.org/2005/Atom";
            foreach (var e in doc.Root.Elements(a + "entry"))
            {
                items.Add(new NewsItem(
                    e.Element(a + "title")?.Value.Trim() ?? "(untitled)",
                    e.Elements(a + "link").FirstOrDefault(l => (string?)l.Attribute("rel") != "self")?.Attribute("href")?.Value ?? "",
                    source,
                    ParseDate(e.Element(a + "published")?.Value ?? e.Element(a + "updated")?.Value),
                    Strip(e.Element(a + "summary")?.Value ?? e.Element(a + "content")?.Value ?? "")));
            }
        }
        else // RSS 2.0
        {
            foreach (var e in doc.Descendants("item"))
            {
                items.Add(new NewsItem(
                    e.Element("title")?.Value.Trim() ?? "(untitled)",
                    e.Element("link")?.Value.Trim() ?? "",
                    source,
                    ParseDate(e.Element("pubDate")?.Value),
                    Strip(e.Element("description")?.Value ?? "")));
            }
        }
        return items;
    }

    private static DateTime ParseDate(string? s) =>
        DateTime.TryParse(s, out var d) ? d : DateTime.MinValue;

    private static string Strip(string html)
    {
        var text = System.Text.RegularExpressions.Regex.Replace(html, "<.*?>", " ");
        text = System.Net.WebUtility.HtmlDecode(text).Trim();
        return text.Length > 220 ? text[..220] + "…" : text;
    }

    public static void OpenInBrowser(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == "https" || u.Scheme == "http"))
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
    }
}
