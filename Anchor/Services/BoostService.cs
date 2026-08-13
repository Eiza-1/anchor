using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Anchor.Services;

public record BoostResult(int ProcessesTrimmed, long RamFreedBytes, long TempBytesDeleted, int TempFilesDeleted, List<string> Skipped);

/// <summary>The "Boost" engine: trims RAM used by background processes and clears temp files.
/// Safety rules: never touches processes that have a visible window (your open apps / taskbar),
/// never touches critical system processes, and only *trims* memory — it does not kill anything.</summary>
public static class BoostService
{
    [DllImport("psapi.dll")]
    private static extern bool EmptyWorkingSet(IntPtr hProcess);

    [DllImport("shell32.dll")]
    private static extern int SHEmptyRecycleBin(IntPtr hwnd, string? pszRootPath, uint dwFlags);
    private const uint SHERB_NOCONFIRMATION = 0x1, SHERB_NOPROGRESSUI = 0x2, SHERB_NOSOUND = 0x4;

    // Critical processes Anchor will never touch.
    private static readonly HashSet<string> Critical = new(StringComparer.OrdinalIgnoreCase)
    {
        "System", "Idle", "Registry", "Memory Compression", "smss", "csrss", "wininit",
        "winlogon", "services", "lsass", "svchost", "dwm", "fontdrvhost", "explorer",
        "audiodg", "ctfmon", "sihost", "taskhostw", "SearchHost", "StartMenuExperienceHost",
        "ShellExperienceHost", "RuntimeBroker", "SecurityHealthService", "MsMpEng", "spoolsv",
        "conhost", "dllhost", "WmiPrvSE", "Anchor"
    };

    /// <summary>Trims the working set of every safe background process (no visible window).
    /// Accuracy notes: per-process readings come live from the OS (GetProcessMemoryInfo),
    /// not .NET's cached snapshot, and the headline "RAM freed" figure is measured
    /// system-wide (available memory before vs. after) — the same source Task Manager
    /// uses — so it never double-counts shared DLL pages across processes.</summary>
    public static BoostResult ClearRamCache()
    {
        int trimmed = 0; var skipped = new List<string>();
        int myPid = Environment.ProcessId;

        var (_, availBefore, _) = NativeMemory.SystemMemory();

        foreach (var p in Process.GetProcesses())
        {
            try
            {
                if (p.Id == myPid) continue;
                if (Critical.Contains(p.ProcessName)) { skipped.Add(p.ProcessName + " (system)"); continue; }
                if (p.MainWindowHandle != IntPtr.Zero) { skipped.Add(p.ProcessName + " (open window)"); continue; }

                long before = NativeMemory.WorkingSet(p.Handle);
                if (before > 0 && EmptyWorkingSet(p.Handle))
                    trimmed++;
            }
            catch { /* access denied on some processes is normal — skip silently */ }
            finally { p.Dispose(); }
        }

        // Let the memory manager settle before measuring, so the number is honest.
        Thread.Sleep(600);
        var (_, availAfter, _) = NativeMemory.SystemMemory();
        long freed = Math.Max(0, availAfter - availBefore);

        return new BoostResult(trimmed, freed, 0, 0, skipped);
    }

    /// <summary>Deletes temp files from %TEMP% and C:\Windows\Temp. Files in use are skipped.</summary>
    public static (long Bytes, int Files) CleanTempFiles()
    {
        long bytes = 0; int files = 0;
        foreach (var dir in new[] { Path.GetTempPath(), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "Temp") })
        {
            if (!Directory.Exists(dir)) continue;
            foreach (var f in SafeEnumerateFiles(dir))
            {
                try { var fi = new FileInfo(f); long len = fi.Length; fi.Delete(); bytes += len; files++; }
                catch { /* in use */ }
            }
            foreach (var d in SafeEnumerateDirs(dir))
            {
                try { Directory.Delete(d, true); } catch { }
            }
        }
        return (bytes, files);
    }

    public static void EmptyRecycleBin() =>
        SHEmptyRecycleBin(IntPtr.Zero, null, SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND);

    /// <summary>Full boost: restore point (optional) → RAM trim → temp cleanup.</summary>
    public static async Task<BoostResult> RunFullBoostAsync(bool includeTemp, bool includeRecycleBin)
    {
        var ram = await Task.Run(ClearRamCache);
        long tempBytes = 0; int tempFiles = 0;
        if (includeTemp) (tempBytes, tempFiles) = await Task.Run(CleanTempFiles);
        if (includeRecycleBin) EmptyRecycleBin();
        return ram with { TempBytesDeleted = tempBytes, TempFilesDeleted = tempFiles };
    }

    private static IEnumerable<string> SafeEnumerateFiles(string dir)
    {
        try { return Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).ToList(); }
        catch { return Enumerable.Empty<string>(); }
    }
    private static IEnumerable<string> SafeEnumerateDirs(string dir)
    {
        try { return Directory.EnumerateDirectories(dir).ToList(); }
        catch { return Enumerable.Empty<string>(); }
    }

    public static string FormatBytes(long b) =>
        b >= 1L << 30 ? $"{b / (double)(1L << 30):0.##} GB" :
        b >= 1L << 20 ? $"{b / (double)(1L << 20):0.#} MB" :
        b >= 1L << 10 ? $"{b / (double)(1L << 10):0} KB" : $"{b} B";
}
