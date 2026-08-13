using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class SpotlightPage : Page
{
    private List<NewsItem> _all = new();

    public SpotlightPage()
    {
        InitializeComponent();
        SourceFilter.Items.Add("All sources");
        foreach (var s in NewsService.Feeds.Keys) SourceFilter.Items.Add(s);
        SourceFilter.SelectedIndex = 0;
        Loaded += async (_, _) => await LoadAsync();
    }

    private async Task LoadAsync()
    {
        Progress.IsActive = true;
        try { _all = await NewsService.FetchAsync(); } catch { }
        ApplyFilter();
        Progress.IsActive = false;
    }

    private void ApplyFilter()
    {
        var src = SourceFilter.SelectedItem as string;
        NewsList.ItemsSource = (src == null || src == "All sources"
            ? _all : _all.Where(i => i.Source == src)).Take(60).ToList();
    }

    private void Filter_Changed(object sender, SelectionChangedEventArgs e) => ApplyFilter();
    private async void Refresh_Click(object sender, RoutedEventArgs e) => await LoadAsync();

    private void Item_Click(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is NewsItem item) NewsService.OpenInBrowser(item.Link);
    }
}
