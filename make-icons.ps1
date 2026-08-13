# Turns your logo into all icon assets Anchor needs.
# 1. Put your logo at:  Anchor\Assets\logo.png   (square, 512x512 or larger, PNG)
# 2. Run:  powershell -ExecutionPolicy Bypass -File make-icons.ps1
# Produces: Anchor\Assets\anchor.ico (multi-size, used by exe/installer/window)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$assets = Join-Path $root "Anchor\Assets"
$logo   = Join-Path $assets "logo.png"
$ico    = Join-Path $assets "anchor.ico"

if (-not (Test-Path $logo)) {
    Write-Host "Logo not found at $logo" -ForegroundColor Red
    Write-Host "Place your logo there (square PNG, 512x512+) and run this again."
    exit 1
}

$src = [System.Drawing.Image]::FromFile($logo)
$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$images = @()

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($src, 0, 0, $s, $s)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $images += ,@($s, $ms.ToArray())
    $ms.Dispose()
}
$src.Dispose()

# Write multi-size .ico (PNG-compressed entries, supported since Vista)
$fs = [System.IO.File]::Create($ico)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$images.Count)
$offset = 6 + (16 * $images.Count)
foreach ($img in $images) {
    $s = $img[0]; $bytes = $img[1]
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))  # width
    $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))  # height
    $bw.Write([byte]0); $bw.Write([byte]0)                    # colors, reserved
    $bw.Write([uint16]1); $bw.Write([uint16]32)               # planes, bpp
    $bw.Write([uint32]$bytes.Length); $bw.Write([uint32]$offset)
    $offset += $bytes.Length
}
foreach ($img in $images) { $bw.Write($img[1]) }
$bw.Close(); $fs.Close()

Write-Host "Created $ico with sizes: $($sizes -join ', ')" -ForegroundColor Green
Write-Host "Now run build.cmd to bake it into the app."
