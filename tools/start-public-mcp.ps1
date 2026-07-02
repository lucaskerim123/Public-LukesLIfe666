param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot 'logs'
$logFile = Join-Path $logDir 'mcp-public.log'
$pidFile = Join-Path $logDir 'mcp-public.pid'
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

if (-not (Test-Path $cloudflared)) {
  throw "cloudflared not found at $cloudflared"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (Test-Path $pidFile) {
  $existingPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    Write-Host "Public MCP tunnel already running with PID $existingPid."
    if (Test-Path $logFile) {
      $existingUrl = Select-String -Path $logFile -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' | Select-Object -Last 1
      if ($existingUrl) {
        Write-Host "Public base URL: $($existingUrl.Matches.Value)"
        Write-Host "MCP endpoint: $($existingUrl.Matches.Value)/api/mcp"
      }
    }
    exit 0
  }
}

if (Test-Path $logFile) {
  Remove-Item -LiteralPath $logFile -Force
}

if (Test-Path $pidFile) {
  Remove-Item -LiteralPath $pidFile -Force
}

$args = @(
  'tunnel',
  '--url', "http://127.0.0.1:$Port",
  '--logfile', $logFile,
  '--pidfile', $pidFile,
  '--no-autoupdate'
)

Start-Process -FilePath $cloudflared -ArgumentList $args -WorkingDirectory $repoRoot -WindowStyle Hidden | Out-Null

$publicUrl = $null
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $logFile) {
    $match = Select-String -Path $logFile -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' | Select-Object -Last 1
    if ($match) {
      $publicUrl = $match.Matches.Value
      break
    }
  }
}

if (-not $publicUrl) {
  throw "Tunnel started but no public URL was detected yet. Check $logFile"
}

Write-Host "Public base URL: $publicUrl"
Write-Host "MCP endpoint: $publicUrl/api/mcp"
Write-Host "Log: $logFile"
