$api = 'https://clipvault-api-production.up.railway.app'
$ytdlp = 'yt-dlp'
$existing = Import-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-validated.csv'
$have = @{}; foreach ($e in $existing) { $have[$e.id] = $true }

$moreIds = @(
  'kJQP7ki5MkU','RgKAFyr5Sl4','NF-kLy44BGA','SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk',
  '7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8','hT_nv6nkjQ4','07QASMagLgM','QDYDrRU3Hrc','Y1xsXRihNhQ',
  'R7E9S55L7A0','RBumgq5yV7A','60ItHLz0Waa','yPYZ_pyOmTk','ALZHFhU2UWs','V1bFr2CW1qI','QJO3RPMTJxQ',
  'nCDQLDvEJoU','gCYcHz2k0xY','BROWqjuT0d4','tVj0jTs-r1o','cLQZKbTaS1g','kXYiU_JCYtU','N_lWpVIQOxQ',
  'IO9XJXDXcF0','Ye7FKc1CgKy0','M7lc1UVf-VE','k85mRPqvMbM','dMH0bHeiRNg','_OBlgSz8sSM','XqZsoesa55w',
  'JGwWNGJdvx8','nlcIKhJSsBU','fWNaR-r-xMY','r7qOvP0NfeU','gdZLi9oYuZE','WMweEpGxp_U','Y4H8Cpv8GkA',
  'kTJczUOCtHY','U3mFa5O5sFc','TUVcZ2JEG1M','E07-D3FBG0Q','ApXoWgfEaPg','GhF-_F1F8sY','vhR0vNqX30s',
  'HCj0KnG2Z68','k2qg6cT9W94','QBu5GdWK0xQ','ZmDBbnmXq1Q','tQ0yjYqfWyY','UNEZArQjX74','txU59TlhEJw',
  'OWsMtTyOZJg','koxMI26L5dY','a1Y73sPHKxw','eNPH8Mv0RUM','1t7VPPGReE4','Cdn3MD4E2tk','gGdAFtwGMFE',
  '1vhFYVrZ8-0','gxEPV4F42QQ','Os6_vWd1NTE','oRdxCA_dsw8','pEQH8AyQtCE','4m1EFMoRFvI','ViwtNLUqkFM',
  'Cdv7tGBOKak','tg00YEIOFps','hLQl3WPOokw','3WtAngVIYj8','ymNiUARI3Y4','WNeLUngb-xg','ScMzIvxBSi4',
  'wZZ7oFKsKzY','hT_qBuGj0rs','fLexgOxsZu0','9bZkp7q19f0','EngWgB_4IDk','QzoXo-0JW9Y','sOnqjkJTMaA',
  'V-_OAli54Jo','HPPj6viqFc8','450p7goxZqg','ktvTqknDobU','09R8_2nJtjg','0KSOMA3QBU0','5GL9JoH4Sws',
  'Zi_XLOBDo_Y','J---aiyznGQ','kffacxfA7G4','fRh_vgS2dFE','OPf0YbXqDm0','y6120QOlsfU','uelHwf8o7_U',
  'fJ9rUzIMcZQ','8UVNT4wvIGY','pRpeEdMmmQ0','e-ORhEE9VVg','YVkUvmDQ3HY','YlUKcNNmywk','ZbZSe6N_BXs',
  'CevxZvSJLk8','2Vv-BfVoq4g','lp-EO5I60KA','hFZFjoX2cGg','YQHsXMglC9A','fLexgOxsZu0','09839DpTctU',
  'hTWKbfoikeg','L_jWHffIx5E','FTQbiNvZqaY','oHg5SJYRHA0','ZZ5LpwO-An4','aqz-KE-bpKQ','jNQXAC9IVRw',
  'dQw4w9WgXcQ','mWRsgCuwDxc','MxEjnYdfLUU','LsoLEjrDogU','RFinNxS5KN4','YQHsXMglC9A','RBumgq5yV7A',
  'PuS_zeUi3Ks','aJOTlE_WqEg','VbfpW0pV-Lk','3AtDnE4s4ak','QK8mJJJavJk','uelHwf8o7_U','60ItHLz0Waa',
  'SlPhMPnEX4A','astISOttQS0','QH2-TGUlwu4','1xw4S-hfeAk','7wtfSzwfglw','3JZ_D3XPZSA','PIh2-ezDown8'
) | Where-Object { -not $have[$_] } | Select-Object -Unique

$added = @()
foreach ($id in $moreIds) {
  if (($existing.Count + $added.Count) -ge 100) { break }
  $url = "https://www.youtube.com/watch?v=$id"
  try {
    $title = & $ytdlp --skip-download --no-warnings --print title --print duration "$url" 2>$null
    if ($title -and $title[0]) {
      $added += [pscustomobject]@{ url=$url; id=$id; title=$title[0]; duration= if ($title.Count -ge 2) {$title[1]} else {$null} }
      Write-Host "ADD $($existing.Count + $added.Count): $id"
    }
  } catch {}
  Start-Sleep -Milliseconds 120
}

$all = @($existing + $added)
Write-Host "Total unique validated: $($all.Count)"
$all | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-validated.csv' -NoTypeInformation

if ($all.Count -lt 100) { Write-Host "Only $($all.Count) unique URLs found"; exit 0 }

# prewarm + burst 100
$testCount = 100
Write-Host "Pre-warm $testCount..."
$warmOk = 0
foreach ($v in $all | Select-Object -First 100) {
  try { $null = Invoke-RestMethod -Uri "$api/api/info" -Method POST -Body (@{url=$v.url}|ConvertTo-Json -Compress) -ContentType 'application/json' -TimeoutSec 90; $warmOk++ } catch {}
  Start-Sleep -Milliseconds 250
}
Write-Host "Warm $warmOk/100. Cooldown 90s..."; Start-Sleep -Seconds 90

Write-Host "Burst 100..."
$overall = [System.Diagnostics.Stopwatch]::StartNew()
$jobs = @()
for ($i = 0; $i -lt 100; $i++) {
  $idx = $i + 1; $u = $all[$i].url
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{ index=$Index; url=$Url; totalMs=$null; path=$null; status='pending'; error=$null; directHeight=$null; title=$null }
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
$ok = @($results | ? { $_.status -in 'direct','ready' }); $direct = @($ok | ? path -eq 'direct-cdn'); $failed = @($results | ? { $_.status -notin 'direct','ready' })
Write-Host "=== 100 UNIQUE URL RESULTS ==="
Write-Host "Success: $($ok.Count)/100 | Direct: $($direct.Count) | Failed: $($failed.Count) | Wall: $([math]::Round($overall.ElapsedMilliseconds/1000))s"
if ($ok.Count -gt 0) { $t=@($ok.totalMs|Sort); Write-Host "min/p50/max: $($t[0])/$($t[[math]::Floor($t.Count/2)])/$($t[-1]) ms" }
$failed | Group-Object status | Format-Table Name,Count -AutoSize
$results | Export-Csv 'C:\Users\rakpa\video\tmp-loadtest-100-unique-results.csv' -NoTypeInformation
