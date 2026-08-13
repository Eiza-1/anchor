using System.Text.Json;

namespace Anchor.Services;

public class UserProfile
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Provider { get; set; } = "Local"; // Local, Google, Apple, GitHub, Facebook
    public bool MailWindowsUpdates { get; set; } = true;
    public bool MailSystemHealth { get; set; } = true;
    public bool MailTechNews { get; set; }
    public bool MailAnchorUpdates { get; set; } = true;
}

/// <summary>Local-first profile: your name/email live in a JSON file on YOUR machine
/// (%LOCALAPPDATA%\Anchor\profile.json) — nothing is uploaded. OAuth providers are
/// wired but ship with placeholder keys; see docs/OAUTH_SETUP.md to enable them.</summary>
public static class ProfileService
{
    private static readonly string PathFile = System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Anchor", "profile.json");

    public static UserProfile Load()
    {
        try
        {
            if (File.Exists(PathFile))
                return JsonSerializer.Deserialize<UserProfile>(File.ReadAllText(PathFile)) ?? new UserProfile();
        }
        catch { }
        return new UserProfile();
    }

    public static void Save(UserProfile p)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(PathFile)!);
        File.WriteAllText(PathFile, JsonSerializer.Serialize(p, new JsonSerializerOptions { WriteIndented = true }));
    }

    public static string Greeting(UserProfile p)
    {
        var h = DateTime.Now.Hour;
        string time = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
        return string.IsNullOrWhiteSpace(p.Name) ? $"{time}! Welcome to Anchor." : $"{time}, {p.Name}!";
    }

    // ---- OAuth (stubbed) -------------------------------------------------
    // Replace with your registered app credentials; see docs/OAUTH_SETUP.md.
    private static readonly Dictionary<string, string> OAuthUrls = new()
    {
        ["Google"] = "https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_GOOGLE_CLIENT_ID&redirect_uri=http://localhost:53682/callback&response_type=code&scope=openid%20email%20profile",
        ["GitHub"] = "https://github.com/login/oauth/authorize?client_id=YOUR_GITHUB_CLIENT_ID&scope=read:user%20user:email",
        ["Apple"] = "https://appleid.apple.com/auth/authorize?client_id=YOUR_APPLE_SERVICE_ID&redirect_uri=http://localhost:53682/callback&response_type=code&scope=name%20email",
        ["Facebook"] = "https://www.facebook.com/v19.0/dialog/oauth?client_id=YOUR_FACEBOOK_APP_ID&redirect_uri=http://localhost:53682/callback&scope=email",
    };

    public static bool IsOAuthConfigured(string provider) =>
        OAuthUrls.TryGetValue(provider, out var url) && !url.Contains("YOUR_");

    public static void LaunchOAuth(string provider)
    {
        if (OAuthUrls.TryGetValue(provider, out var url))
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
    }
}
