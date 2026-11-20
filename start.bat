@echo off
chcp 65001 >nul
title Julelotteri
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js er ikke installert paa denne PC-en.
  echo Last ned og installer "LTS" fra https://nodejs.org og dobbeltklikk start.bat paa nytt.
  echo.
  pause
  exit /b 1
)
echo Starter julelotteriet ...
start "" "http://localhost:3000"
node server.js
echo.
echo Serveren er stoppet.
pause
