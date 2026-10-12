@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0MAKE-CHATGPT-RETURN-ZIP.ps1"
pause
