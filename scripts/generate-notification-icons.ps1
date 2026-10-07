# Script to generate 13 notification icons in 128x128 PNG format with transparent background and white Material Symbols (error red)

$symbols = @(
  @{ name = 'plan-dev'; symbol = 'code'; color = '#ffffff' },
  @{ name = 'plan-service'; symbol = 'build'; color = '#ffffff' },
  @{ name = 'plan-queue'; symbol = 'inbox'; color = '#ffffff' },
  @{ name = 'plan-completed'; symbol = 'check'; color = '#ffffff' },
  @{ name = 'plan-critical'; symbol = 'warning'; color = '#ef4444' },
  @{ name = 'quickCap'; symbol = 'crop'; color = '#ffffff' },
  @{ name = 'colorMaster'; symbol = 'colorize'; color = '#ffffff' },
  @{ name = 'screenRuler'; symbol = 'straighten'; color = '#ffffff' },
  @{ name = 'syncComplete'; symbol = 'sync'; color = '#ffffff' },
  @{ name = 'update'; symbol = 'upgrade'; color = '#ffffff' },
  @{ name = 'clipboard'; symbol = 'content_copy'; color = '#ffffff' },
  @{ name = 'error'; symbol = 'error'; color = '#ef4444' },
  @{ name = 'test'; symbol = 'notifications_active'; color = '#ffffff' },
  @{ name = 'feedback-bug'; symbol = 'bug_report'; color = '#f43f5e' },
  @{ name = 'feedback-idea'; symbol = 'lightbulb'; color = '#a855f7' },
  @{ name = 'feedback-other'; symbol = 'chat'; color = '#0ea5e9' },
  @{ name = 'feedback-resolved'; symbol = 'check_circle'; color = '#10b981' }
)

$edgePath = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
  $edgePath = "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
}

$tmpDir = "c:\development\IADonkey\scratch\notif_gen"
if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
}

$targetDirs = @(
  "c:\development\IADonkey\electron\assets\notifications",
  "c:\development\IADonkey\dist-electron\assets\notifications"
)

foreach ($item in $symbols) {
  $url = "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/$($item.symbol)/default/24px.svg"
  Write-Host "Fetching $($item.name) ($($item.symbol))..."
  $svgRaw = (Invoke-WebRequest -Uri $url -UseBasicParsing).Content
  
  if ($svgRaw -match '<path\s+d="([^"]+)"') {
    $d = $matches[1]
  } else {
    Write-Error "Could not extract path for $($item.name)"
    continue
  }

  $htmlContent = @"
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 128px;
    height: 128px;
    overflow: hidden;
    background: transparent;
  }
</style>
</head>
<body>
  <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <svg x="16" y="16" width="96" height="96" viewBox="0 -960 960 960">
      <path d="$d" fill="$($item.color)"/>
    </svg>
  </svg>
</body>
</html>
"@

  $htmlFile = Join-Path $tmpDir "$($item.name).html"
  $pngFile = Join-Path $tmpDir "$($item.name).png"
  Set-Content -Path $htmlFile -Value $htmlContent -Encoding UTF8

  $fileUri = [System.Uri]::new($htmlFile).AbsoluteUri
  & $edgePath --headless --screenshot="$pngFile" --window-size=128,128 --default-background-color=00000000 --hide-scrollbars "$fileUri" 2>&1 | Out-Null

  Start-Sleep -Milliseconds 300

  if (Test-Path $pngFile) {
    Write-Host "Generated: $($item.name).png"
    foreach ($outDir in $targetDirs) {
      if (Test-Path $outDir) {
        Copy-Item -Path $pngFile -Destination (Join-Path $outDir "$($item.name).png") -Force
      }
    }
  } else {
    Write-Error "Failed to generate PNG for $($item.name)"
  }
}

Write-Host "All icons generated successfully!"
