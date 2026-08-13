using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace Anchor.Services;

public record AppUpdateInfo(bool Available, string LatestVersion, string ReleaseUrl, string? InstallerUrl, string Notes);

/// <summary>Checks GitHub Releases for a newer version of Anchor. Transparent by design:
/// one anonymous GET to the public GitHub API, no telemetry, nothing sent about the user.
/// To ship an update: bump &lt;Version&gt; in Anchor.csproj, run build + package, then create
/// a GitHub release tagged v0.2.0 (etc.) with the installers attached.</summary>
public static class AppUpdateService
{
    // TODO: set these once the repo is created.
    public const string RepoOwner = "Eiza-1";
    public const string RepoName = "anchor";

    public static bool IsConfigured => !RepoOwner.StartsWith("YOUR_");

    public static string CurrentVersion =>
        Assembly.GetExecutingAssembly().GetName().Version is { } v ? $"{v.Major}.{v.Minor}.{v.Build}" : "0.0.0";

    private static readonly HttpClient Http = CreateClient();
    private static HttpClient CreateClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        c.DefaultRequestHeaders.UserAgent.ParseAdd("Anchor-Update-Check");
        c.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        return c;
    }

    public static async Task<AppUpdateInfo?> CheckAsync()
    {
        if (!IsConfigured) return null;
        try
        {
            var json = await Http.GetStringAsync(
                $"https://api.github.com/repos/{RepoOwner}/{RepoName}/releases/latest");
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            string tag = root.GetProperty("tag_name").GetString() ?? "";
            string releaseUrl = root.GetProperty("html_url").GetString() ?? "";
            string notes = root.TryGetProperty("body", out var b) ? b.GetString() ?? "" : "";

            if (!Version.TryParse(tag.TrimStart('v', 'V'), out var latest)) return null;
            var current = Version.Parse(CurrentVersion);
            if (latest <= current)
                return new AppUpdateInfo(false, latest.ToString(), releaseUrl, null, "");

            // Pick the installer asset matching this PC's architecture.
            string arch = RuntimeInformation.OSArchitecture == Architecture.Arm64 ? "arm64" : "x64";
            string? installerUrl = null;
            if (root.TryGetProperty("assets", out var assets))
            {
                foreach (var a in assets.EnumerateArray())
                {
                    string name = a.GetProperty("name").GetString() ?? "";
                    if (name.Contains("Setup", StringComparison.OrdinalIgnoreCase) &&
                        name.Contains(arch, StringComparison.OrdinalIgnoreCase))
                    {
                        installerUrl = a.GetProperty("browser_download_url").GetString();
                        break;
                    }
                }
            }
            string shortNotes = notes.Length > 300 ? notes[..300] + "…" : notes;
            return new AppUpdateInfo(true, latest.ToString(), releaseUrl, installerUrl, shortNotes);
        }
        catch { return null; } // offline / rate-limited — never bother the user about it
    }
}
