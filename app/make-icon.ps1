# Converts the app logo PNG into build\icon.ico (multi-size) for Electron builds.
# Usage:  powershell -ExecutionPolicy Bypass -File make-icon.ps1
# Source: build\logo.png  (override with -Source <path>)

param(
    [string]$Source = "$PSScriptRoot\build\logo.png"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Source)) {
    Write-Host "Logo not found at $Source" -ForegroundColor Red
    exit 1
}

$buildDir = Join-Path $PSScriptRoot "build"
New-Item -ItemType Directory -Force $buildDir | Out-Null
$ico = Join-Path $buildDir "icon.ico"

# Electron/NSIS want at least 256x256 present.
$src = [System.Drawing.Image]::FromFile($Source)
$sizes = 16, 24, 32, 48, 64, 128, 256
$images = @()

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $s, $s)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $images += ,@($s, $ms.ToArray())
    $ms.Dispose()
}
$src.Dispose()

$fs = [System.IO.File]::Create($ico)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$images.Count)
$offset = 6 + (16 * $images.Count)
foreach ($img in $images) {
    $s = $img[0]; $bytes = $img[1]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([byte]$dim); $bw.Write([byte]$dim)
    $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$bytes.Length); $bw.Write([uint32]$offset)
    $offset += $bytes.Length
}
foreach ($img in $images) { $bw.Write($img[1]) }
$bw.Close(); $fs.Close()

# Keep a PNG copy next to it (handy for the landing page / README).
if ((Resolve-Path $Source).Path -ne (Join-Path $buildDir "logo.png")) {
    Copy-Item $Source (Join-Path $buildDir "logo.png") -Force
}

Write-Host "Created $ico  (sizes: $($sizes -join ', '))" -ForegroundColor Green
