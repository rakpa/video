# Validate + load test 50-100 PUBLIC YouTube URLs (production = vidcliply.com backend)
$api = 'https://clipvault-api-production.up.railway.app'
$targetCount = 80  # between 50-100

# Large pool of well-known PUBLIC YouTube videos (music, viral, trailers, tutorials)
$candidateIds = @(
  'dQw4w9WgXcQ','kJQP7ki5MkU','9bZkp7q19f0','jNQXAC9IVRw','aqz-KE-bpKQ','ZZ5LpwO-An4',
  'oHg5SJYRHA0','NF-kLy44BGA','FTQbiNvZqaY','RgKAFyr5Sl4','L_jWHffIx5E','hTWKbfoikeg',
  '09839DpTctU','fLexgOxsZu0','YQHsXMglC9A','SlPhMPnEX4A','hFZFjoX2cGg','astISOttQS0',
  'lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4','CevxZvSJLk8','1xw4S-hfeAk','pRpeEdMmmQ0',
  'e-ORhEE9VVg','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4','YVkUvmDQ3HY',
  'YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','07QASMagLgM','Zi_XLOBDo_Y','QDYDrRU3Hrc',
  'J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4','R7E9S55L7A0','RBumgq5yV7A',
  'fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','60ItHLz0Waa','uelHwf8o7_U','yPYZ_pyOmTk',
  'ALZHFhU2UWs','V1bFr2CW1qI','fJ9rUzIMcZQ','QJO3RPMTJxQ','nCDQLDvEJoU','8UVNT4wvIGY',
  'gCYcHz2k0xY','09R8_2nJtjg','BROWqjuT0d4','tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU',
  'cLQZKbTaS1g','fJ9rUzIMcZQ','QH2-TGUlwu4','Zi_XLOBDo_Y','ScMzIvxBSi4','IO9XJXDXcF0',
  'M7lc1UVf-VE','Ye7FKc1CgKy0','kXYiU_JCYtU','N_lWpVIQOxQ','fRh_vgS2dFE','uelHwf8o7_U',
  '60ItHLz0Waa','OPf0YbXqDm0','y6120QOlsfU','RgKAFyr5Sl4','L_jWHffIx5E','ZZ5LpwO-An4',
  'oHg5SJYRHA0','NF-kLy44BGA','FTQbiNvZqaY','aqz-KE-bpKQ','jNQXAC9IVRw','dQw4w9WgXcQ',
  'kJQP7ki5MkU','9bZkp7q19f0','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0','YQHsXMglC9A',
  'SlPhMPnEX4A','hFZFjoX2cGg','astISOttQS0','lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4',
  'CevxZvSJLk8','1xw4S-hfeAk','pRpeEdMmmQ0','e-ORhEE9VVg','7wtfSzwfglw','3JZ_D3XPZSA',
  'PIh2-ezDown8','hT_nv6nkjQ4','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws',
  '07QASMagLgM','QDYDrRU3Hrc','J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4',
  'R7E9S55L7A0','RBumgq5yV7A','fRh_vgS2dFE','yPYZ_pyOmTk','ALZHFhU2UWs','V1bFr2CW1qI',
  'QJO3RPMTJxQ','nCDQLDvEJoU','8UVNT4wvIGY','gCYcHz2k0xY','09R8_2nJtjg','BROWqjuT0d4',
  'tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU','cLQZKbTaS1g','fJ9rUzIMcZQ','Zi_XLOBDo_Y'
)

$seen = @{}
$candidates = @()
foreach ($id in $candidateIds) {
  if ($seen.ContainsKey($id)) { continue }
  $seen[$id] = $true
  $candidates += "https://www.youtube.com/watch?v=$id"
}

Write-Host "=== PHASE 1: Validate public URLs via /api/info ===" -ForegroundColor Cyan
Write-Host "Candidates: $($candidates.Count) | Target for load test: $targetCount"

$validateJobs = @()
for ($i = 0; $i -lt $candidates.Count; $i++) {
  $u = $candidates[$i]
  $validateJobs += Start-Job -ArgumentList $u, $api -ScriptBlock {
    param($Url, $ApiBase)
    try {
      $body = @{ url = $Url } | ConvertTo-Json -Compress
      $r = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 90
      return [pscustomobject]@{ url = $Url; ok = $true; title = $r.title; duration = $r.durationSeconds }
    } catch {
      return [pscustomobject]@{ url = $Url; ok = $false; title = $null; duration = $null; error = $_.Exception.Message }
    }
  }
}

$validated = @($validateJobs | Wait-Job | Receive-Job | Where-Object { $_.ok })
$validateJobs | Remove-Job -Force

Write-Host "Valid public URLs: $($validated.Count)"
if ($validated.Count -lt 50) {
  Write-Host "WARNING: fewer than 50 valid URLs - proceeding with $($validated.Count)" -ForegroundColor Yellow
}

$testUrls = @($validated | Select-Object -First $targetCount | ForEach-Object { $_.url })
$testCount = $testUrls.Count

Write-Host ""
Write-Host "=== PHASE 2: $testCount simultaneous 1080p downloads ===" -ForegroundColor Cyan
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt $testCount; $i++) {
  $idx = $i + 1
  $u = $testUrls[$i]
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{
      index = $Index; url = $Url; infoMs = $null; startMs = $null; totalMs = $null
      path = $null; status = 'pending'; error = $null; finalPct = $null; directHeight = $null; title = $null
    }
    try {
      $infoSw = [System.Diagnostics.Stopwatch]::StartNew()
      $infoRes = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body (@{url=$Url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $infoSw.Stop()
      $result.infoMs = [int]$infoSw.ElapsedMilliseconds
      if ($infoRes.title) { $result.title = $infoRes.title.Substring(0, [Math]::Min(50, $infoRes.title.Length)) }

      $startSw = [System.Diagnostics.Stopwatch]::StartNew()
      $dlRes = Invoke-RestMethod -Uri "$ApiBase/api/download" -Method POST -Body (@{url=$Url;quality='1080';mode='best'}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $startSw.Stop()
      $result.startMs = [int]$startSw.ElapsedMilliseconds

      if ($dlRes.direct -and $dlRes.url) {
        $result.path = 'direct-cdn'; $result.status = 'direct'; $result.directHeight = $dlRes.height
        $sw.Stop(); $result.totalMs = [int]$sw.ElapsedMilliseconds
        return [pscustomobject]$result
      }
      if (-not $dlRes.jobId) {
        $result.status = 'failed'; $result.error = 'No jobId/direct'
        $sw.Stop(); $result.totalMs = [int]$sw.ElapsedMilliseconds
        return [pscustomobject]$result
      }
      $jobId = $dlRes.jobId
      $deadline = (Get-Date).AddMinutes(6)
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
      $result.error = 'Timed out 6min'; $sw.Stop(); $result.totalMs = [int]$sw.ElapsedMilliseconds
      return [pscustomobject]$result
    } catch {
      $sw.Stop(); $result.status = 'failed'; $result.error = $_.Exception.Message
      $result.totalMs = [int]$sw.ElapsedMilliseconds
      return [pscustomobject]$result
    }
  }
}

Write-Host "Launched $testCount download jobs..."
$results = @($jobs | Wait-Job | Receive-Job)
$jobs | Remove-Job -Force
$overall.Stop()

$ok = @($results | Where-Object { $_.status -in @('ready','direct') })
$direct = @($ok | Where-Object { $_.path -eq 'direct-cdn' })
$pipeline = @($ok | Where-Object { $_.path -eq 'job-pipeline' })
$failed = @($results | Where-Object { $_.status -notin @('ready','direct') })

Write-Host ""
Write-Host "=== SUMMARY (validated public URLs only) ===" -ForegroundColor Cyan
Write-Host "Tested: $testCount | Success: $($ok.Count) ($([math]::Round(100*$ok.Count/$testCount,1))%) | Failed: $($failed.Count)"
Write-Host "Direct CDN: $($direct.Count) | Job pipeline: $($pipeline.Count)"
Write-Host "Wall-clock: $([math]::Round($overall.ElapsedMilliseconds/1000))s"

if ($ok.Count -gt 0) {
  $times = @($ok | ForEach-Object { $_.totalMs } | Sort-Object)
  $med = $times[[math]::Floor($times.Count / 2)]
  Write-Host "Success time - min: $($times[0])ms | median: ${med}ms | max: $($times[-1])ms"
}

Write-Host ""
Write-Host "=== FAILURES ===" -ForegroundColor Yellow
$failed | Group-Object status | Format-Table Name, Count -AutoSize

Write-Host "=== TOP 10 FASTEST ===" -ForegroundColor Green
$ok | Sort-Object totalMs | Select-Object -First 10 | Format-Table index, status, path, totalMs, directHeight, title -AutoSize

$results | Export-Csv -Path "C:\Users\rakpa\video\tmp-loadtest-public-results.csv" -NoTypeInformation
Write-Host "Saved: tmp-loadtest-public-results.csv"
