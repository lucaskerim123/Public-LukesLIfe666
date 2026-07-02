param()

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell

$desktopShortcutPath = Join-Path $desktop 'Check MCP.lnk'
$desktopShortcut = $shell.CreateShortcut($desktopShortcutPath)
$desktopShortcut.TargetPath = 'C:\Windows\System32\cmd.exe'
$desktopShortcut.Arguments = '/c ""' + (Join-Path $repoRoot 'check-mcp.bat') + '""'
$desktopShortcut.WorkingDirectory = $repoRoot
$desktopShortcut.IconLocation = 'C:\Windows\System32\shell32.dll,23'
$desktopShortcut.Save()

$startupShortcutPath = Join-Path $startup 'Start MCP.lnk'
$startupShortcut = $shell.CreateShortcut($startupShortcutPath)
$startupShortcut.TargetPath = 'C:\Windows\System32\cmd.exe'
$startupShortcut.Arguments = '/c ""' + (Join-Path $repoRoot 'start-mcp.bat') + '""'
$startupShortcut.WorkingDirectory = $repoRoot
$startupShortcut.IconLocation = 'C:\Windows\System32\shell32.dll,24'
$startupShortcut.Save()

[PSCustomObject]@{
  DesktopShortcut = $desktopShortcutPath
  StartupShortcut = $startupShortcutPath
} | Format-List
