using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Anchor.Services;

public record PerfSnapshot(double CpuPercent, double MemPercent, long MemUsed, long MemTotal, double DiskPercent);
public record ProcUsage(string Name, int Pid, long MemoryBytes, string MemoryText);

/// <summary>Identifies CPU / memory / disk bottlenecks with plain-language suggestions.</summary>
public static class PerformanceService
{
    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint dwLength; public uint dwMemoryLoad;
        public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile,
                     ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    private static PerformanceCounter? _cpu, _disk;

    public static Task<PerfSnapshot> SampleAsync() => Task.Run(() =>
    {
        _cpu ??= new PerformanceCounter("Processor", "% Processor Time", "_Total");
        _disk ??= new PerformanceCounter("PhysicalDisk", "% Disk Time", "_Total");
        _cpu.NextValue(); _disk.NextValue();
        Thread.Sleep(1000);
        double cpu = Math.Min(100, _cpu.NextValue());
        double disk = Math.Min(100, _disk.NextValue());

        var mem = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        GlobalMemoryStatusEx(ref mem);
        long total = (long)mem.ullTotalPhys, avail = (long)mem.ullAvailPhys;
        return new PerfSnapshot(cpu, mem.dwMemoryLoad, total - avail, total, disk);
    });

    public static List<ProcUsage> TopMemoryProcesses(int count = 8) =>
        Process.GetProcesses()
            .Select(p => { try { return new ProcUsage(p.ProcessName, p.Id, p.WorkingSet64, BoostService.FormatBytes(p.WorkingSet64)); } catch { return null; } finally { p.Dispose(); } })
            .Where(p => p != null).Cast<ProcUsage>()
            .OrderByDescending(p => p.MemoryBytes).Take(count).ToList();

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
