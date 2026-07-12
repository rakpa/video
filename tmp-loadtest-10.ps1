# 10 simultaneous desktop-style 1080p downloads (production API = vidcliply.com backend)
$api = 'https://clipvault-api-production.up.railway.app'
$urls = @(
  'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  'https://www.youtube.com/watch?v=ZZ5LpwO-An4',
  'https://www.youtube.com/watch?v=oHg5SJYRHA0',
  'https://www.youtube.com/watch?v=NF-kLy44BGA',
  'https://www.youtube.com/watch?v=FTQbiNvZqaY',
  'https://www.youtube.com/watch?v=IO9XJXDXcF0',
  'https://www.youtube.com/watch?v=ScMzIvxBSi4',
  'https://www.youtube.com/watch?v=Ye7FKc1CgKy0'
)

Write-Host "=== 10 parallel 1080p downloads @ $api ===" -ForegroundColor Cyan
Write-Host "Started: $(Get-Date -Format 'HH:mm:ss')"
$overall = [System.Diagnostics.Stopwatch]::StartNew()

$jobs = @()
for ($i = 0; $i -lt 10; $i++) {
  $idx = $i + 1
  $u = $urls[$i]
  $jobs += Start-Job -ArgumentList $idx, $u, $api -ScriptBlock {
    param($Index, $Url, $ApiBase)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = [ordered]@{
      index = $Index
      url = $Url
      infoMs = $null
      startMs = $null
      totalMs = $null
      path = $null
      status = 'pending'
      error = $null
      finalPct = $null
      title = $null
    }
    try {
      $infoBody = @{ url = $Url } | ConvertTo-Json -Compress
      $infoSw = [System.Diagnostics.Stopwatch]::StartNew()
      $infoRes = Invoke-RestMethod -Uri "$ApiBase/api/info" -Method POST -Body $infoBody -ContentType 'application/json' -TimeoutSec 120
      $infoSw.Stop()
      $result.infoMs = [int]$infoSw.ElapsedMilliseconds
      if ($infoRes.title) { $result.title = $infoRes.title.Substring(0, [Math]::Min(40, $infoRes.title.Length)) }

      $dlBody = @{ url = $Url; quality = '1080'; mode = 'best' } | ConvertTo-Json -Compress
      $startSw = [System.Diagnostics.Stopwatch]::StartNew()
      $dlRes = Invoke-RestMethod -Uri "$ApiBase/api/download" -Method POST -Body $dlBody -ContentType 'application/json' -TimeoutSec 120
      $startSw.Stop()
      $result.startMs = [int]$startSw.ElapsedMilliseconds

      if ($dlRes.direct -and $dlRes.url) {
        $result.path = 'direct-cdn'
        $result.status = 'direct'
        $sw.Stop()
        $result.totalMs = [int]$sw.ElapsedMilliseconds
        return [pscustomobject]$result
      }
      if (-not $dlRes.jobId) {
        $result.status = 'failed'
        $result.error = 'No jobId or direct URL'
        $sw.Stop()
        $result.totalMs = [int]$sw.ElapsedMilliseconds
        return [pscustomobject]$result
      }
      $jobId = $dlRes.jobId
      $deadline = (Get-Date).AddMinutes(8)
      $lastPct = 0
      while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 1500
        try {
          $st = Invoke-RestMethod -Uri "$ApiBase/api/file/$jobId/status" -TimeoutSec 30
        } catch { continue }
        if ($st.progress -and $null -ne $st.progress.percent) { $lastPct = [math]::Round($st.progress.percent, 1) }
        if ($st.status -eq 'ready') {
          $result.path = 'job-pipeline'
          $result.status = 'ready'
          $result.finalPct = 100
          $sw.Stop()
          $result.totalMs = [int]$sw.ElapsedMilliseconds
          return [pscustomobject]$result
        }
        if ($st.status -eq 'error' -or $st.galleryFailed) {
          $result.path = 'job-pipeline'
          $result.status = 'error'
          $result.error = $st.message
          $result.finalPct = $lastPct
          $sw.Stop()
          $result.totalMs = [int]$sw.ElapsedMilliseconds
          return [pscustomobject]$result
        }
      }
      $result.path = 'job-pipeline'
      $result.status = 'timeout'
      $result.finalPct = $lastPct
      $result.error = 'Timed out after 8 min'
      $sw.Stop()
      $result.totalMs = [int]$sw.ElapsedMilliseconds
      return [pscustomobject]$result
    } catch {
      $sw.Stop()
      $result.status = 'failed'
      $result.error = $_.Exception.Message
      $result.totalMs = [int]$sw.ElapsedMilliseconds
      return [pscustomobject]$result
    }
  }
}

$results = @($jobs | Wait-Job | Receive-Job)
$jobs | Remove-Job -Force
$overall.Stop()

Write-Host ""
Write-Host "=== RESULTS (sorted by total time) ===" -ForegroundColor Cyan
$results | Sort-Object { $_.totalMs } | Format-Table index, status, path, infoMs, startMs, totalMs, finalPct, title, error -AutoSize

$ok = @($results | Where-Object { $_.status -in @('ready', 'direct') }).Count
$fail = $results.Count - $ok
Write-Host "Summary: $ok/10 succeeded, $fail failed, wall-clock $($overall.ElapsedMilliseconds)ms"
Write-Host "Direct CDN: $(@($results | Where-Object { $_.path -eq 'direct-cdn' }).Count) | Job pipeline: $(@($results | Where-Object { $_.path -eq 'job-pipeline' }).Count)"
