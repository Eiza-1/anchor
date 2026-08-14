using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Anchor.Services;

namespace Anchor.Pages;

public sealed partial class SpotlightPage : Page
{
    private List<NewsItem> _articles = new();
    private List<NewsItem> _videos = new();

    public SpotlightPage()
    {
        InitializeComponent();
        PopulateFilter();
        Loaded += async (_, _) => await LoadAsync();
    }

    private void PopulateFilter()
    {
        SourceFilter.Items.Clear();
        SourceFilter.Items.Add("All sources");
        var keys = VideoMode ? NewsService.VideoChannels.Keys : NewsService.Feeds.Keys;
        foreach (var s in keys) SourceFilter.Items.Add(s);
        SourceFilter.SelectedIndex = 0;
    }

    public static ImageSource? ToImage(string? url) =>
        string.IsNullOrWhiteSpace(url) ? null : new BitmapImage(new Uri(url));

    private bool VideoMode => ModeSelect.SelectedIndex == 1;

    private async Task LoadAsync()
    {
        Progress.IsActive = true;
        try
        {
            var articlesTask = NewsService.FetchAsync();
            var videosTask = NewsService.FetchVideosAsync();
            await Task.WhenAll(articlesTask, videosTask);
            _articles = articlesTask.Result;
            _videos = videosTask.Result;
        }
        catch { }
        ApplyFilter();
        Progress.IsActive = false;

        // Backfill thumbnails for articles whose feed had no image (og:image from the
        // article page). Items notify the UI, so cards gain images as they arrive.
        try { await NewsService.FillMissingImagesAsync(_articles, maxFetches: 40); } catch { }
    }

    private void ApplyFilter()
    {
        var src = SourceFilter.SelectedItem as string;
        bool all = src == null || src == "All sources";
        if (VideoMode)
            VideosList.ItemsSource = (all ? _videos : _videos.Where(i => i.Source == src)).Take(48).ToList();
        else
            ArticlesList.ItemsSource = (all ? _articles : _articles.Where(i => i.Source == src)).Take(60).ToList();
    }

    private void Mode_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (ArticlesList == null || VideosList == null) return; // fires during InitializeComponent
        ArticlesList.Visibility = VideoMode ? Visibility.Collapsed : Visibility.Visible;
        VideosList.Visibility = VideoMode ? Visibility.Visible : Visibility.Collapsed;
        PopulateFilter(); // filter list switches between article sources and video channels
        ApplyFilter();
    }

    private void Filter_Changed(object sender, SelectionChangedEventArgs e) => ApplyFilter();
    private async void Refresh_Click(object sender, RoutedEventArgs e) => await LoadAsync();

    private void Item_Click(object sender, ItemClickEventArgs e)
    {
        // Articles and videos both open in the user's default browser — no embedded
        // web engine, no Edge/WebView2 dependency.
        if (e.ClickedItem is NewsItem item) NewsService.OpenInBrowser(item.Link);
    }
}
