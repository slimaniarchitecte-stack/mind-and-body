# Mind and Body: draws the app icons (PNG) from the same geometry as icons/logo.svg.
# You only need to run this again if you change the logo or its colors:
#     powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
#
# The mark: a calendar (planning) with a heartbeat (health and movement).

param(
  [string]$Out = (Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'),
  [string]$Paper = '#2B2D42',
  [string]$Body = '#C6FF00',
  [string]$Mind = '#F5F5F5'
)

Add-Type -AssemblyName System.Drawing

function New-Icon {
  param([int]$Size, [string]$Name, [double]$Scale, [bool]$Rounded)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $paperBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($Paper))
  if ($Rounded) {
    # Rounded square on a transparent background (for browsers and desktops).
    $r = [single]($Size * 0.2)
    $d = $r * 2
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($Size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($Size - $d, $Size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $Size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($paperBrush, $path)
  } else {
    # Full square: the phone cuts its own shape out of it.
    $g.FillRectangle($paperBrush, 0, 0, $Size, $Size)
  }

  # The logo is drawn on a 64 unit grid and centered on its own middle.
  $u = $Size / 64.0 * $Scale
  $ox = $Size / 2.0 - 32.0 * $u
  $oy = $Size / 2.0 - 33.8 * $u
  $w = [single](3.4 * $u)
  $penBody = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($Body)), $w
  $penMind = New-Object System.Drawing.Pen ([System.Drawing.ColorTranslator]::FromHtml($Mind)), $w
  $g.DrawRectangle($penMind, [single]($ox + 10 * $u), [single]($oy + 13 * $u), [single](44 * $u), [single](43 * $u))
  foreach ($segment in @(@(21,8,21,19), @(43,8,43,19), @(10,25,54,25))) {
    $g.DrawLine($penMind, [single]($ox + $segment[0]*$u), [single]($oy + $segment[1]*$u), [single]($ox + $segment[2]*$u), [single]($oy + $segment[3]*$u))
  }
  foreach ($segment in @(@(17,40,24,40), @(24,40,29,31), @(29,31,35,48), @(35,48,40,40), @(40,40,47,40))) {
    $g.DrawLine($penBody, [single]($ox + $segment[0]*$u), [single]($oy + $segment[1]*$u), [single]($ox + $segment[2]*$u), [single]($oy + $segment[3]*$u))
  }

  $file = Join-Path $Out $Name
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "$Name  ${Size}x${Size}"
}

New-Icon -Size 192 -Name 'icon-192.png' -Scale 0.9 -Rounded $true
New-Icon -Size 512 -Name 'icon-512.png' -Scale 0.9 -Rounded $true
New-Icon -Size 512 -Name 'icon-maskable-512.png' -Scale 0.72 -Rounded $false
New-Icon -Size 180 -Name 'apple-touch-icon.png' -Scale 0.86 -Rounded $false
New-Icon -Size 48 -Name 'favicon-48.png' -Scale 0.96 -Rounded $true
