param([string]$ad, [string]$logo, [int]$x, [int]$y, [int]$w, [string]$out, [string]$text = "", [int]$tx = 0, [int]$ty = 0, [int]$tsize = 34)
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($ad)
$bmp = New-Object System.Drawing.Bitmap $img
$img.Dispose()
$l = [System.Drawing.Image]::FromFile($logo)
$h = [int][math]::Round($w * $l.Height / $l.Width)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($l, (New-Object System.Drawing.Rectangle $x, $y, $w, $h))
if ($text) {
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $font = New-Object System.Drawing.Font("Segoe UI Semibold", $tsize, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $g.DrawString($text, $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 255, 255, 255))), $tx, $ty)
}
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
"$([System.IO.Path]::GetFileName($out)): $($bmp.Width)x$($bmp.Height), logo ${w}x$h at ($x,$y)$(if ($text) { ", text '$text' at ($tx,$ty)" })"
$g.Dispose(); $bmp.Dispose(); $l.Dispose()
