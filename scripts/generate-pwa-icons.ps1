param([string]$OutputDirectory = "public/icons")

Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

function New-RoundedRectangle([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-SahaayaIcon([int]$Size, [string]$Path) {
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $bitmap.SetResolution(144, 144)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#123d33"))

  $margin = $Size * 0.20
  $panel = New-RoundedRectangle $margin $margin ($Size - 2 * $margin) ($Size - 2 * $margin) ($Size * 0.13)
  $panelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#f7fbf8"))
  $graphics.FillPath($panelBrush, $panel)

  $center = $Size / 2
  $outer = $Size * 0.18
  $inner = $Size * 0.055
  $points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($center, $center - $outer),
    [System.Drawing.PointF]::new($center + $inner, $center - $inner),
    [System.Drawing.PointF]::new($center + $outer, $center),
    [System.Drawing.PointF]::new($center + $inner, $center + $inner),
    [System.Drawing.PointF]::new($center, $center + $outer),
    [System.Drawing.PointF]::new($center - $inner, $center + $inner),
    [System.Drawing.PointF]::new($center - $outer, $center),
    [System.Drawing.PointF]::new($center - $inner, $center - $inner)
  )
  $starBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#176b55"))
  $graphics.FillPolygon($starBrush, $points)
  $accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#e6a93d"))
  $accent = $Size * 0.034
  $graphics.FillEllipse($accentBrush, $center - $accent, $center - $accent, 2 * $accent, 2 * $accent)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $accentBrush.Dispose(); $starBrush.Dispose(); $panelBrush.Dispose(); $panel.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-SahaayaIcon 192 (Join-Path $OutputDirectory "sahaaya-192.png")
New-SahaayaIcon 512 (Join-Path $OutputDirectory "sahaaya-512.png")
