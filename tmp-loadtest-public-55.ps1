# Build 50-60 validated PUBLIC urls sequentially, then simultaneous download test
$api = 'https://clipvault-api-production.up.railway.app'
$ids = @(
  'dQw4w9WgXcQ','kJQP7ki5MkU','9bZkp7q19f0','jNQXAC9IVRw','aqz-KE-bpKQ','ZZ5LpwO-An4','oHg5SJYRHA0',
  'NF-kLy44BGA','FTQbiNvZqaY','RgKAFyr5Sl4','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0',
  'YQHsXMglC9A','SlPhMPnEX4A','hFZFjoX2cGg','astISOttQS0','lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4',
  'CevxZvSJLk8','1xw4S-hfeAk','pRpeEdMmmQ0','e-ORhEE9VVg','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8',
  'hT_nv6nkjQ4','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','07QASMagLgM','Zi_XLOBDo_Y',
  'QDYDrRU3Hrc','J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4','R7E9S55L7A0','RBumgq5yV7A',
  'fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','60ItHLz0Waa','uelHwf8o7_U','yPYZ_pyOmTk','ALZHFhU2UWs',
  'V1bFr2CW1qI','fJ9rUzIMcZQ','QJO3RPMTJxQ','nCDQLDvEJoU','8UVNT4wvIGY','gCYcHz2k0xY','09R8_2nJtjg',
  'BROWqjuT0d4','tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ',
  'ScMzIvxBSi4','IO9XJXDXcF0','M7lc1UVf-VE','Ye7FKc1CgKy0','fRh_vgS2dFE','Zi_XLOBDo_Y','RgKAFyr5Sl4',
  'L_jWHffIx5E','ZZ5LpwO-An4','oHg5SJYRHA0','NF-kLy44BGA','FTQbiNvZqaY','aqz-KE-bpKQ','jNQXAC9IVRw',
  'hTWKbfoikeg','09839DpTctU','fLexgOxsZu0','YQHsXMglC9A','SlPhMPnEX4A','hFZFjoX2cGg','astISOttQS0',
  'lp-EO5I60KA','2Vv-BfVoq4g','QH2-TGUlwu4','CevxZvSJLk8','1xw4S-hfeAk','pRpeEdMmmQ0','e-ORhEE9VVg',
  '7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs',
  '5GL9JoH4Sws','07QASMagLgM','QDYDrRU3Hrc','J---aiyznGQ','Y1xsXRihNhQ','450p7goxZqg','kffacxfA7G4',
  'R7E9S55L7A0','RBumgq5yV7A','yPYZ_pyOmTk','ALZHFhU2UWs','V1bFr2CW1qI','QJO3RPMTJxQ','nCDQLDvEJoU',
  '8UVNT4wvIGY','gCYcHz2k0xY','09R8_2nJtjg','BROWqjuT0d4','tVj0jTs-r1o','0KSOMA3QBU0','ktvTqknDobU',
  'cLQZKbTaS1g','fRh_vgS2dFE','uelHwf8o7_U','60ItHLz0Waa','OPf0YbXqDm0','y6120QOlsfU','RgKAFyr5Sl4',
  'L_jWHffIx5E','ZZ5LpwO-An4','oHg5SJYRHA0','NF-kLy44BGA','FTQbiNvZqaY','aqz-KE-bpKQ','jNQXAC9IVRw',
  'dQw4w9WgXcQ','kJQP7ki5MkU','9bZkp7q19f0','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0','YQHsXMglC9A'
) | Select-Object -Unique

Write-Host "=== Validate $($ids.Count) unique public YouTube IDs (sequential) ===" -ForegroundColor Cyan
$valid = @()
foreach ($id in $ids) {
  if ($valid.Count -ge 55) { break }
  $url = "https://www.youtube.com/watch?v=$id"
  try {
    $r = Invoke-RestMethod -Uri "$api/api/info" -Method POST -Body (@{url=$url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 60
    if ($r.title) {
      $valid += [pscustomobject]@{ url = $url; title = $r.title; duration = $r.durationSeconds }
      Write-Host ("OK $($valid.Count): $id")
    }
  } catch {
    Write-Host ("SKIP $id")
  }
  Start-Sleep -Milliseconds 400
}

$testCount = $valid.Count
Write-Host "Validated public URLs: $testCount"
if ($testCount -lt 50) { Write-Host "Only $testCount valid - running all" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== $testCount simultaneous 1080p downloads ===" -ForegroundColor Cyan
$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt $testCount; $i++) {
  $idx = $i + 1
  $u = $valid[$i].url
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{ index=$Index; url=$Url; infoMs=$null; startMs=$null; totalMs=$null; path=$null; status='pending'; error=$null; directHeight=$null; title=$null }
    try {
      $t0 = [System.Diagnostics.Stopwatch]::StartNew()
      $infoRes = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body (@{url=$Url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $t0.Stop(); $result.infoMs = [int]$t0.ElapsedMilliseconds
      if ($infoRes.title) { $result.title = $infoRes.title.Substring(0,[Math]::Min(45,$infoRes.title.Length)) }
      $t1 = [System.Diagnostics.Stopwatch]::StartNew()
      $dlRes = Invoke-RestMethod -Uri "$ApiBase/api/download" -Method POST -Body (@{url=$Url;quality='1080';mode='best'}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $t1.Stop(); $result.startMs = [int]$t1.ElapsedMilliseconds
      if ($dlRes.direct -and $dlRes.url) {
        $result.path='direct-cdn'; $result.status='direct'; $result.directHeight=$dlRes.height
        $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
      }
      if (-not $dlRes.jobId) { $result.status='failed'; $result.error='No jobId'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      $jobId = $dlRes.jobId
      $deadline = (Get-Date).AddMinutes(6)
      while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 2000
        try { $st = Invoke-RestMethod -Uri "$ApiBase/api/file/$jobId/status" -TimeoutSec 30 } catch { continue }
        if ($st.status -eq 'ready') { $result.path='job-pipeline'; $result.status='ready'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
        if ($st.status -eq 'error') { $result.path='job-pipeline'; $result.status='error'; $result.error=$st.message; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      }
      $result.status='timeout'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
    } catch {
      $sw.Stop(); $result.status='failed'; $result.error=$_.Exception.Message; $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
    }
  }
}

$results = @($jobs | Wait-Job | Receive-Job)
$jobs | Remove-Job -Force
$overall.Stop()

$ok = @($results | Where-Object { $_.status -in @('ready','direct') })
$failed = @($results | Where-Object { $_.status -notin @('ready','direct') })
$direct = @($ok | Where-Object { $_.path -eq 'direct-cdn' })

Write-Host ""
Write-Host "=== FINAL SUMMARY ===" -ForegroundColor Cyan
Write-Host "Public URLs tested: $testCount"
Write-Host "Success: $($ok.Count) ($([math]::Round(100*$ok.Count/[Math]::Max(1,$testCount),1))%) | Failed: $($failed.Count)"
Write-Host "Direct CDN: $($direct.Count) | Job pipeline: $($ok.Count - $direct.Count)"
Write-Host "Wall-clock (download phase): $([math]::Round($overall.ElapsedMilliseconds/1000))s"
if ($ok.Count -gt 0) {
  $times = @($ok.totalMs | Sort-Object)
  Write-Host "Time min/median/max: $($times[0]) / $($times[[math]::Floor($times.Count/2)]) / $($times[-1]) ms"
}
$failed | Group-Object status | Format-Table Name, Count -AutoSize
$ok | Sort-Object totalMs | Select-Object -First 8 | Format-Table index, status, totalMs, directHeight, title -AutoSize
$results | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-public-55-results.csv' -NoTypeInformation
