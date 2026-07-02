@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\check-mcp.ps1" -Action menu
pause
