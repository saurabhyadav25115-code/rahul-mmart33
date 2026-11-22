@echo off
cd /d "%~dp0"
title Rahul Mart CRM
where node >nul 2>&1
if errorlevel 1 (
 echo Node.js not detected. Please install Node.js LTS and try again.
 pause
 exit /b 1
)
if not exist node_modules (
 echo Installing regular JavaScript packages. This revision does NOT compile SQLite or require Python.
 call npm install
 if errorlevel 1 (
  echo npm install failed. Please check internet and try again.
  pause
  exit /b 1
 )
)
if not exist .env (
 echo Generating a private admin login for first setup...
 powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_ADMIN.ps1"
 if errorlevel 1 (
  echo Credential setup failed.
  pause
  exit /b 1
 )
)
echo Starting Rahul Mart CRM backend. Keep this window open.
node server.js
pause
