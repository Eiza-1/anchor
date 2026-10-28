; Picked up by electron-builder from buildResources.

; Install for the current user without asking "all users or just me?".
; Anchor runs asInvoker and updates itself in place, so a per-user install
; under %LOCALAPPDATA%\Programs never needs admin rights. The one exception is
; a machine that only has an older all-users install: upgrade that one in
; place rather than leaving a second copy behind.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${if} $hasPerMachineInstallation == "1"
    ${andIf} $hasPerUserInstallation == "0"
      StrCpy $isForceMachineInstall "1"
    ${else}
      StrCpy $isForceCurrentInstall "1"
    ${endIf}
  !endif
!macroend
