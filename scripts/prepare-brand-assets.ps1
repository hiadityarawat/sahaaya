param(
  [string]$Source = "public/brand/sahaaya-logo-source.png",
  [string]$BrandDirectory = "public/brand",
  [string]$IconDirectory = "public/icons"
)

Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory($BrandDirectory) | Out-Null
[System.IO.Directory]::CreateDirectory($IconDirectory) | Out-Null

function Export-Crop([System.Drawing.Bitmap]$Image, [System.Drawing.Rectangle]$Area, [string]$Path, [int]$Padding) {
  $result = [System.Drawing.Bitmap]::new($Area.Width + 2 * $Padding, $Area.Height + 2 * $Padding)
  $graphics = [System.Drawing.Graphics]::FromImage($result)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($Image, [System.Drawing.Rectangle]::new($Padding, $Padding, $Area.Width, $Area.Height), $Area, [System.Drawing.GraphicsUnit]::Pixel)
  $result.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $result.Dispose()
}

function Export-AppIcon([System.Drawing.Bitmap]$Mark, [int]$Size, [string]$Path) {
  $result = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($result)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#f7f5ef"))
  $target = [int]($Size * 0.68)
  $offset = [int](($Size - $target) / 2)
  $graphics.DrawImage($Mark, [System.Drawing.Rectangle]::new($offset, $offset, $target, $target))
  $result.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $result.Dispose()
}

$sourceImage = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Source))
$markArea = [System.Drawing.Rectangle]::new(313, 248, 588, 614)
$fullArea = [System.Drawing.Rectangle]::new(155, 248, 952, 790)
Export-Crop $sourceImage $markArea (Join-Path $BrandDirectory "sahaaya-mark.png") 20
Export-Crop $sourceImage $fullArea (Join-Path $BrandDirectory "sahaaya-logo.png") 24
$sourceImage.Dispose()

$mark = [System.Drawing.Bitmap]::FromFile((Resolve-Path (Join-Path $BrandDirectory "sahaaya-mark.png")))
Export-AppIcon $mark 64 "public/favicon.png"
Export-AppIcon $mark 192 (Join-Path $IconDirectory "sahaaya-192.png")
Export-AppIcon $mark 512 (Join-Path $IconDirectory "sahaaya-512.png")
$mark.Dispose()
