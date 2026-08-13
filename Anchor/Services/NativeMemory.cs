using System.Runtime.InteropServices;

namespace Anchor.Services;

/// <summary>Accurate memory readings straight from the Windows APIs (no cached .NET values).</summary>
internal static class NativeMemory
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

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_MEMORY_COUNTERS_EX
    {
        public uint cb;
        public uint PageFaultCount;
        public nuint PeakWorkingSetSize;
        public nuint WorkingSetSize;
        public nuint QuotaPeakPagedPoolUsage;
        public nuint QuotaPagedPoolUsage;
        public nuint QuotaPeakNonPagedPoolUsage;
        public nuint QuotaNonPagedPoolUsage;
        public nuint PagefileUsage;
        public nuint PeakPagefileUsage;
        public nuint PrivateUsage;
    }
    [DllImport("psapi.dll", SetLastError = true)]
    private static extern bool GetProcessMemoryInfo(IntPtr hProcess, out PROCESS_MEMORY_COUNTERS_EX counters, uint size);

    public static (long Total, long Available, double LoadPercent) SystemMemory()
    {
        var m = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
        GlobalMemoryStatusEx(ref m);
        return ((long)m.ullTotalPhys, (long)m.ullAvailPhys, m.dwMemoryLoad);
    }

    /// <summary>Current working set of a process, read live from the OS. Returns -1 on failure.</summary>
    public static long WorkingSet(IntPtr hProcess)
    {
        var c = new PROCESS_MEMORY_COUNTERS_EX();
        return GetProcessMemoryInfo(hProcess, out c, (uint)Marshal.SizeOf<PROCESS_MEMORY_COUNTERS_EX>())
            ? (long)c.WorkingSetSize : -1;
    }

    /// <summary>Private (unshared) memory of a process — the closest cheap match to what
    /// Task Manager attributes to an app, excluding shared DLL pages. Returns -1 on failure.</summary>
    public static long PrivateBytes(IntPtr hProcess)
    {
        var c = new PROCESS_MEMORY_COUNTERS_EX();
        return GetProcessMemoryInfo(hProcess, out c, (uint)Marshal.SizeOf<PROCESS_MEMORY_COUNTERS_EX>())
            ? (long)c.PrivateUsage : -1;
    }
}
