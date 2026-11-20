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
set JL_LOOP=1
start "" "http://localhost:3000"
:kjor
node server.js
rem Kode 42 = programmet har oppdatert seg selv og skal starte pa nytt
if %errorlevel%==42 (
  echo.
  echo Oppdatert. Starter pa nytt ...
  goto kjor
)
echo.
echo Serveren er stoppet.
pause
