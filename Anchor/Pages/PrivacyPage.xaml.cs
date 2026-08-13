using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class PrivacyPage : Page
{
    public PrivacyPage()
    {
        InitializeComponent();
        TweaksList.ItemsSource = PrivacyService.GetTweaks();
    }

    private void Tweak_Toggled(object sender, RoutedEventArgs e)
    {
        if (sender is ToggleSwitch { Tag: PrivacyTweak t } ts && ts.IsOn != t.IsApplied)
        {
            try { PrivacyService.Apply(t, ts.IsOn); }
            catch { ts.IsOn = t.IsApplied; }
        }
    }

    private async void Restore_Click(object sender, RoutedEventArgs e)
    {
        RestoreText.Text = "Creating restore point…";
        var (_, msg) = await RestorePointService.CreateAsync("Anchor privacy changes");
        RestoreText.Text = msg;
    }
}
