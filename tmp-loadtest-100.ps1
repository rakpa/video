# 100 simultaneous desktop 1080p downloads — production (vidcliply.com backend)
$api = 'https://clipvault-api-production.up.railway.app'

# 100 unique YouTube IDs (mix of short clips, music, popular videos)
$ids = @(
  'aqz-KE-bpKQ','jNQXAC9IVRw','M7lc1UVf-VE','ZZ5LpwO-An4','oHg5SJYRHA0','NF-kLy44BGA',
  'FTQbiNvZqaY','IO9XJXDXcF0','ScMzIvxBSi4','dQw4w9WgXcQ','L_jWHffIx5E','RgKAFyr5Sl4',
  'YQHsXMglC9A','SlPhMPnEX4A','fLexgOxsZu0','hTWKbfoikeg','09839DpTctU','hFZFjoX2cGg',
  'astISOttQS0','lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4','CevxZvSJLk8','1xw4S-hfeAk',
  'pRpeEdMmmQ0','e-ORhEE9VVg','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4',
  'YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','07QASMagLgM','Zi_XLOBDo_Y',
  'QDYDrRU3Hrc','J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4','R7E9S55L7A0',
  'RBumgq5yV7A','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','60ItHLz0Waa','uelHwf8o7_U',
  'kJQP7ki5MkU','9bZkp7q19f0','yPYZ_pyOmTk','ALZHFhU2UWs','V1bFr2CW1qI','fJ9rUzIMcZQ',
  'QJO3RPMTJxQ','hTWKbfoikeg','nCDQLDvEJoU','8UVNT4wvIGY','YQHsXMglC9A','QH2-TGUlwu4',
  'gCYcHz2k0xY','09R8_2nJtjg','uelHwf8o7_U','uelHwf8o7_U','uelHwf8o7_U','uelHwf8o7_U'
)
# Dedupe and pad to 100 with suffix variants on short ids
$unique = [System.Collections.Generic.HashSet[string]]::new()
$urls = @()
foreach ($id in $ids) {
  if ($unique.Add($id)) { $urls += "https://www.youtube.com/watch?v=$id" }
}
# Add more unique IDs to reach 100
$extra = @(
  'BROWqjuT0d4','tVj0jTs-r1o','0KSOMA3QBU0','fLexgOxsZu0','ktvTqknDobU','cLQZKbTaS1g',
  'Zi_XLOBDo_Y','QH2-TGUlwu4','uelHwf8o7_U','60ItHLz0Waa','OPf0YbXqDm0','y6120QOlsfU',
  'RBumgq5yV7A','R7E9S55L7A0','kffacxfA7G4','450p7goxZqg','Y1xsXRihNhQ','J---aiyznGQ',
  'QDYDrRU3Hrc','Zi_XLOBDo_Y','07QASMagLgM','5GL9JoH4Sws','ZbZSe6N_BXs','YlUKcNNmywk',
  'YVkUvmDQ3HY','hT_nv6nkjQ4','PIh2-ezDown8','3JZ_D3XPZSA','7wtfSzwfglw','e-ORhEE9VVg',
  'pRpeEdMmmQ0','1xw4S-hfeAk','CevxZvSJLk8','QH2-TGUlwu4','2Vv-BfVoq4g','lp-EO5I60KA',
  'astISOttQS0','hFZFjoX2cGg','09839DpTctU','SlPhMPnEX4A','YQHsXMglC9A','RgKAFyr5Sl4',
  'L_jWHffIx5E','ScMzIvxBSi4','IO9XJXDXcF0','FTQbiNvZqaY','NF-kLy44BGA','oHg5SJYRHA0',
  'ZZ5LpwO-An4','jNQXAC9IVRw','aqz-KE-bpKQ','M7lc1UVf-VE','dQw4w9WgXcQ','kJQP7ki5MkU',
  '9bZkp7q19f0','fRh_vgS2dFE','V1bFr2CW1qI','ALZHFhU2UWs','yPYZ_pyOmTk','QJO3RPMTJxQ',
  'fJ9rUzIMcZQ','nCDQLDvEJoU','8UVNT4wvIGY','gCYcHz2k0xY','09R8_2nJtjg','BROWqjuT0d4',
  'tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU','cLQZKbTaS1g','hTWKbfoikeg','fLexgOxsZu0'
)
foreach ($id in $extra) {
  if ($urls.Count -ge 100) { break }
  if ($unique.Add($id)) { $urls += "https://www.youtube.com/watch?v=$id" }
}
# Still short? append query-param variants (same video, different URL string — still unique request keys)
$i = 0
while ($urls.Count -lt 100) {
  $base = $urls[$i % $urls.Count]
  $vid = if ($base -match 'v=([^&]+)') { $matches[1] } else { "x$i" }
  $variant = "https://www.youtube.com/watch?v=$vid&list=RD$i"
  if ($unique.Add($variant)) { $urls += $variant }
  $i++
}

$count = $urls.Count
Write-Host "=== $count parallel 1080p downloads @ $api ===" -ForegroundColor Cyan
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt $count; $i++) {
  $idx = $i + 1
  $u = $urls[$i]
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{
      index = $Index; url = $Url; infoMs = $null; startMs = $null; totalMs = $null
      path = $null; status = 'pending'; error = $null; finalPct = $null; directHeight = $null
    }
    try {
      $infoSw = [System.Diagnostics.Stopwatch]::StartNew()
      $infoRes = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body (@{url=$Url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $infoSw.Stop()
      $result.infoMs = [int]$infoSw.ElapsedMilliseconds

      $startSw = [System.Diagnostics.Stopwatch]::StartNew()
      $dlRes = Invoke-RestMethod -Uri "$ApiBase/api/download" -Method POST -Body (@{url=$Url;quality='1080';mode='best'}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $startSw.Stop()
      $result.startMs = [int]$startSw.ElapsedMilliseconds

      if ($dlRes.direct -and $dlRes.url) {
        $result.path = 'direct-cdn'
        $result.status = 'direct'
        $result.directHeight = $dlRes.height
        $sw.Stop()
        $result.totalMs = [int]$sw.ElapsedMilliseconds
        return [pscustomobject]$result
      }
      if (-not $dlRes.jobId) {
        $result.status = 'failed'; $result.error = 'No jobId/direct'
        $sw.Stop(); $result.totalMs = [int]$sw.ElapsedMilliseconds
        return [pscustomobject]$result
      }
      $jobId = $dlRes.jobId
      $deadline = (Get-Date).AddMinutes(5)
      $lastPct = 0
      while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 2000
        try { $st = Invoke-RestMethod -Uri "$ApiBase/api/file/$jobId/status" -TimeoutSec 30 } catch { continue }
        if ($st.progress -and $null -ne $st.progress.percent) { $lastPct = [math]::Round($st.progress.percent, 1) }
        if ($st.status -eq 'ready') {
          $result.path = 'job-pipeline'; $result.status = 'ready'; $result.finalPct = 100
          $sw.Stop(); $result.totalMs = [int]$sw.ElapsedMilliseconds
          return [pscustomobject]$result
        }
        if ($st.status -eq 'error' -or $st.galleryFailed) {
          $result.path = 'job-pipeline'; $result.status = 'error'; $result.error = $st.message
          $result.finalPct = $lastPct; $sw.Stop(); $result.totalMs = [int]$sw.ElapsedMilliseconds
          return [pscustomobject]$result
        }
      }
      $result.path = 'job-pipeline'; $result.status = 'timeout'; $result.finalPct = $lastPct
      $result.error = 'Timed out 5min'; $sw.Stop(); $result.totalMs = [int]$sw.ElapsedMilliseconds
      return [pscustomobject]$result
    } catch {
      $sw.Stop(); $result.status = 'failed'; $result.error = $_.Exception.Message
      $result.totalMs = [int]$sw.ElapsedMilliseconds
      return [pscustomobject]$result
    }
  }
}

Write-Host "Launched $count jobs, waiting..."
$results = @($jobs | Wait-Job | Receive-Job)
$jobs | Remove-Job -Force
$overall.Stop()

$ok = @($results | Where-Object { $_.status -in @('ready','direct') })
$direct = @($ok | Where-Object { $_.path -eq 'direct-cdn' })
$jobOk = @($ok | Where-Object { $_.path -eq 'job-pipeline' })
$failed = @($results | Where-Object { $_.status -notin @('ready','direct') })

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total: $count | Success: $($ok.Count) | Failed: $($failed.Count)"
Write-Host "Direct CDN: $($direct.Count) | Job pipeline OK: $($jobOk.Count)"
Write-Host "Wall-clock: $([math]::Round($overall.ElapsedMilliseconds/1000))s"

if ($ok.Count -gt 0) {
  $times = @($ok | ForEach-Object { $_.totalMs } | Sort-Object)
  $med = $times[[math]::Floor($times.Count / 2)]
  Write-Host "Success times - min: $($times[0])ms | median: ${med}ms | max: $($times[-1])ms"
  if ($direct.Count -gt 0) {
    $dTimes = @($direct | ForEach-Object { $_.totalMs } | Sort-Object)
    Write-Host "Direct CDN times - min: $($dTimes[0])ms | max: $($dTimes[-1])ms"
  }
}

Write-Host ""
Write-Host "=== FAILURES BY STATUS ===" -ForegroundColor Yellow
$failed | Group-Object status | Sort-Object Count -Descending | Format-Table Name, Count -AutoSize

Write-Host "=== FASTEST 15 ===" -ForegroundColor Green
$ok | Sort-Object totalMs | Select-Object -First 15 | Format-Table index, status, path, totalMs, infoMs, startMs, directHeight -AutoSize

Write-Host "=== SLOWEST 10 FAILURES ===" -ForegroundColor Red
$failed | Sort-Object totalMs -Descending | Select-Object -First 10 | Format-Table index, status, totalMs, error -AutoSize

# Save full results
$results | Export-Csv -Path "C:\Users\rakpa\video\tmp-loadtest-100-results.csv" -NoTypeInformation
Write-Host "Full results: tmp-loadtest-100-results.csv"
