param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $repoRoot 'logs\mcp-public.log'
$pidFile = Join-Path $repoRoot 'logs\mcp-public.pid'
$port = 3000

$publicUrl = $null
$processId = $null
$tunnelRunning = $false
$originListening = $false
$originReady = $false

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

function Test-OriginReady {
  try {
    $authMode = Get-McpAuthMode
    if ($authMode -eq 'none') {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/api/mcp" -TimeoutSec 4
      if ($response.StatusCode -ne 200) {
        return $false
      }

      $json = $response.Content | ConvertFrom-Json
      return $json.tools.name -contains 'session_tracker'
    }

    if ($authMode -eq 'oauth') {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/.well-known/oauth-authorization-server" -TimeoutSec 4
      return $response.StatusCode -eq 200
    }

    $apiKey = Get-McpApiKey
    if (-not $apiKey) {
      return $false
    }

    $headers = @{ 'x-mcp-api-key' = $apiKey }
    $response = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri "http://127.0.0.1:$port/api/mcp" -TimeoutSec 4
    if ($response.StatusCode -ne 200) {
      return $false
    }

    $json = $response.Content | ConvertFrom-Json
    return $json.tools.name -contains 'session_tracker'
  } catch {
    return $false
  }
}

if (Test-Path $pidFile) {
  $processId = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if ($processId -and (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
    $tunnelRunning = $true
  }
}

if (Test-Path $logFile) {
  $match = Select-String -Path $logFile -Pattern 'https://[-a-z0-9]+\.trycloudflare\.com' | Select-Object -Last 1
  if ($match) {
    $publicUrl = $match.Matches.Value
  }
}

$netstatLine = netstat -ano -p TCP |
  Select-String -Pattern "^\s*TCP\s+(?:0\.0\.0\.0|127\.0\.0\.1|\[::\]):$port\s+.*\s+LISTENING\s+\d+\s*$" |
  Select-Object -First 1

$originListening = [bool]$netstatLine
$originReady = Test-OriginReady

[PSCustomObject]@{
  running = ($tunnelRunning -and $originListening -and $originReady -and $publicUrl)
  tunnel_running = $tunnelRunning
  process_id = $processId
  origin_port = $port
  origin_listening = $originListening
  origin_ready = $originReady
  public_base_url = $publicUrl
  mcp_endpoint = if ($publicUrl) { "$publicUrl/api/mcp" } else { $null }
  log_file = if (Test-Path $logFile) { $logFile } else { $null }
} | ConvertTo-Json -Depth 4

if (-not $tunnelRunning -or -not $originListening -or -not $originReady -or -not $publicUrl) {
  exit 1
}
