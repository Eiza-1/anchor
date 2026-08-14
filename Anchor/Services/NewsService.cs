using System.Xml.Linq;

namespace Anchor.Services;

public class NewsItem : System.ComponentModel.INotifyPropertyChanged
{
    public NewsItem(string title, string link, string source, DateTime published, string summary, string? imageUrl = null)
    { Title = title; Link = link; Source = source; Published = published; Summary = summary; _imageUrl = imageUrl; }

    public string Title { get; }
    public string Link { get; }
    public string Source { get; }
    public DateTime Published { get; }
    public string Summary { get; }

    private string? _imageUrl;
    public string? ImageUrl
    {
        get => _imageUrl;
        set
        {
            _imageUrl = value;
            PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(nameof(ImageUrl)));
            PropertyChanged?.Invoke(this, new System.ComponentModel.PropertyChangedEventArgs(nameof(HasImage)));
        }
    }

    public bool HasImage => !string.IsNullOrWhiteSpace(ImageUrl);
    public string Meta => Published == DateTime.MinValue ? Source : $"{Source} · {Published:MMM d}";

    public event System.ComponentModel.PropertyChangedEventHandler? PropertyChanged;
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
        ["Engadget"] = "https://www.engadget.com/rss.xml",
        ["Ars Technica"] = "https://feeds.arstechnica.com/arstechnica/index",
        ["Tom's Hardware"] = "https://www.tomshardware.com/feeds/all",
        ["Gizmodo"] = "https://gizmodo.com/feed",
        ["9to5Google"] = "https://9to5google.com/feed/",
        ["XDA"] = "https://www.xda-developers.com/feed/",
    };

    /// <summary>Official YouTube channels for the video section (channel-ID feeds need no API key).</summary>
    public static readonly Dictionary<string, string> VideoChannels = new()
    {
        ["TechLinked"] = "UCeeFfhMcJa1kjtfZAGskOCA",
        ["Vex"] = "UChRFo9vcnuwvcz0DWTEaBNw",
        ["Mrwhosetheboss"] = "UCMiJRAwDNSNzuYeN2uWa0pA",
        ["Marques Brownlee"] = "UCBJycsmduvYEL83R_U4JriQ",
        ["ShortCircuit"] = "UCdBK94H6oZT2Q7l0-b0xmMg",
        ["Techquickie"] = "UC0vBXGSyV14uvJ4hECDOl0Q",
        ["LMG Clips"] = "UCFLFc8Lpbwt4jPtY1_Ai5yA",
        ["Unbox Therapy"] = "UCsTcErHg8oDvUnTzoqsYeNw",
        ["TechCrunch"] = "UCCjyq_K1Xwfg8Lndy7lKMpA",
        ["CNET"] = "UCOmcA3f_RrH6b9NmcNa4tdg",
    };

    /// <summary>Sources used by the Windows Update tab for article previews.</summary>
    public static readonly string[] WindowsSources = { "WindowsLatest", "Windows Blog", "Windows Central" };

    private static readonly XNamespace Atom = "http://www.w3.org/2005/Atom";
    private static readonly XNamespace Media = "http://search.yahoo.com/mrss/";
    private static readonly XNamespace Yt = "http://www.youtube.com/xml/schemas/2015";
    private static readonly XNamespace ContentNs = "http://purl.org/rss/1.0/modules/content/";

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
                string summary = e.Element(Atom + "summary")?.Value ?? "";
                string content = e.Element(Atom + "content")?.Value ?? "";
                items.Add(new NewsItem(
                    e.Element(Atom + "title")?.Value.Trim() ?? "(untitled)",
                    e.Elements(Atom + "link").FirstOrDefault(l => (string?)l.Attribute("rel") != "self")?.Attribute("href")?.Value ?? "",
                    source,
                    ParseDate(e.Element(Atom + "published")?.Value ?? e.Element(Atom + "updated")?.Value),
                    Strip(summary.Length > 0 ? summary : content),
                    ExtractImage(e, summary + content))); // image usually lives in content, not summary
            }
        }
        else // RSS 2.0
        {
            foreach (var e in doc.Descendants("item"))
            {
                string desc = e.Element("description")?.Value ?? "";
                // Most feeds (TechCrunch, WindowsLatest…) put images in content:encoded, not description.
                string fullHtml = e.Element(ContentNs + "encoded")?.Value ?? "";
                items.Add(new NewsItem(
                    e.Element("title")?.Value.Trim() ?? "(untitled)",
                    e.Element("link")?.Value.Trim() ?? "",
                    source,
                    ParseDate(e.Element("pubDate")?.Value),
                    Strip(desc.Length > 0 ? desc : fullHtml),
                    ExtractImage(e, desc + fullHtml)));
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

    /// <summary>For articles whose feed carries no image (TechCrunch etc.): fetches just the
    /// head of the article page and reads its og:image tag — the same image the site
    /// advertises for link previews. Call from the UI thread; items update in place.</summary>
    public static async Task FillMissingImagesAsync(IEnumerable<NewsItem> items, int maxFetches = 30)
    {
        var targets = items.Where(i => !i.HasImage && i.Link.StartsWith("https://")).Take(maxFetches).ToList();
        if (targets.Count == 0) return;
        var sem = new SemaphoreSlim(6); // polite: max 6 concurrent fetches
        var tasks = targets.Select(async item =>
        {
            await sem.WaitAsync();
            try
            {
                using var resp = await Http.GetAsync(item.Link, HttpCompletionOption.ResponseHeadersRead);
                if (!resp.IsSuccessStatusCode) return;
                using var stream = await resp.Content.ReadAsStreamAsync();
                var buf = new byte[65536]; // og:image sits in <head>; first 64 KB is plenty
                int total = 0, n;
                while (total < buf.Length &&
                       (n = await stream.ReadAsync(buf.AsMemory(total, buf.Length - total))) > 0) total += n;
                var head = System.Text.Encoding.UTF8.GetString(buf, 0, total);

                var m = System.Text.RegularExpressions.Regex.Match(head,
                    "<meta[^>]+(?:property|name)=[\"']og:image[\"'][^>]*content=[\"']([^\"']+)[\"']",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                if (!m.Success)
                    m = System.Text.RegularExpressions.Regex.Match(head,
                        "<meta[^>]+content=[\"']([^\"']+)[\"'][^>]*(?:property|name)=[\"']og:image[\"']",
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase);

                if (m.Success)
                {
                    var url = System.Net.WebUtility.HtmlDecode(m.Groups[1].Value);
                    if (Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == "https")
                        item.ImageUrl = u.ToString();
                }
            }
            catch { /* article page unreachable — card just stays text-only */ }
            finally { sem.Release(); }
        });
        await Task.WhenAll(tasks);
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
