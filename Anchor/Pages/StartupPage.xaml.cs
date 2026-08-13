using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class StartupPage : Page
{
    public StartupPage()
    {
        InitializeComponent();
        Load();
    }

    private void Load() => EntriesList.ItemsSource = StartupService.GetEntries();
    private void Refresh_Click(object sender, RoutedEventArgs e) => Load();

    private void Entry_Toggled(object sender, RoutedEventArgs e)
    {
        if (sender is ToggleSwitch { Tag: StartupEntry entry } ts && ts.IsOn != entry.Enabled)
        {
            try { StartupService.SetEnabled(entry, ts.IsOn); }
            catch { ts.IsOn = entry.Enabled; } // revert on failure (e.g. HKLM without rights)
        }
    }
}
