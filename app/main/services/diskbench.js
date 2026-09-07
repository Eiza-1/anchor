// Disk speed benchmark, in the style of CrystalDiskMark, plus RAM testing.
//
// Accuracy note: a naive benchmark measures Windows' file cache, not the drive —
// people get "14 GB/s" on a SATA SSD that way. This uses UNBUFFERED I/O
// (FILE_FLAG_NO_BUFFERING) via a small compiled helper, exactly as CrystalDiskMark
// does, so every read genuinely reaches the hardware. If unbuffered I/O can't be
// opened, it falls back to buffered mode and says so rather than reporting a lie.
const { runPS, runPSJson } = require("./ps");

// C# helper compiled at run time: aligned buffers + raw ReadFile/WriteFile.
const HELPER = `
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class AnchorBench {
    const uint GENERIC_READ = 0x80000000, GENERIC_WRITE = 0x40000000;
    const uint CREATE_ALWAYS = 2, OPEN_EXISTING = 3;
    const uint FLAG_NO_BUFFERING = 0x20000000, FLAG_WRITE_THROUGH = 0x80000000;

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sec,
        uint disp, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteFile(IntPtr h, IntPtr buf, uint n, out uint written, IntPtr ov);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ReadFile(IntPtr h, IntPtr buf, uint n, out uint read, IntPtr ov);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetFilePointerEx(IntPtr h, long dist, IntPtr newPtr, uint method);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool FlushFileBuffers(IntPtr h);

    // Result: MB/s
    public static double Run(string path, int blockBytes, long totalBytes, bool write, bool random, bool unbuffered) {
        uint flags = unbuffered ? (FLAG_NO_BUFFERING | FLAG_WRITE_THROUGH) : FLAG_WRITE_THROUGH;
        IntPtr h = CreateFile(path,
            write ? GENERIC_WRITE : GENERIC_READ, 0, IntPtr.Zero,
            write ? CREATE_ALWAYS : OPEN_EXISTING, flags, IntPtr.Zero);
        if (h.ToInt64() == -1) throw new Exception("open failed: " + Marshal.GetLastWin32Error());

        // page-aligned buffer, required for unbuffered I/O
        IntPtr raw = Marshal.AllocHGlobal(blockBytes + 4096);
        long addr = raw.ToInt64();
        IntPtr buf = new IntPtr((addr + 4095) & ~4095L);
        for (int i = 0; i < blockBytes; i += 8) Marshal.WriteInt64(buf, i, 0x5A5A5A5A5A5A5A5AL);

        long ops = totalBytes / blockBytes;
        Random rnd = new Random(1234);
        long maxBlocks = Math.Max(1, totalBytes / blockBytes);
        Stopwatch sw = Stopwatch.StartNew();
        try {
            for (long i = 0; i < ops; i++) {
                if (random) {
                    long off = (long)(rnd.NextDouble() * (maxBlocks - 1)) * blockBytes;
                    SetFilePointerEx(h, off, IntPtr.Zero, 0);
                }
                uint done;
                bool ok = write ? WriteFile(h, buf, (uint)blockBytes, out done, IntPtr.Zero)
                                : ReadFile(h, buf, (uint)blockBytes, out done, IntPtr.Zero);
                if (!ok || done == 0) throw new Exception("io failed: " + Marshal.GetLastWin32Error());
            }
            if (write) FlushFileBuffers(h);
        } finally {
            sw.Stop();
            Marshal.FreeHGlobal(raw);
            CloseHandle(h);
        }
        double secs = sw.Elapsed.TotalSeconds;
        if (secs <= 0) return 0;
        return (ops * (double)blockBytes) / secs / (1024.0 * 1024.0);
    }
}
`;

/**
 * Runs a CrystalDiskMark-style set on one drive.
 * @param driveLetter e.g. "C:"
 * @param sizeMB test file size — bigger is more accurate, slower
 */
async function benchmark(driveLetter = "C:", sizeMB = 256) {
  const letter = String(driveLetter).replace(/[^A-Za-z:]/g, "").slice(0, 2);
  const size = Math.max(64, Math.min(4096, Number(sizeMB) || 256));

  const result = await runPSJson(`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${HELPER}
'@

$drive = '${letter}'
$dir = Join-Path $drive 'AnchorBench'
$free = (Get-PSDrive ($drive[0])).Free
$needed = ${size}MB * 1.2
if ($free -lt $needed) {
  [PSCustomObject]@{ error = ('Not enough free space on ' + $drive + ' — the test needs about ' + [math]::Round($needed/1GB,1) + ' GB free.') } | ConvertTo-Json -Compress
  exit
}

New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir 'anchor_bench.bin'
$total = ${size}MB
$unbuffered = $true
$results = @{}

try {
  try {
    $results.seqWrite = [AnchorBench]::Run($file, 1MB, $total, $true, $false, $true)
  } catch {
    # some filesystems/virtual disks refuse unbuffered I/O
    $unbuffered = $false
    $results.seqWrite = [AnchorBench]::Run($file, 1MB, $total, $true, $false, $false)
  }
  $results.seqRead   = [AnchorBench]::Run($file, 1MB,  $total,      $false, $false, $unbuffered)
  $results.rndWrite  = [AnchorBench]::Run($file, 4096, 32MB,        $true,  $true,  $unbuffered)
  $results.rndRead   = [AnchorBench]::Run($file, 4096, 32MB,        $false, $true,  $unbuffered)
} finally {
  Remove-Item $file -Force -ErrorAction SilentlyContinue
  Remove-Item $dir -Force -Recurse -ErrorAction SilentlyContinue
}

[PSCustomObject]@{
  drive      = $drive
  sizeMB     = ${size}
  unbuffered = $unbuffered
  seqReadMB  = [math]::Round($results.seqRead, 1)
  seqWriteMB = [math]::Round($results.seqWrite, 1)
  rndReadMB  = [math]::Round($results.rndRead, 2)
  rndWriteMB = [math]::Round($results.rndWrite, 2)
  rndReadIOPS  = [int]($results.rndRead  * 1MB / 4096)
  rndWriteIOPS = [int]($results.rndWrite * 1MB / 4096)
} | ConvertTo-Json -Compress
`);

  return result ?? { error: "The benchmark could not be run." };
}

/* ------------------------------- RAM testing ------------------------------ */

/** Results of the last Windows Memory Diagnostic run, if there was one. */
async function memoryTestResults() {
  const r = await runPSJson(`
$ErrorActionPreference = 'SilentlyContinue'
$e = Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-MemoryDiagnostics-Results' } -MaxEvents 1
if ($e) {
  [PSCustomObject]@{
    found = $true
    time = [string]$e.TimeCreated
    passed = ($e.Id -eq 1201 -or $e.Message -match 'no errors|did not detect')
    message = ([string]$e.Message -split "\`n")[0]
  } | ConvertTo-Json -Compress
} else {
  [PSCustomObject]@{ found = $false } | ConvertTo-Json -Compress
}
`);
  return r ?? { found: false };
}

/** Schedules Windows Memory Diagnostic — it runs before Windows next starts. */
async function scheduleMemoryTest() {
  const { code, err } = await runPS("mdsched.exe");
  return { ok: code === 0, error: err };
}

module.exports = { benchmark, memoryTestResults, scheduleMemoryTest };
