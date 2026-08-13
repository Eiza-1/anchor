using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class BloatwarePage : Page
{
    private List<AppxApp> _apps = new();

    public BloatwarePage() => InitializeComponent();

    private async void Load_Click(object sender, RoutedEventArgs e)
    {
        Progress.IsActive = true;
        _apps = await BloatwareService.GetInstalledAsync();
        AppsList.ItemsSource = _apps;
        ResultText.Text = $"{_apps.Count} removable apps found ({_apps.Count(a => a.SafeToRemove)} marked safe).";
        Progress.IsActive = false;
    }

    private void SelectSafe_Click(object sender, RoutedEventArgs e)
    {
        AppsList.SelectedItems.Clear();
        foreach (var a in _apps.Where(a => a.SafeToRemove)) AppsList.SelectedItems.Add(a);
    }

    private async void Remove_Click(object sender, RoutedEventArgs e)
    {
        var selected = AppsList.SelectedItems.Cast<AppxApp>().ToList();
        if (selected.Count == 0) { ResultText.Text = "Nothing selected."; return; }

        var dialog = new ContentDialog
        {
            Title = $"Remove {selected.Count} app(s)?",
            Content = "A System Restore point will be created first. Removed apps can be reinstalled from the Microsoft Store.\n\n" +
                      string.Join("\n", selected.Select(a => "• " + a.Name)),
            PrimaryButtonText = "Create restore point & remove",
            CloseButtonText = "Cancel",
            XamlRoot = XamlRoot
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;

        RemoveButton.IsEnabled = false;
        Progress.IsActive = true;
        ResultText.Text = "Creating restore point…";
        await RestorePointService.CreateAsync("Anchor bloatware removal");

        ResultText.Text = "Removing…";
        var results = await BloatwareService.RemoveBatchAsync(selected);
        int ok = results.Count(r => r.Ok);
        ResultText.Text = $"Removed {ok}/{results.Count}." +
            (ok < results.Count ? " Failures: " + string.Join(", ", results.Where(r => !r.Ok).Select(r => r.App)) : "");

        Progress.IsActive = false;
        RemoveButton.IsEnabled = true;
        Load_Click(sender, e);
    }
}
