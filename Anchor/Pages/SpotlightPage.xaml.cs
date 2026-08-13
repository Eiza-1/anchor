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
        SourceFilter.Items.Add("All sources");
        foreach (var s in NewsService.Feeds.Keys) SourceFilter.Items.Add(s);
        SourceFilter.SelectedIndex = 0;
        Loaded += async (_, _) => await LoadAsync();
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
    }

    private void ApplyFilter()
    {
        if (VideoMode)
        {
            VideosList.ItemsSource = _videos.Take(30).ToList();
        }
        else
        {
            var src = SourceFilter.SelectedItem as string;
            ArticlesList.ItemsSource = (src == null || src == "All sources"
                ? _articles : _articles.Where(i => i.Source == src)).Take(60).ToList();
        }
    }

    private void Mode_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (ArticlesList == null || VideosList == null) return; // fires during InitializeComponent
        ArticlesList.Visibility = VideoMode ? Visibility.Collapsed : Visibility.Visible;
        VideosList.Visibility = VideoMode ? Visibility.Visible : Visibility.Collapsed;
        SourceFilter.Visibility = VideoMode ? Visibility.Collapsed : Visibility.Visible;
        ApplyFilter();
    }

    private void Filter_Changed(object sender, SelectionChangedEventArgs e) => ApplyFilter();
    private async void Refresh_Click(object sender, RoutedEventArgs e) => await LoadAsync();

    private void Item_Click(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is NewsItem item) NewsService.OpenInBrowser(item.Link);
    }
}
