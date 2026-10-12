@echo off
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 (
  node desktop-server.cjs
  exit /b
)
where py >nul 2>nul
if not errorlevel 1 (
  py -3 desktop-server.py
  exit /b
)
where python >nul 2>nul
if not errorlevel 1 (
  python desktop-server.py
  exit /b
)
echo Install Node.js LTS or Python 3, then run this launcher again.
pause
