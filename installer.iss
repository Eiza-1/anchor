; Inno Setup script for Anchor.
; Compile x64:   ISCC.exe installer.iss
; Compile arm64: ISCC.exe /DArch=arm64 installer.iss

#ifndef Arch
#define Arch "x64"
#endif
#define MyAppName "Anchor"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Anchor (open source)"
#define MyAppURL "https://github.com/Eiza-1/anchor"

[Setup]
AppId={{7A3C5E10-9B2D-4F60-A1E1-3C9D8F5B2A71}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=dist\installers
OutputBaseFilename=AnchorSetup-{#MyAppVersion}-{#Arch}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Anchor itself requires admin, so the installer does too
PrivilegesRequired=admin
UninstallDisplayIcon={app}\Anchor.exe
#if Arch == "x64"
; x64os = real x64 Windows only; keeps ARM users off the emulated build now that a native arm64 installer exists
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
#elif Arch == "arm64"
ArchitecturesAllowed=arm64
ArchitecturesInstallIn64BitMode=arm64
#endif
#if FileExists("Anchor\Assets\anchor.ico")
SetupIconFile=Anchor\Assets\anchor.ico
#endif

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Files]
Source: "dist\{#Arch}\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\Anchor.exe"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Anchor.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Anchor.exe"; Description: "Launch {#MyAppName}"; Flags: postinstall nowait skipifsilent runascurrentuser
