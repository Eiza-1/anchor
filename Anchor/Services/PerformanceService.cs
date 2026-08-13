using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Anchor.Services;

public record PerfSnapshot(double CpuPercent, double MemPercent, long MemUsed, long MemTotal, double DiskPercent);
public record ProcUsage(string Name, int Pid, long MemoryBytes, string MemoryText);

/// <summary>Identifies CPU / memory / disk bottlenecks with plain-language suggestions.</summary>
public static class PerformanceService
{
    private static PerformanceCounter? _cpu, _disk;

    public static Task<PerfSnapshot> SampleAsync() => Task.Run(() =>
    {
        _cpu ??= new PerformanceCounter("Processor", "% Processor Time", "_Total");
        _disk ??= new PerformanceCounter("PhysicalDisk", "% Disk Time", "_Total");
        _cpu.NextValue(); _disk.NextValue();
        Thread.Sleep(1000);
        double cpu = Math.Min(100, _cpu.NextValue());
        double disk = Math.Min(100, _disk.NextValue());

        var (total, avail, load) = NativeMemory.SystemMemory();
        return new PerfSnapshot(cpu, load, total - avail, total, disk);
    });

    /// <summary>Top apps by *private* memory — memory only that app is using, excluding
    /// DLL pages shared between processes (which working-set numbers overstate).
    /// Processes with multiple instances (e.g. browsers) are grouped like Task Manager does.</summary>
    public static List<ProcUsage> TopMemoryProcesses(int count = 8)
    {
        var perProcess = new List<(string Name, int Pid, long Bytes)>();
        foreach (var p in Process.GetProcesses())
        {
            try
            {
                long bytes = NativeMemory.PrivateBytes(p.Handle);
                if (bytes > 0) perProcess.Add((p.ProcessName, p.Id, bytes));
            }
            catch { /* access denied — skip */ }
            finally { p.Dispose(); }
        }
        return perProcess
            .GroupBy(x => x.Name)
            .Select(g =>
            {
                long sum = g.Sum(x => x.Bytes);
                string label = g.Count() > 1
                    ? $"{BoostService.FormatBytes(sum)} ({g.Count()} processes)"
                    : BoostService.FormatBytes(sum);
                return new ProcUsage(g.Key, g.First().Pid, sum, label);
            })
            .OrderByDescending(x => x.MemoryBytes)
            .Take(count).ToList();
    }

    public static List<string> GetSuggestions(PerfSnapshot s)
    {
        var tips = new List<string>();
        if (s.CpuPercent > 85) tips.Add("CPU is a bottleneck right now. Check the top processes below — closing or updating the heaviest app usually helps most.");
        if (s.MemPercent > 85) tips.Add($"Memory pressure is high ({s.MemPercent:0}%). Run Boost to trim background apps, or disable startup apps you don't need.");
        if (s.MemTotal < 8L * (1L << 30)) tips.Add("This PC has less than 8 GB of RAM — a RAM upgrade is the single most effective hardware fix for sluggishness.");
        if (s.DiskPercent > 80) tips.Add("Disk is very busy. If this is an HDD, upgrading to an SSD is transformative. Also check Storage Sense and Windows Search indexing.");
        if (tips.Count == 0) tips.Add("No bottlenecks detected right now — CPU, memory, and disk all have headroom.");
        return tips;
    }
}
