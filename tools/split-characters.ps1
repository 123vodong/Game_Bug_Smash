# Splits Characters.png into 4 character PNGs in assets/characters/.
# Uses content-aware column detection: characters create high brightness variance
# in their columns; the background gaps between them are flat. We find the 3
# deepest valleys between characters and cut there.

param(
  [string]$Source = "assets/characters/Characters.png",
  [string]$OutDir = "assets/characters"
)

Add-Type -AssemblyName System.Drawing

$scriptRoot = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptRoot
$sourcePath = if ([System.IO.Path]::IsPathRooted($Source)) { $Source } else { Join-Path $projectRoot $Source }
$outPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $projectRoot $OutDir }
if (-not (Test-Path $sourcePath)) { Write-Error "Not found: $sourcePath"; exit 1 }
if (-not (Test-Path $outPath)) { New-Item -ItemType Directory -Path $outPath | Out-Null }

$bmp = [System.Drawing.Bitmap]::new($sourcePath)
try {
  $W = $bmp.Width; $H = $bmp.Height
  $rect = [System.Drawing.Rectangle]::new(0, 0, $W, $H)
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $bytes = New-Object byte[] ($stride * $H)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $bmp.UnlockBits($data)

  # Per-column brightness variance in middle band (skip top/bottom 15%).
  $yStart = [int]($H * 0.15); $yEnd = [int]($H * 0.85)
  $nPerCol = $yEnd - $yStart
  $density = New-Object double[] $W
  for ($x = 0; $x -lt $W; $x++) {
    $sum = 0.0; $sumSq = 0.0
    for ($y = $yStart; $y -lt $yEnd; $y++) {
      $i = $y * $stride + $x * 4
      $b = [int]$bytes[$i]; $g = [int]$bytes[$i + 1]; $r = [int]$bytes[$i + 2]
      $br = ($r + $g + $b) / 3.0
      $sum += $br; $sumSq += $br * $br
    }
    $mean = $sum / $nPerCol
    $density[$x] = ($sumSq / $nPerCol) - ($mean * $mean)
  }

  # Smooth with a 31-wide moving average.
  $smooth = New-Object double[] $W
  $win = 15
  for ($x = 0; $x -lt $W; $x++) {
    $a = [Math]::Max(0, $x - $win); $b = [Math]::Min($W - 1, $x + $win)
    $s = 0.0; for ($k = $a; $k -le $b; $k++) { $s += $density[$k] }
    $smooth[$x] = $s / ($b - $a + 1)
  }

  # Search 3 cut points: roughly between consecutive characters.
  # We expect 4 characters; cuts are near 1/4, 2/4, 3/4 but offset by the
  # local minimum within a +/- 18% search window.
  $cuts = @()
  foreach ($frac in @(0.25, 0.50, 0.75)) {
    $center = [int]($W * $frac)
    $half = [int]($W * 0.18)
    $a = [Math]::Max(0, $center - $half); $b = [Math]::Min($W - 1, $center + $half)
    $minIdx = $a; $minVal = $smooth[$a]
    for ($k = $a + 1; $k -le $b; $k++) {
      if ($smooth[$k] -lt $minVal) { $minVal = $smooth[$k]; $minIdx = $k }
    }
    $cuts += $minIdx
  }
  Write-Host ("Cuts at columns: " + ($cuts -join ', ') + " of $W")

  $ranges = @(
    @{ name = 'dev';              x0 = 0;        x1 = $cuts[0] },
    @{ name = 'boss-pm';          x0 = $cuts[0]; x1 = $cuts[1] },
    @{ name = 'boss-tech-lead';   x0 = $cuts[1]; x1 = $cuts[2] },
    @{ name = 'boss-deadline';    x0 = $cuts[2]; x1 = $W }
  )

  foreach ($r in $ranges) {
    $tw = $r.x1 - $r.x0
    $srcRect = [System.Drawing.Rectangle]::new($r.x0, 0, $tw, $H)
    $dstRect = [System.Drawing.Rectangle]::new(0, 0, $tw, $H)
    $tile = [System.Drawing.Bitmap]::new($tw, $H)
    $g = [System.Drawing.Graphics]::FromImage($tile)
    try { $g.DrawImage($bmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel) } finally { $g.Dispose() }
    $out = Join-Path $outPath ($r.name + ".png")
    $tile.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $tile.Dispose()
    Write-Host ("Wrote " + $out + " (" + $tw + "x" + $H + ")")
  }
} finally {
  $bmp.Dispose()
}
