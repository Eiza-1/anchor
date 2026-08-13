using System.Text.Json;

namespace Anchor.Services;

public class AppxApp
{
    public string Name { get; set; } = "";
    public string PackageFullName { get; set; } = "";
    public bool SafeToRemove { get; set; }
    public bool Selected { get; set; }
}

/// <summary>Batch-removal of pre-installed Store apps via the documented
/// Remove-AppxPackage cmdlet. Anchor marks a curated set as "safe to remove";
/// everything else requires a deliberate choice. Apps can be reinstalled free
/// from the Microsoft Store at any time.</summary>
public static class BloatwareService
{
    // Curated: widely considered safe to remove, no system dependencies.
    private static readonly HashSet<string> SafeList = new(StringComparer.OrdinalIgnoreCase)
    {
        "Microsoft.BingNews", "Microsoft.BingWeather", "Microsoft.BingSearch",
        "Microsoft.GetHelp", "Microsoft.Getstarted", "Microsoft.WindowsFeedbackHub",
        "Microsoft.Microsoft3DViewer", "Microsoft.MicrosoftOfficeHub",
        "Microsoft.MicrosoftSolitaireCollection", "Microsoft.MixedReality.Portal",
        "Microsoft.People", "Microsoft.SkypeApp", "Microsoft.Todos",
        "Microsoft.WindowsMaps", "Microsoft.ZuneMusic", "Microsoft.ZuneVideo",
        "Microsoft.YourPhone", "Clipchamp.Clipchamp", "Microsoft.549981C3F5F10", // Cortana
        "MicrosoftTeams", "MSTeams", "Microsoft.Wallet", "Microsoft.WindowsAlarms",
        "Microsoft.WindowsSoundRecorder", "Microsoft.PowerAutomateDesktop",
        "Microsoft.XboxApp", "Microsoft.GamingApp", "Microsoft.XboxGameOverlay",
        "Microsoft.XboxGamingOverlay", "Microsoft.XboxSpeechToTextOverlay",
    };

    // Never offered for removal.
    private static readonly string[] Blocked =
    {
        "Microsoft.WindowsStore", "Microsoft.WindowsCalculator", "Microsoft.Windows.Photos",
        "Microsoft.WindowsNotepad", "Microsoft.ScreenSketch", "Microsoft.WindowsTerminal",
        "Microsoft.SecHealthUI", "Microsoft.DesktopAppInstaller", "Microsoft.WindowsCamera",
        "Microsoft.VCLibs", "Microsoft.NET", "Microsoft.UI.Xaml", "Microsoft.WebpImageExtension",
        "Microsoft.HEIFImageExtension", "Microsoft.VP9VideoExtensions", "Microsoft.WebMediaExtensions",
        "Microsoft.RawImageExtension", "Microsoft.WindowsAppRuntime", "MicrosoftWindows.Client",
    };

    public static async Task<List<AppxApp>> GetInstalledAsync()
    {
        var (_, output, _) = await PowerShellRunner.RunAsync(
            "Get-AppxPackage | Where-Object { -not $_.IsFramework } | Select-Object Name, PackageFullName | ConvertTo-Json -Compress");
        var list = new List<AppxApp>();
        if (string.IsNullOrWhiteSpace(output)) return list;
        try
        {
            var doc = JsonDocument.Parse(output);
            var elements = doc.RootElement.ValueKind == JsonValueKind.Array
                ? doc.RootElement.EnumerateArray().ToList()
                : new List<JsonElement> { doc.RootElement };
            foreach (var e in elements)
            {
                string name = e.GetProperty("Name").GetString() ?? "";
                if (Blocked.Any(b => name.StartsWith(b, StringComparison.OrdinalIgnoreCase))) continue;
                list.Add(new AppxApp
                {
                    Name = name,
                    PackageFullName = e.GetProperty("PackageFullName").GetString() ?? "",
                    SafeToRemove = SafeList.Contains(name)
                });
            }
        }
        catch { }
        return list.OrderByDescending(a => a.SafeToRemove).ThenBy(a => a.Name).ToList();
    }

    /// <summary>Removes the selected apps one by one; returns per-app results.</summary>
    public static async Task<List<(string App, bool Ok, string Error)>> RemoveBatchAsync(IEnumerable<AppxApp> apps)
    {
        var results = new List<(string, bool, string)>();
        foreach (var app in apps)
        {
            var (code, _, err) = await PowerShellRunner.RunAsync(
                $"Remove-AppxPackage -Package '{app.PackageFullName}'");
            results.Add((app.Name, code == 0, err.Trim()));
        }
        return results;
    }
}
