@echo off
setlocal
cd /d "%~dp0"

echo === 1/3 Publishing ARM64 build ===
dotnet publish Anchor\Anchor.csproj -c Release -r win-arm64 -p:Platform=ARM64
if errorlevel 1 exit /b 1

echo === 2/3 Copying to dist\arm64 ===
robocopy "Anchor\bin\ARM64\Release\net8.0-windows10.0.19041.0\win-arm64\publish" "dist\arm64" /MIR /NFL /NDL
if errorlevel 8 exit /b 1

echo === 3/3 Compiling installer ===
set "ISCC=ISCC.exe"
where ISCC.exe >nul 2>nul || set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
"%ISCC%" /DArch=arm64 installer.iss
if errorlevel 1 exit /b 1

echo.
echo Done: see dist\installers for the AnchorSetup arm64 exe
