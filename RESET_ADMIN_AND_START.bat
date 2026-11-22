@echo off
setlocal
cd /d "%~dp0"
title Rahul Mart CRM - Reset Admin and Start

echo ==================================================
echo Rahul Mart CRM - Admin Reset and Start
echo ==================================================
echo.
echo Stopping any existing listener on local port 3000 (prevents EADDRINUSE)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$procIds = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($procId in $procIds) { if ($procId -and $procId -ne 0) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue } }"

echo Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js is missing. Install Node.js LTS and run this file again.
 pause
 exit /b 1
)
if not exist node_modules (
 echo Installing dependencies. Keep this window open...
 call npm install
 if errorlevel 1 (
  echo npm install failed. Check internet and retry.
  pause
  exit /b 1
 )
)
echo.
echo Creating a fresh admin password and updating the local database on startup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_ADMIN.ps1"
if errorlevel 1 (
 echo Admin credential setup failed.
 pause
 exit /b 1
)
echo.
echo Opening Admin page in 3 seconds...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000/admin"
echo Server starting. Keep this window open.
node server.js
if errorlevel 1 (
 echo Server stopped with an error. Check the message above.
 pause
 exit /b 1
)
pause
