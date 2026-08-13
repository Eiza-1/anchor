using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class AccountPage : Page
{
    private UserProfile _profile;

    public AccountPage()
    {
        InitializeComponent();
        _profile = ProfileService.Load();
        GreetingText.Text = ProfileService.Greeting(_profile);
        NameBox.Text = _profile.Name;
        EmailBox.Text = _profile.Email;
        MailUpdates.IsOn = _profile.MailWindowsUpdates;
        MailHealth.IsOn = _profile.MailSystemHealth;
        MailNews.IsOn = _profile.MailTechNews;
        MailAnchor.IsOn = _profile.MailAnchorUpdates;
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        _profile.Name = NameBox.Text.Trim();
        _profile.Email = EmailBox.Text.Trim();
        _profile.MailWindowsUpdates = MailUpdates.IsOn;
        _profile.MailSystemHealth = MailHealth.IsOn;
        _profile.MailTechNews = MailNews.IsOn;
        _profile.MailAnchorUpdates = MailAnchor.IsOn;
        ProfileService.Save(_profile);
        GreetingText.Text = ProfileService.Greeting(_profile);
        SaveText.Text = "Saved locally.";
    }

    private void OAuth_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string provider }) return;
        if (ProfileService.IsOAuthConfigured(provider))
        {
            ProfileService.LaunchOAuth(provider);
            OAuthText.Text = $"Opened {provider} sign-in in your browser.";
        }
        else
        {
            OAuthText.Text = $"{provider} sign-in isn't configured in this build (no API keys shipped). " +
                             "Add your keys per docs/OAUTH_SETUP.md, or just use the local profile above.";
        }
    }
}
