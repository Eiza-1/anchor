using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class DrivesPage : Page
{
    public DrivesPage() => InitializeComponent();

    private async void Scan_Click(object sender, RoutedEventArgs e)
    {
        Progress.IsActive = true;
        var drives = await DriveHealthService.GetDrivesAsync();
        DrivesList.ItemsSource = drives.Count == 0
            ? new List<string> { "No drive health data available. Try running Anchor as administrator." }
            : drives.Select(d =>
            {
                var extras = new List<string>();
                if (d.WearPercent is int w) extras.Add($"wear {w}%");
                if (d.TemperatureC is int t) extras.Add($"{t}°C");
                string extra = extras.Count > 0 ? $" ({string.Join(", ", extras)})" : "";
                return $"{d.Name} — {d.MediaType}, {d.SizeText} — Health: {d.Health}{extra}\n{d.Advice}";
            }).ToList();
        SpaceList.ItemsSource = DriveHealthService.GetVolumeSpace()
            .Select(v => (v.Low ? "⚠ " : "") + v.Text).ToList();
        Progress.IsActive = false;
    }
}
