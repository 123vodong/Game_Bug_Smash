# Extract the 5 skill-icon tiles from assets/ai_skills_icons/image.png
# Output: assets/skill_icons/skill-{sonnet,opus,haiku,cursor,copilot}.png

param(
  [string]$Source = "assets/ai_skills_icons/image.png",
  [string]$OutDir = "assets/skill_icons",
  [int]$Size = 170
)

Add-Type -AssemblyName System.Drawing

$scriptRoot = Split-Path -Parent $PSCommandPath
$projectRoot = Split-Path -Parent $scriptRoot
$sourcePath = if ([System.IO.Path]::IsPathRooted($Source)) { $Source } else { Join-Path $projectRoot $Source }
$outPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $projectRoot $OutDir }

if (-not (Test-Path $sourcePath)) { Write-Error "Not found: $sourcePath"; exit 1 }
if (-not (Test-Path $outPath)) { New-Item -ItemType Directory -Path $outPath | Out-Null }

# Centers of each icon tile in the source image (5 evenly-spaced columns).
# Source is 1536x1024. Icons sit ~y=240 vertically.
$icons = @(
  @{ name='sonnet';  cx=180;  cy=420 },
  @{ name='opus';    cx=478;  cy=420 },
  @{ name='haiku';   cx=773;  cy=420 },
  @{ name='cursor';  cx=1068; cy=420 },
  @{ name='copilot'; cx=1362; cy=420 }
)

$img = [System.Drawing.Image]::FromFile($sourcePath)
try {
  $half = [int]($Size / 2)
  foreach ($i in $icons) {
    $srcRect = [System.Drawing.Rectangle]::new($i.cx - $half, $i.cy - $half, $Size, $Size)
    $dstRect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
    $tile = [System.Drawing.Bitmap]::new($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($tile)
    try { $g.DrawImage($img, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel) } finally { $g.Dispose() }
    $out = Join-Path $outPath ("skill-" + $i.name + ".png")
    $tile.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $tile.Dispose()
    Write-Host ("Wrote " + $out)
  }
} finally {
  $img.Dispose()
}
