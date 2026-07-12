$api = 'https://clipvault-api-production.up.railway.app'
$ytdlp = 'yt-dlp'
$target = 100

$existing = @()
if (Test-Path 'C:\Users\rakpa\video\tmp-loadtest-100-unique-validated.csv') {
  $existing = @(Import-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-validated.csv')
}
$have = @{}; foreach ($e in $existing) { $have[$e.id] = $true }
$validated = @($existing)

Write-Host "Starting with $($validated.Count) validated URLs"

if ($validated.Count -lt $target) {
  Write-Host "Fetching more IDs via yt-dlp search..."
  $searches = @(
    'ytsearch80:official music video',
    'ytsearch80:viral youtube video',
    'ytsearch80:documentary short',
    'ytsearch80:comedy sketch official'
  )
  foreach ($q in $searches) {
    if ($validated.Count -ge $target) { break }
    $lines = & $ytdlp $q --skip-download --no-warnings --print "%(id)s|%(title)s" 2>$null
    foreach ($line in $lines) {
      if ($validated.Count -ge $target) { break }
      if (-not $line -or $line -notmatch '^([A-Za-z0-9_-]{11})\|(.+)$') { continue }
      $id = $Matches[1]; $title = $Matches[2]
      if ($have[$id]) { continue }
      $url = "https://www.youtube.com/watch?v=$id"
      try {
        $check = & $ytdlp --skip-download --no-warnings --print duration "$url" 2>$null
        if ($check) {
          $have[$id] = $true
          $validated += [pscustomobject]@{ url=$url; id=$id; title=$title; duration=$check }
          Write-Host "ADD $($validated.Count): $id"
        }
      } catch {}
      Start-Sleep -Milliseconds 80
    }
  }
}

$testCount = [Math]::Min($target, $validated.Count)
Write-Host "Unique validated for test: $testCount"
$validated | Select-Object -First $testCount | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-validated.csv' -NoTypeInformation
if ($testCount -lt $target) { Write-Host "Could not reach $target unique URLs (got $testCount)" -ForegroundColor Yellow }

Write-Host "Pre-warm $testCount URLs..."
$warmOk = 0
foreach ($v in ($validated | Select-Object -First $testCount)) {
  try { $null = Invoke-RestMethod -Uri "$api/api/info" -Method POST -Body (@{url=$v.url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 90; $warmOk++ } catch { Write-Host "warm fail $($v.id)" }
  Start-Sleep -Milliseconds 250
}
Write-Host "Warm $warmOk/$testCount. Cooldown 90s..."
Start-Sleep -Seconds 90

Write-Host "=== $testCount simultaneous downloads ==="
$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt $testCount; $i++) {
  $idx = $i + 1; $u = $validated[$i].url
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{ index=$Index; url=$Url; videoId=($Url -replace '.*v=',''); totalMs=$null; path=$null; status='pending'; error=$null; directHeight=$null; title=$null }
    try {
      $infoRes = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body (@{url=$Url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      if ($infoRes.title) { $result.title = $infoRes.title.Substring(0,[Math]::Min(45,$infoRes.title.Length)) }
      $dlRes = Invoke-RestMethod -Uri "$ApiBase/api/download" -Method POST -Body (@{url=$Url;quality='1080';mode='best'}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      if ($dlRes.direct -and $dlRes.url) { $result.path='direct-cdn'; $result.status='direct'; $result.directHeight=$dlRes.height; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      if (-not $dlRes.jobId) { $result.status='failed'; $result.error='No jobId'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      $jobId = $dlRes.jobId; $deadline = (Get-Date).AddMinutes(6)
      while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 2000
        try { $st = Invoke-RestMethod -Uri "$ApiBase/api/file/$jobId/status" -TimeoutSec 30 } catch { continue }
        if ($st.status -eq 'ready') { $result.path='job-pipeline'; $result.status='ready'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
        if ($st.status -eq 'error') { $result.status='error'; $result.error=$st.message; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      }
      $result.status='timeout'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
    } catch { $sw.Stop(); $result.status='failed'; $result.error=$_.Exception.Message; $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
  }
}
$results = @($jobs | Wait-Job | Receive-Job); $jobs | Remove-Job -Force; $overall.Stop()
$ok = @($results | Where-Object { $_.status -in @('direct','ready') })
$direct = @($ok | Where-Object { $_.path -eq 'direct-cdn' })
$failed = @($results | Where-Object { $_.status -notin @('direct','ready') })

Write-Host ""
Write-Host "=== FINAL: $testCount DIFFERENT PUBLIC URLs ===" -ForegroundColor Cyan
Write-Host "Success: $($ok.Count)/$testCount ($([math]::Round(100*$ok.Count/$testCount,1))%)"
Write-Host "Direct CDN: $($direct.Count) | Job pipeline: $($ok.Count - $direct.Count) | Failed: $($failed.Count)"
Write-Host "Wall-clock: $([math]::Round($overall.ElapsedMilliseconds/1000))s"
if ($ok.Count -gt 0) {
  $t = @($ok.totalMs | Sort-Object)
  Write-Host "Time min/p50/p95/max: $($t[0]) / $($t[[math]::Floor($t.Count/2)]) / $($t[[math]::Min($t.Count-1,[math]::Floor($t.Count*0.95))]) / $($t[-1]) ms"
}
$failed | Group-Object status | Format-Table Name, Count -AutoSize
$failed | Group-Object { if ($_.error -match '422') {'422'} elseif ($_.error -match '402') {'402'} else {'other'} } | Format-Table Name, Count -AutoSize
$ok | Sort-Object totalMs | Select-Object -First 10 | Format-Table index, status, totalMs, directHeight, title -AutoSize
$results | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-results.csv' -NoTypeInformation
Write-Host "Saved results CSV"
