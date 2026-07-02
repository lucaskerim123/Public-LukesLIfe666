param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot 'logs'
$stdoutLog = Join-Path $logDir 'mcp.stdout.log'
$stderrLog = Join-Path $logDir 'mcp.stderr.log'

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

function Test-McpEndpoint {
  param([int]$CheckPort)

  try {
    $authMode = Get-McpAuthMode
    if ($authMode -eq 'none') {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$CheckPort/api/mcp" -TimeoutSec 4
      if ($response.StatusCode -ne 200) {
        return $false
      }

      $json = $response.Content | ConvertFrom-Json
      return $json.tools.name -contains 'session_tracker'
    }

    if ($authMode -eq 'oauth') {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$CheckPort/.well-known/oauth-authorization-server" -TimeoutSec 4
      return $response.StatusCode -eq 200
    }

    $apiKey = Get-McpApiKey
    if (-not $apiKey) {
      return $false
    }

    $headers = @{ 'x-mcp-api-key' = $apiKey }
    $response = Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri "http://127.0.0.1:$CheckPort/api/mcp" -TimeoutSec 4
    if ($response.StatusCode -ne 200) {
      return $false
    }

    $json = $response.Content | ConvertFrom-Json
    return $json.tools.name -contains 'session_tracker'
  } catch {
    return $false
  }
}

if (Test-McpEndpoint -CheckPort $Port) {
  Write-Host "MCP is already running on port $Port."
  exit 0
}

if (-not (Test-Path (Join-Path $repoRoot '.next'))) {
  throw "Build output is missing. Run 'npm run build' in $repoRoot first."
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$command = "cd /d `"$repoRoot`" && npm run start -- --port $Port >> `"$stdoutLog`" 2>> `"$stderrLog`""
$process = Start-Process `
  -FilePath 'cmd.exe' `
  -ArgumentList '/c', $command `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 5

if (-not (Test-McpEndpoint -CheckPort $Port)) {
  throw "Server process started with PID $($process.Id), but /api/mcp did not become ready. Check $stdoutLog and $stderrLog."
}

Write-Host "MCP started on http://127.0.0.1:$Port/api/mcp"
Write-Host "PID: $($process.Id)"
Write-Host "Logs: $stdoutLog"
