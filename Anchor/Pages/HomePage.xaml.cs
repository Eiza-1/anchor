using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class HomePage : Page
{
    public HomePage()
    {
        InitializeComponent();
        GreetingText.Text = ProfileService.Greeting(ProfileService.Load());
    }

    private async void Boost_Click(object sender, RoutedEventArgs e)
    {
        BoostButton.IsEnabled = false;
        BoostProgress.IsActive = true;
        BoostResultText.Text = "Creating restore point…";

        var (ok, msg) = await RestorePointService.CreateAsync("Anchor Boost");
        BoostResultText.Text = ok ? "Restore point created. Boosting…" : msg + " Continuing boost…";

        var r = await BoostService.RunFullBoostAsync(includeTemp: true, includeRecycleBin: false);
        BoostResultText.Text =
            $"Done. Trimmed {r.ProcessesTrimmed} background processes ({BoostService.FormatBytes(r.RamFreedBytes)} RAM freed, measured system-wide) " +
            $"and deleted {r.TempFilesDeleted} temp files ({BoostService.FormatBytes(r.TempBytesDeleted)}). " +
            "Open apps and taskbar apps were not touched.";

        BoostProgress.IsActive = false;
        BoostButton.IsEnabled = true;
    }

    private async void Health_Click(object sender, RoutedEventArgs e)
    {
        HealthButton.IsEnabled = false;
        HealthProgress.IsActive = true;
        var lines = new List<string>();

        var build = UpdateService.GetBuildInfo();
        lines.Add($"🪟 {build.ProductName} {build.DisplayVersion} (build {build.FullBuild})");

        var updates = await UpdateService.CheckAsync();
        lines.Add((updates.UpToDate ? "✅ " : "🟡 ") + updates.Summary);

        foreach (var d in await DriveHealthService.GetDrivesAsync())
            lines.Add($"{(d.Health == "Healthy" ? "✅" : "⚠")} {d.Name} ({d.MediaType}, {d.SizeText}): {d.Advice}");

        foreach (var v in DriveHealthService.GetVolumeSpace())
            lines.Add((v.Low ? "⚠ Low space — " : "💾 ") + v.Text);

        var perf = await PerformanceService.SampleAsync();
        lines.Add($"📊 CPU {perf.CpuPercent:0}% · Memory {perf.MemPercent:0}% ({BoostService.FormatBytes(perf.MemUsed)} / {BoostService.FormatBytes(perf.MemTotal)}) · Disk {perf.DiskPercent:0}%");
        lines.AddRange(PerformanceService.GetSuggestions(perf).Select(t => "💡 " + t));

        HealthResults.ItemsSource = lines;
        HealthProgress.IsActive = false;
        HealthButton.IsEnabled = true;
    }

    private async void RestorePoint_Click(object sender, RoutedEventArgs e)
    {
        RestoreResultText.Text = "Creating restore point…";
        var (_, msg) = await RestorePointService.CreateAsync("Anchor manual restore point");
        RestoreResultText.Text = msg;
    }
}
