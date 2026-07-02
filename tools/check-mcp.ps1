param(
  [int]$Port = 3000,
  [string]$Action = 'menu'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$stdoutLog = Join-Path $repoRoot 'logs\mcp.stdout.log'
$stderrLog = Join-Path $repoRoot 'logs\mcp.stderr.log'
$url = "http://127.0.0.1:$Port/api/mcp"

function Get-McpApiKey {
  if ($env:MCP_API_KEY) {
    return $env:MCP_API_KEY.Trim()
  }

  $envFile = Join-Path $repoRoot '.env.local'
  if (-not (Test-Path $envFile)) {
    return $null
  }

  $line = Get-Content $envFile | Where-Object { $_ -match '^MCP_API_KEY=' } | Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return ($line -replace '^MCP_API_KEY=', '').Trim().Trim('"')
}

function Get-McpAuthMode {
  if ($env:MCP_AUTH_MODE) {
    return $env:MCP_AUTH_MODE.Trim().ToLower()
  }

  $envFile = Join-Path $repoRoot '.env.local'
  if (-not (Test-Path $envFile)) {
    return 'api_key'
  }

  $line = Get-Content $envFile | Where-Object { $_ -match '^MCP_AUTH_MODE=' } | Select-Object -First 1
  if (-not $line) {
    return 'api_key'
  }

  return (($line -replace '^MCP_AUTH_MODE=', '').Trim().Trim('"')).ToLower()
}

function Get-McpStatus {
  $netstatLine = netstat -ano -p TCP |
    Select-String -Pattern "^\s*TCP\s+(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):$Port\s+.*\s+LISTENING\s+(\d+)\s*$" |
    Select-Object -First 1

  $processInfo = $null
  $owningPid = $null

  if ($netstatLine -and $netstatLine.Line -match 'LISTENING\s+(\d+)$') {
    $owningPid = [int]$Matches[1]
    $processInfo = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
  }

  $status = [ordered]@{
    repo = $repoRoot
    port = $Port
    auth_mode = Get-McpAuthMode
    listening = [bool]$netstatLine
    process_id = if ($processInfo) { $processInfo.Id } else { $owningPid }
    process_name = if ($processInfo) { $processInfo.ProcessName } else { $null }
    endpoint = $url
    endpoint_ok = $false
    tool_found = $false
    stdout_log = if (Test-Path $stdoutLog) { $stdoutLog } else { $null }
    stderr_log = if (Test-Path $stderrLog) { $stderrLog } else { $null }
  }

  try {
    if ($status.auth_mode -eq 'none') {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
      $json = $response.Content | ConvertFrom-Json
      $status.endpoint_ok = ($response.StatusCode -eq 200)
      $status.tool_found = ($json.tools.name -contains 'session_tracker')
    } elseif ($status.auth_mode -eq 'oauth') {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/.well-known/oauth-authorization-server" -TimeoutSec 5
      $json = $response.Content | ConvertFrom-Json
      $status.endpoint = "http://127.0.0.1:$Port/.well-known/oauth-authorization-server"
      $status.endpoint_ok = ($response.StatusCode -eq 200)
      $status.tool_found = [bool]$json.authorization_endpoint
    } else {
      $apiKey = Get-McpApiKey
      if (-not $apiKey) {
        throw 'MCP_API_KEY not found in environment or .env.local'
      }

      $headers = @{ 'x-mcp-api-key' = $apiKey }
      $response = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $url -TimeoutSec 5
      $json = $response.Content | ConvertFrom-Json
      $status.endpoint_ok = ($response.StatusCode -eq 200)
      $status.tool_found = ($json.tools.name -contains 'session_tracker')
    }
  } catch {
    $status.error = $_.Exception.Message
  }

  [PSCustomObject]$status
}

function Show-Health {
  $status = Get-McpStatus
  $status | ConvertTo-Json -Depth 4

  if (-not $status.listening -or -not $status.endpoint_ok -or -not $status.tool_found) {
    exit 1
  }
}

function Start-Mcp {
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-mcp.ps1') -Port $Port
}

function Show-Endpoint {
  if ((Get-McpAuthMode) -eq 'none') {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
    $response.Content
    return
  }

  $apiKey = Get-McpApiKey
  if (-not $apiKey) {
    throw 'MCP_API_KEY not found in environment or .env.local'
  }

  $headers = @{ 'x-mcp-api-key' = $apiKey }
  $response = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $url -TimeoutSec 5
  $response.Content
}

function Show-Logs {
  Write-Host ''
  Write-Host 'stdout:'
  if (Test-Path $stdoutLog) {
    Get-Content $stdoutLog -Tail 40
  } else {
    Write-Host 'No stdout log found.'
  }

  Write-Host ''
  Write-Host 'stderr:'
  if (Test-Path $stderrLog) {
    Get-Content $stderrLog -Tail 40
  } else {
    Write-Host 'No stderr log found.'
  }
}

function Show-Process {
  $status = Get-McpStatus
  [PSCustomObject]@{
    listening = $status.listening
    process_id = $status.process_id
    process_name = $status.process_name
    port = $status.port
  } | Format-List
}

function Stop-Mcp {
  $status = Get-McpStatus
  if (-not $status.process_id) {
    Write-Host 'No MCP process found.'
    return
  }

  taskkill /PID $status.process_id /F | Out-Null
  Write-Host "Stopped MCP process $($status.process_id)."
}

function Restart-Mcp {
  $status = Get-McpStatus
  if ($status.process_id) {
    taskkill /PID $status.process_id /F | Out-Null
    Start-Sleep -Seconds 2
  }

  Start-Mcp
  Write-Host ''
  Show-Health
}

function Show-Menu {
  while ($true) {
    Clear-Host
    Write-Host 'MCP Utility'
    Write-Host '1. Health check'
    Write-Host '2. Start MCP'
    Write-Host '3. Restart MCP'
    Write-Host '4. Force stop'
    Write-Host '5. Show endpoint response'
    Write-Host '6. Show logs'
    Write-Host '7. Exit'
    Write-Host ''
    $choice = Read-Host 'Choose an option'
    Write-Host ''

    switch ($choice) {
      '1' { Show-Health; Pause }
      '2' { Start-Mcp; Pause }
      '3' { Restart-Mcp; Pause }
      '4' { Stop-Mcp; Pause }
      '5' { Show-Endpoint; Pause }
      '6' { Show-Logs; Pause }
      '7' { break }
      default {
        Write-Host 'Invalid option.'
        Pause
      }
    }
  }
}

switch ($Action.ToLowerInvariant()) {
  'health' { Show-Health; break }
  'start' { Start-Mcp; break }
  'stop' { Stop-Mcp; break }
  'restart' { Restart-Mcp; break }
  'endpoint' { Show-Endpoint; break }
  'logs' { Show-Logs; break }
  default { Show-Menu; break }
}
