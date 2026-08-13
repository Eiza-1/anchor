using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class BoostPage : Page
{
    public BoostPage() => InitializeComponent();

    private async void Run_Click(object sender, RoutedEventArgs e)
    {
        RunButton.IsEnabled = false;
        Progress.IsActive = true;
        ResultText.Text = "";

        if (RestoreCheck.IsChecked == true)
        {
            ResultText.Text = "Creating restore point…";
            var (_, msg) = await RestorePointService.CreateAsync("Anchor Boost");
            ResultText.Text = msg;
        }

        var r = await BoostService.RunFullBoostAsync(
            includeTemp: TempCheck.IsChecked == true,
            includeRecycleBin: RecycleCheck.IsChecked == true);

        ResultText.Text =
            $"Boost complete. {r.ProcessesTrimmed} background processes trimmed, {BoostService.FormatBytes(r.RamFreedBytes)} RAM freed (measured system-wide), " +
            $"{r.TempFilesDeleted} temp files removed ({BoostService.FormatBytes(r.TempBytesDeleted)}).";
        SkippedList.ItemsSource = r.Skipped.Distinct().OrderBy(s => s).ToList();

        Progress.IsActive = false;
        RunButton.IsEnabled = true;
    }
}
