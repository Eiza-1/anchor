@echo off
REM Builds Anchor for x64 and x86 as self-contained apps.
REM Requires Visual Studio 2022 (Community is fine) with the
REM "Windows application development" workload installed.
REM WinUI 3 apps cannot be built with the bare .NET SDK - the resource
REM compiler (PriGen) ships with Visual Studio, hence this script uses
REM Visual Studio's MSBuild instead of "dotnet publish".

cd /d "%~dp0"

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
    echo Visual Studio was not found. Install Visual Studio 2022 Community with
    echo the "Windows application development" workload, then run this again.
    echo   winget install Microsoft.VisualStudio.2022.Community
    pause
    exit /b 1
)

for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe`) do set "MSBUILD=%%i"
if not defined MSBUILD (
    echo MSBuild not found in your Visual Studio install. Open the Visual Studio
    echo Installer and add the "Windows application development" workload.
    pause
    exit /b 1
)

echo Using: %MSBUILD%
echo.

echo === Restoring packages ===
"%MSBUILD%" Anchor\Anchor.csproj /t:Restore /p:Configuration=Release /p:Platform=x64 /nologo /v:m
if errorlevel 1 goto :fail

echo === Publishing x64 ===
"%MSBUILD%" Anchor\Anchor.csproj /t:Publish /p:Configuration=Release /p:Platform=x64 /p:RuntimeIdentifier=win-x64 /p:SelfContained=true /p:PublishDir=%~dp0dist\x64\ /nologo /v:m
if errorlevel 1 goto :fail

copy /y "Anchor\bin\x64\Release\net8.0-windows10.0.19041.0\win-x64\Anchor.pri" "dist\x64\" >nul

echo.
echo Done. App is in:
echo   %~dp0dist\x64\Anchor.exe
pause
exit /b 0

:fail
echo Build failed - see errors above.
pause
exit /b 1
