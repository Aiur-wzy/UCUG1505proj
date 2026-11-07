@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0.local\node24\node.exe" set "PATH=%~dp0.local\node24;%PATH%"
node "%~dp0stack-starter-v2\scripts\start-local.mjs" %*
if errorlevel 1 pause
