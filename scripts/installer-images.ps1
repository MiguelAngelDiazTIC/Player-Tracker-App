# Genera las imagenes del instalador (NSIS) a partir del icono de la app:
#   src-tauri/installer/header.bmp   150 x 57   (cabecera de cada pagina)
#   src-tauri/installer/sidebar.bmp  164 x 314  (bienvenida y final)
# Uso: pwsh scripts/installer-images.ps1
# Hay que volver a lanzarlo si cambia el logo (despues de `npx tauri icon`).

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$icon = [System.Drawing.Image]::FromFile((Join-Path $root "src-tauri/icons/icon.png"))
$out = Join-Path $root "src-tauri/installer"
New-Item -ItemType Directory -Force $out | Out-Null

# El degradado del fondo de la app: malva a lima.
$mauve = [System.Drawing.ColorTranslator]::FromHtml("#C9A4CB")
$lime = [System.Drawing.ColorTranslator]::FromHtml("#D8F5BC")
$ink = [System.Drawing.ColorTranslator]::FromHtml("#141414")

function New-InstallerImage {
  param(
    [int]$Width,
    [int]$Height,
    [float]$Angle,
    [scriptblock]$Draw,
    [string]$Name
  )
  # 24 bits sin canal alfa: es lo que NSIS sabe pintar.
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = "AntiAlias"
  $graphics.InterpolationMode = "HighQualityBicubic"
  $graphics.TextRenderingHint = "AntiAliasGridFit"
  $area = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($area, $mauve, $lime, $Angle)
  $graphics.FillRectangle($brush, $area)
  & $Draw $graphics
  $bitmap.Save((Join-Path $out $Name), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $brush.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

New-InstallerImage -Width 150 -Height 57 -Angle 0 -Name "header.bmp" -Draw {
  param($graphics)
  $graphics.DrawImage($icon, 99, 8, 41, 41)
}

New-InstallerImage -Width 164 -Height 314 -Angle 90 -Name "sidebar.bmp" -Draw {
  param($graphics)
  $graphics.DrawImage($icon, 42, 84, 80, 80)
  $font = [System.Drawing.Font]::new("Segoe UI", 15, [System.Drawing.FontStyle]::Bold)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = "Center"
  $text = [System.Drawing.SolidBrush]::new($ink)
  $graphics.DrawString("MikaLog", $font, $text, [System.Drawing.RectangleF]::new(0, 176, 164, 32), $format)
  $font.Dispose(); $text.Dispose(); $format.Dispose()
}

$icon.Dispose()
Write-Output "Imagenes del instalador en $out"
