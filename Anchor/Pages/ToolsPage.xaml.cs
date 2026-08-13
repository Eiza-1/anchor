using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class ToolsPage : Page
{
    public ToolsPage() => InitializeComponent();

    private void Tool_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string cmd })
        {
            try
            {
                System.Diagnostics.Process.Start(
                    new System.Diagnostics.ProcessStartInfo(cmd) { UseShellExecute = true });
            }
            catch { }
        }
    }

    private void Generate_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var path = AutounattendService.Save(new AutounattendOptions
            {
                UserName = UserNameBox.Text.Trim(),
                ComputerName = ComputerNameBox.Text.Trim(),
                Locale = LocaleBox.Text.Trim(),
                TimeZone = TimeZoneBox.Text.Trim(),
                SkipPrivacyQuestions = SkipPrivacyBox.IsChecked == true,
                DisableTelemetry = TelemetryBox.IsChecked == true,
                LocalAccountOnly = LocalAccountBox.IsChecked == true,
                BypassHardwareChecks = BypassBox.IsChecked == true,
            });
            GenResultText.Text = $"Saved to: {path}";
        }
        catch (Exception ex)
        {
            GenResultText.Text = "Failed: " + ex.Message;
        }
    }
}
