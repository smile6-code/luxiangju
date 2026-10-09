# 批量去水印:Edge 无头渲染处理页截图 -> System.Drawing 缩放并转 JPEG
param([string]$Filter = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$edge  = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$src   = 'C:\Users\Triumph\Desktop\codex'
$page  = 'file:///C:/Users/Triumph/Desktop/codex/shandong-restaurant/tools/_wm.html'
$outDir = 'C:\Users\Triumph\Desktop\codex\shandong-restaurant\assets\img\photos'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$tmp = Join-Path $env:TEMP 'wm-shot.png'

# 文件名 -> [输出 id, 目标宽度]
$jobs = @(
  @('九转大肠',       'dish-jiuzhuandachang',  1200),
  @('葱烧海参',       'dish-congshaohaishen',  1200),
  @('爆炒腰花',       'dish-baochaoyaohua',    1200),
  @('德州扒鸡',       'dish-dezhoubaji',       1200),
  @('把子肉',         'dish-bazirou',          1200),
  @('四喜丸子',       'dish-sixiwanzi',        1200),
  @('糖醋黄河鲤鱼',   'dish-tangculiyu',       1200),
  @('油闷大虾',       'dish-youmendaxia',      1200),
  @('奶汤蒲菜',       'dish-naitangpucai',     1200),
  @('五香熏鱼',       'dish-wuxiangxunyu',     1200),
  @('鲁味酱牛肉',     'dish-jiangniurou',      1200),
  @('山东大煎饼',     'dish-shandongjianbing', 1200),
  @('拔丝山药',       'dish-basishanyao',      1200),
  @('明档厨房.火不熄','env-kitchen',           1400),
  @('大厅内部堂食图', 'env-hall-inner',        1200),
  @('堂食大间',       'env-hall',              1200),
  @('老宅天井',       'env-courtyard',         1200),
  @('茉莉花茶',       'env-tea',               1200),
  @('等位图-高清',    'env-waiting',           '1200|jpg')
)

function Save-Jpeg($bmp, $path, $quality) {
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ps = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [int64]$quality)
  $bmp.Save($path, $codec, $ps)
}

foreach ($j in $jobs) {
  $name = $j[0]; $id = $j[1]; $targetW = 1200
  $ext = '.png'
  if ("$($j[2])" -like '*|*') {
    $ext = '.' + ("$($j[2])" -split '\|')[1]
    $targetW = [int]("$($j[2])" -split '\|')[0]
  } else {
    $targetW = [int]$j[2]
  }
  if ($Filter -and $id -notlike "*$Filter*") { continue }

  $png = $src + [IO.Path]::DirectorySeparatorChar + $name + $ext
  if (-not (Test-Path -LiteralPath $png)) { Write-Output "跳过(找不到): $name$ext"; continue }

  $img = [System.Drawing.Image]::FromFile($png)
  $imgW = $img.Width; $imgH = $img.Height
  $img.Dispose()

  # 水印矩形按检测到的相对位置换算
  $rx = [int]($imgW * 0.8398); $ry = [int]($imgH * 0.8705)
  $rw = [int]($imgW * 0.1507); $rh = [int]($imgH * 0.1205)

  $url = "$page`?f=$([uri]::EscapeDataString($name))&ext=$ext&x=$rx&y=$ry&w=$rw&h=$rh"
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  & $edge --headless=new --disable-gpu --no-first-run `
    --user-data-dir="$env:TEMP\edgeprof-wm" --hide-scrollbars `
    --allow-file-access-from-files `
    --virtual-time-budget=60000 "--window-size=$imgW,$imgH" --screenshot="$tmp" $url 2>$null | Out-Null

  if (-not (Test-Path -LiteralPath $tmp)) { Write-Output "失败(未产出): $name"; continue }

  $shot = [System.Drawing.Image]::FromFile($tmp)
  $newH = [int][math]::Round($shot.Height * $targetW / $shot.Width)
  $bmp = New-Object System.Drawing.Bitmap $targetW, $newH
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($shot, 0, 0, $targetW, $newH)
  $g.Dispose(); $shot.Dispose()

  $dest = Join-Path $outDir ($id + '.jpg')
  Save-Jpeg $bmp $dest 86
  $bmp.Dispose()

  $kb = [math]::Round((Get-Item $dest).Length / 1KB)
  Write-Output ("{0,-24} {1,5}x{2,-5} {3,5}KB  矩形 {4},{5} {6}x{7}" -f $id, $targetW, $newH, $kb, $rx, $ry, $rw, $rh)
}
Write-Output "输出目录: $outDir"
