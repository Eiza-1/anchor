using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;
using Anchor.Pages;
using Anchor.Services;

namespace Anchor;

public sealed partial class MainWindow : Window
{
    private AppUpdateInfo? _update;

    public MainWindow()
    {
        InitializeComponent();
        Title = "Anchor";

        // Title-bar / taskbar icon
        var icoPath = Path.Combine(AppContext.BaseDirectory, "Assets", "anchor.ico");
        if (File.Exists(icoPath)) AppWindow.SetIcon(icoPath);

        // Splash logo
        var logoPath = Path.Combine(AppContext.BaseDirectory, "Assets", "logo.png");
        if (File.Exists(logoPath)) SplashLogo.Source = new BitmapImage(new Uri(logoPath));

        ContentFrame.Navigate(typeof(HomePage));

        // Hide splash shortly after first frame renders
        var timer = DispatcherQueue.CreateTimer();
        timer.Interval = TimeSpan.FromMilliseconds(1400);
        timer.Tick += (_, _) => { Splash.Visibility = Visibility.Collapsed; timer.Stop(); };
        timer.Start();

        _ = CheckForUpdatesAsync();
    }

    private async Task CheckForUpdatesAsync()
    {
        _update = await AppUpdateService.CheckAsync();
        if (_update is { Available: true })
        {
            UpdateBar.Title = $"Anchor {_update.LatestVersion} is available (you have {AppUpdateService.CurrentVersion})";
            UpdateBar.Message = string.IsNullOrWhiteSpace(_update.Notes) ? "" : _update.Notes;
            UpdateBar.IsOpen = true;
        }
    }

    private void DownloadUpdate_Click(object sender, RoutedEventArgs e)
    {
        var url = _update?.InstallerUrl ?? _update?.ReleaseUrl;
        if (url != null) NewsService.OpenInBrowser(url);
    }

    private void Nav_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem item || item.Tag is not string tag) return;
        Type? page = tag switch
        {
            "Home" => typeof(HomePage),
            "Boost" => typeof(BoostPage),
            "Updates" => typeof(UpdatesPage),
            "Spotlight" => typeof(SpotlightPage),
            "Startup" => typeof(StartupPage),
            "Bloatware" => typeof(BloatwarePage),
            "Privacy" => typeof(PrivacyPage),
            "Drives" => typeof(DrivesPage),
            "Performance" => typeof(PerformancePage),
            "Tools" => typeof(ToolsPage),
            "Account" => typeof(AccountPage),
            _ => null
        };
        if (page != null && ContentFrame.CurrentSourcePageType != page)
            ContentFrame.Navigate(page);
    }
}
