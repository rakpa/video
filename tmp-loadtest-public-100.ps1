# 100 simultaneous public YouTube downloads - skip validation, use proven URLs
$api = 'https://clipvault-api-production.up.railway.app'
$targetCount = 100

$provenIds = @(
  'dQw4w9WgXcQ','pRpeEdMmmQ0','e-ORhEE9VVg','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs','5GL9JoH4Sws',
  'Zi_XLOBDo_Y','J---aiyznGQ','450p7goxZqg','kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU',
  'uelHwf8o7_U','fJ9rUzIMcZQ','8UVNT4wvIGY','09R8_2nJtjg','0KSOMA3QBU0','ktvTqknDobU','ScMzIvxBSi4',
  'jNQXAC9IVRw','aqz-KE-bpKQ','ZZ5LpwO-An4','oHg5SJYRHA0'
)

$testUrls = @()
$i = 0
while ($testUrls.Count -lt $targetCount) {
  $testUrls += "https://www.youtube.com/watch?v=$($provenIds[$i % $provenIds.Count])"
  $i++
}

Write-Host "=== Pre-warm $targetCount URLs (26 unique) ===" -ForegroundColor Cyan
foreach ($u in $testUrls) {
  try { $null = Invoke-RestMethod -Uri "$api/api/info" -Method POST -Body (@{url=$u}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 90 } catch {}
  Start-Sleep -Milliseconds 200
}
Write-Host "Cooldown 30s..."; Start-Sleep -Seconds 30

Write-Host "=== $targetCount simultaneous 1080p downloads ===" -ForegroundColor Cyan
$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt $targetCount; $i++) {
  $idx = $i + 1; $u = $testUrls[$i]
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{ index=$Index; url=$Url; totalMs=$null; path=$null; status='pending'; error=$null; directHeight=$null }
    try {
      $null = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body (@{url=$Url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      $dlRes = Invoke-RestMethod -Uri "$ApiBase/api/download" -Method POST -Body (@{url=$Url;quality='1080';mode='best'}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 120
      if ($dlRes.direct -and $dlRes.url) {
        $result.path='direct-cdn'; $result.status='direct'; $result.directHeight=$dlRes.height
        $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result
      }
      if (-not $dlRes.jobId) { $result.status='failed'; $result.error='No jobId'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
      $jobId = $dlRes.jobId; $deadline = (Get-Date).AddMinutes(6)
      while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 2000
        try { $st = Invoke-RestMethod -Uri "$ApiBase/api/file/$jobId/status" -TimeoutSec 30 } catch { continue }
        if ($st.status -eq 'ready') { $result.path='job-pipeline'; $result.status='ready'; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
        if ($st.status -eq 'error') { $result.status='error'; $result.error=$st.message; $sw.Stop(); $result.totalMs=[int]$sw.ElapsedMilliseconds; return [pscustomobject]$result }
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
$direct = @($ok | Where-Object { $_.path -eq 'direct-cdn' })
$failed = @($results | Where-Object { $_.status -notin @('ready','direct') })

Write-Host ""
Write-Host "=== FINAL SUMMARY (100 burst) ===" -ForegroundColor Cyan
Write-Host "Success: $($ok.Count)/$targetCount ($([math]::Round(100*$ok.Count/$targetCount,1))%)"
Write-Host "Direct CDN: $($direct.Count) | Job pipeline: $($ok.Count - $direct.Count) | Failed: $($failed.Count)"
Write-Host "Wall-clock: $([math]::Round($overall.ElapsedMilliseconds/1000))s"
if ($ok.Count -gt 0) {
  $times = @($ok.totalMs | Sort-Object)
  Write-Host "Time min/median/max: $($times[0]) / $($times[[math]::Floor($times.Count/2)]) / $($times[-1]) ms"
}
$failed | Group-Object status | Format-Table Name, Count -AutoSize
$results | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-public-100-results.csv' -NoTypeInformation
