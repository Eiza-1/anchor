using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class PerformancePage : Page
{
    public PerformancePage() => InitializeComponent();

    private async void Sample_Click(object sender, RoutedEventArgs e)
    {
        Progress.IsActive = true;
        var s = await PerformanceService.SampleAsync();
        CpuText.Text = $"CPU: {s.CpuPercent:0}%";
        CpuBar.Value = s.CpuPercent;
        MemText.Text = $"Memory: {s.MemPercent:0}% — {BoostService.FormatBytes(s.MemUsed)} of {BoostService.FormatBytes(s.MemTotal)}";
        MemBar.Value = s.MemPercent;
        DiskText.Text = $"Disk activity: {s.DiskPercent:0}%";
        DiskBar.Value = s.DiskPercent;
        TipsList.ItemsSource = PerformanceService.GetSuggestions(s).Select(t => "💡 " + t).ToList();
        TopProcs.ItemsSource = PerformanceService.TopMemoryProcesses()
            .Select(p => $"{p.Name} (PID {p.Pid}) — {p.MemoryText}").ToList();
        Progress.IsActive = false;
    }
}
