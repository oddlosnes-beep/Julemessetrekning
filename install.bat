@echo off
chcp 65001 >nul
setlocal
title Installer Julemessetrekning
set "REPO=oddlosnes-beep/julemessetrekning"
set "BRANCH=main"
set "DEST=%USERPROFILE%\Documents\Julemessetrekning"

echo.
echo ==============================================
echo  Julemessetrekning - installer / oppdater
echo ==============================================
echo  Mappe: %DEST%
echo  Navn og bilder i mappen "data" blir ikke rort.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js er ikke installert. Det trengs for at programmet skal kjore.
  where winget >nul 2>nul
  if not errorlevel 1 (
    choice /c JN /m "Installere Node.js LTS na (via winget)"
    if not errorlevel 2 (
      winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
      echo.
      echo Ferdig. Lukk dette vinduet og dobbeltklikk install.bat en gang til.
      pause
      exit /b 0
    )
  )
  echo Last ned Node.js LTS fra https://nodejs.org, installer det, og kjor install.bat en gang til.
  pause
  exit /b 1
)

echo Laster ned siste versjon fra GitHub ...
set "ZIP=%TEMP%\julemesse.zip"
set "TMPD=%TEMP%\julemesse_pakk"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing 'https://github.com/%REPO%/archive/refs/heads/%BRANCH%.zip' -OutFile '%ZIP%'; if(Test-Path '%TMPD%'){Remove-Item '%TMPD%' -Recurse -Force}; Expand-Archive -Path '%ZIP%' -DestinationPath '%TMPD%'; $src=(Get-ChildItem '%TMPD%' -Directory | Select-Object -First 1).FullName; New-Item -ItemType Directory -Force '%DEST%' | Out-Null; Get-ChildItem $src | Where-Object { $_.Name -ne 'install.bat' -and $_.Name -ne 'data' } | Copy-Item -Destination '%DEST%' -Recurse -Force; Copy-Item (Join-Path $src 'install.bat') (Join-Path '%DEST%' 'install.bat') -Force -ErrorAction SilentlyContinue; Remove-Item '%TMPD%' -Recurse -Force; Remove-Item '%ZIP%' -Force"
if errorlevel 1 (
  echo.
  echo Nedlastingen feilet. Sjekk internett og at adressen stemmer:
  echo   https://github.com/%REPO%
  pause
  exit /b 1
)

echo Lager snarvei pa skrivebordet ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Julemessetrekning.lnk'); $s.TargetPath='%DEST%\start.bat'; $s.WorkingDirectory='%DEST%'; $s.Save()" >nul 2>nul

echo.
echo Ferdig! Programmet ligger i:
echo   %DEST%
echo Start med snarveien "Julemessetrekning" pa skrivebordet, eller dobbeltklikk start.bat.
echo Forste gang spor Windows om brannmuren: velg "Tillat" for private nettverk.
echo.
choice /c JN /m "Starte na"
if not errorlevel 2 start "" "%DEST%\start.bat"
endlocal
