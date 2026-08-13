@echo off
REM Packages Anchor for distribution. Run AFTER build.cmd has succeeded.
REM Produces:
REM   dist\Anchor-portable-x64.zip     (portable - unzip and run)
REM   dist\Anchor-portable-arm64.zip   (if dist\arm64 exists)
REM   dist\installers\AnchorSetup-*-x64.exe   (requires Inno Setup 6)
REM   dist\installers\AnchorSetup-*-arm64.exe
REM Inno Setup (free): winget install JRSoftware.InnoSetup

cd /d "%~dp0"

if not exist "dist\x64\Anchor.exe" (
    echo dist\x64\Anchor.exe not found - run build.cmd first.
    pause & exit /b 1
)

echo === Creating portable ZIPs ===
powershell -NoProfile -Command "Compress-Archive -Path 'dist\x64\*' -DestinationPath 'dist\Anchor-portable-x64.zip' -Force"
if exist "dist\arm64\Anchor.exe" (
    powershell -NoProfile -Command "Compress-Archive -Path 'dist\arm64\*' -DestinationPath 'dist\Anchor-portable-arm64.zip' -Force"
)

echo === Building installers ===
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%LocalAppData%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
    echo Inno Setup not found - skipping installers. ZIPs are ready in dist\.
    echo To build Setup.exe files:  winget install JRSoftware.InnoSetup  then re-run this.
    pause & exit /b 0
)

"%ISCC%" /Qp installer.iss
if exist "dist\arm64\Anchor.exe" "%ISCC%" /Qp /DArch=arm64 installer.iss

echo.
echo Done. Upload these to your website / GitHub Releases:
echo   dist\Anchor-portable-x64.zip
echo   dist\Anchor-portable-arm64.zip
echo   dist\installers\AnchorSetup-0.1.0-x64.exe
echo   dist\installers\AnchorSetup-0.1.0-arm64.exe
pause
