# 75 simultaneous public YouTube downloads (50-100 range)
# Uses proven public URLs, pre-warms cache, cooldown before burst
$api = 'https://clipvault-api-production.up.railway.app'
$targetCount = 75

# 32 URLs that passed validation + direct CDN in prior run
$provenIds = @(
  'dQw4w9WgXcQ','9bZkp7q19f0','FTQbiNvZqaY','L_jWHffIx5E','hTWKbfoikeg','09839DpTctU','fLexgOxsZu0',
  'YQHsXMglC9A','hFZFjoX2cGg','lp-EO5I60KA','2Vv-BfVoq4g','CevxZvSJLk8','pRpeEdMmmQ0','e-ORhEE9VVg',
  'YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws','Zi_XLOBDo_Y','J---aiyznGQ','450p7goxZqg',
  'kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U','fJ9rUzIMcZQ','8UVNT4wvIGY',
  '09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4'
)

# Extra candidates to try reaching more unique URLs
$extraIds = @(
  'kJQP7ki5MkU','jNQXAC9IVRw','aqz-KE-bpKQ','ZZ5LpwO-An4','oHg5SJYRHA0','NF-kLy44BGA','RgKAFyr5Sl4',
  'SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8',
  'hT_nv6nkjQ4','07QASMagLgM','QDYDrRU3Hrc','Y1xsXRihNhQ','R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa',
  'yPYZ_pyOmTk','ALZHFhU2UWs','V1bFr2CW1qI','QJO3RPMTJxQ','nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4',
  'tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ','IO9XJXDXcF0','Ye7FKc1CgKy0'
)

$validated = @()
foreach ($id in ($provenIds + $extraIds | Select-Object -Unique)) {
  if ($validated.Count -ge $targetCount) { break }
  $url = "https://www.youtube.com/watch?v=$id"
  $ok = $false
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    try {
      $r = Invoke-RestMethod -Uri "$api/api/info" -Method POST -Body (@{url=$url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 90
      if ($r.title) {
        $validated += [pscustomobject]@{ url = $url; id = $id; title = $r.title }
        Write-Host ("OK $($validated.Count): $id")
        $ok = $true
        break
      }
    } catch {
      if ($attempt -lt 3) { Start-Sleep -Seconds 2 }
    }
  }
  if (-not $ok) { Write-Host "SKIP $id" }
  Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "Unique validated: $($validated.Count)"

# Build test list up to $targetCount (cycle proven URLs if needed)
$testUrls = @()
$i = 0
while ($testUrls.Count -lt $targetCount) {
  $testUrls += $validated[$i % $validated.Count].url
  $i++
}
$testCount = $testUrls.Count
$uniqueInTest = @($testUrls | Select-Object -Unique).Count

Write-Host "Test list: $testCount slots ($uniqueInTest unique URLs)"

Write-Host ""
Write-Host "=== Pre-warm: sequential /api/info for all $testCount slots ===" -ForegroundColor Cyan
$warmOk = 0
foreach ($u in $testUrls) {
  try {
    $null = Invoke-RestMethod -Uri "$api/api/info" -Method POST -Body (@{url=$u}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 90
    $warmOk++
  } catch { }
  Start-Sleep -Milliseconds 250
}
Write-Host "Pre-warm OK: $warmOk / $testCount"

Write-Host "Cooldown 45s before burst..." -ForegroundColor Yellow
Start-Sleep -Seconds 45

Write-Host ""
Write-Host "=== $testCount simultaneous 1080p downloads ===" -ForegroundColor Cyan
Write-Host "Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt $testCount; $i++) {
  $idx = $i + 1
  $u = $testUrls[$i]
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
Write-Host "Simultaneous requests: $testCount ($uniqueInTest unique public URLs)"
Write-Host "Success: $($ok.Count) ($([math]::Round(100*$ok.Count/[Math]::Max(1,$testCount),1))%) | Failed: $($failed.Count)"
Write-Host "Direct CDN: $($direct.Count) | Job pipeline: $($ok.Count - $direct.Count)"
Write-Host "Wall-clock: $([math]::Round($overall.ElapsedMilliseconds/1000))s"
if ($ok.Count -gt 0) {
  $times = @($ok.totalMs | Sort-Object)
  Write-Host "Time min/median/max: $($times[0]) / $($times[[math]::Floor($times.Count/2)]) / $($times[-1]) ms"
}
$failed | Group-Object status | Format-Table Name, Count -AutoSize
$failed | Group-Object { if ($_.error -match '422') { '422' } elseif ($_.error -match '402') { '402-quota' } else { 'other' } } | Format-Table Name, Count -AutoSize
$ok | Sort-Object totalMs | Select-Object -First 10 | Format-Table index, status, totalMs, directHeight, title -AutoSize
$results | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-public-75-results.csv' -NoTypeInformation
Write-Host "Saved: tmp-loadtest-public-75-results.csv"
