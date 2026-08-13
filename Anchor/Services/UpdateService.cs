using Microsoft.Win32;

namespace Anchor.Services;

public record WindowsBuildInfo(string ProductName, string DisplayVersion, string Build, string Ubr)
{
    public string FullBuild => $"{Build}.{Ubr}";
}
public record UpdateStatus(bool UpToDate, int PendingCount, List<string> PendingTitles, string? LastInstalled, string Summary);

/// <summary>Checks whether this PC is on a recent, stable Windows build using the
/// built-in Windows Update Agent API (no third-party services involved).</summary>
public static class UpdateService
{
    public static WindowsBuildInfo GetBuildInfo()
    {
        using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
        return new WindowsBuildInfo(
            key?.GetValue("ProductName")?.ToString() ?? "Windows",
            key?.GetValue("DisplayVersion")?.ToString() ?? "?",
            key?.GetValue("CurrentBuild")?.ToString() ?? "?",
            key?.GetValue("UBR")?.ToString() ?? "0");
    }

    /// <summary>Searches Windows Update for pending cumulative/security/feature updates.</summary>
    public static Task<UpdateStatus> CheckAsync() => Task.Run(() =>
    {
        try
        {
            var t = Type.GetTypeFromProgID("Microsoft.Update.Session")
                    ?? throw new InvalidOperationException("Windows Update Agent unavailable.");
            dynamic session = Activator.CreateInstance(t)!;
            dynamic searcher = session.CreateUpdateSearcher();

            dynamic result = searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0");
            int count = result.Updates.Count;
            var titles = new List<string>();
            for (int i = 0; i < Math.Min(count, 15); i++)
                titles.Add((string)result.Updates.Item(i).Title);

            string? last = null;
            int historyCount = searcher.GetTotalHistoryCount();
            if (historyCount > 0)
            {
                dynamic history = searcher.QueryHistory(0, Math.Min(historyCount, 25));
                for (int i = 0; i < history.Count; i++)
                {
                    if ((int)history.Item(i).ResultCode == 2) // succeeded
                    { last = $"{history.Item(i).Title} — {((DateTime)history.Item(i).Date).ToLocalTime():d}"; break; }
                }
            }

            bool upToDate = count == 0;
            string summary = upToDate
                ? "You're on a recent stable build — no cumulative, security, or feature updates are pending."
                : $"{count} update(s) pending. Installing cumulative and security updates keeps your system stable and secure.";
            return new UpdateStatus(upToDate, count, titles, last, summary);
        }
        catch (Exception ex)
        {
            return new UpdateStatus(false, -1, new List<string>(), null,
                $"Couldn't query Windows Update: {ex.Message}. Open Settings > Windows Update to check manually.");
        }
    });

    public static void OpenWindowsUpdateSettings() =>
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("ms-settings:windowsupdate") { UseShellExecute = true });
}
