using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class UpdatesPage : Page
{
    public UpdatesPage()
    {
        InitializeComponent();
        var b = UpdateService.GetBuildInfo();
        BuildText.Text = $"{b.ProductName} {b.DisplayVersion} — build {b.FullBuild}";
        Loaded += async (_, _) => await LoadNewsAsync();
    }

    private async void Check_Click(object sender, RoutedEventArgs e)
    {
        CheckButton.IsEnabled = false;
        Progress.IsActive = true;
        var s = await UpdateService.CheckAsync();
        StatusText.Text = s.Summary;
        PendingList.ItemsSource = s.PendingTitles.Select(t => "• " + t).ToList();
        LastInstalledText.Text = s.LastInstalled != null ? $"Last successful update: {s.LastInstalled}" : "";
        Progress.IsActive = false;
        CheckButton.IsEnabled = true;
    }

    private void OpenSettings_Click(object sender, RoutedEventArgs e) =>
        UpdateService.OpenWindowsUpdateSettings();

    private async Task LoadNewsAsync()
    {
        try
        {
            var items = await NewsService.FetchWindowsUpdateNewsAsync();
            NewsList.ItemsSource = items.Take(12).ToList();
        }
        catch { }
        NewsProgress.IsActive = false;
    }

    private void Article_Click(object sender, RoutedEventArgs e)
    {
        if (sender is HyperlinkButton { Tag: string url }) NewsService.OpenInBrowser(url);
    }
}
