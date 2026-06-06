# Splits bugs-sheet.png (2 rows × 4 cols) into 8 PNGs in assets/bugs/.
# Usage: pwsh tools/split-bugs.ps1
# Optional: pass a source path: pwsh tools/split-bugs.ps1 path/to/sheet.png

param(
  [string]$Source = "bugs-sheet.png",
  [string]$OutDir = "assets/bugs"
)

Add-Type -AssemblyName System.Drawing

$scriptRoot = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptRoot
$sourcePath = if ([System.IO.Path]::IsPathRooted($Source)) { $Source } else { Join-Path $projectRoot $Source }
$outPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $projectRoot $OutDir }

if (-not (Test-Path $sourcePath)) {
  Write-Error "Source image not found: $sourcePath"
  exit 1
}
if (-not (Test-Path $outPath)) { New-Item -ItemType Directory -Path $outPath | Out-Null }

$img = [System.Drawing.Image]::FromFile($sourcePath)
try {
  $cols = 4
  $rows = 2
  $tileW = [int]($img.Width  / $cols)
  $tileH = [int]($img.Height / $rows)

  # Name each tile by row,col position.
  # Top row (left to right):    null, ladybug, beetle, scarab
  # Bottom row (left to right): race, robot, toxic, dead
  $names = @(
    'null', 'ladybug', 'beetle', 'scarab',
    'race', 'robot',   'toxic',   'dead'
  )

  for ($r = 0; $r -lt $rows; $r++) {
    for ($c = 0; $c -lt $cols; $c++) {
      $idx = $r * $cols + $c
      $name = $names[$idx]
      $srcRect = [System.Drawing.Rectangle]::new($c * $tileW, $r * $tileH, $tileW, $tileH)
      $dstRect = [System.Drawing.Rectangle]::new(0, 0, $tileW, $tileH)
      $tile = [System.Drawing.Bitmap]::new($tileW, $tileH)
      $g = [System.Drawing.Graphics]::FromImage($tile)
      try {
        $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
      } finally { $g.Dispose() }
      $out = Join-Path $outPath ("bug-" + $name + ".png")
      $tile.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
      $tile.Dispose()
      Write-Host ("Wrote " + $out)
    }
  }
} finally {
  $img.Dispose()
}
