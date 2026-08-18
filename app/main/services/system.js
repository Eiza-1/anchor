// Windows Update, drives, performance, startup apps, bloatware, privacy, tools,
// autounattend — all via documented Windows mechanisms (WUA API, CIM/WMI, registry).
const { spawn } = require("child_process");
const { runPS, runPSJson } = require("./ps");

// ---------- Windows Update ----------
async function buildInfo() {
  // Windows 11 still reports "Windows 10" in ProductName — Microsoft never updated
  // that registry value. The build number is the reliable signal: 22000+ is Win 11.
  return await runPSJson(`
$k = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$name = [string]$k.ProductName
$build = [int]$k.CurrentBuild
if ($build -ge 22000 -and $name -notmatch 'Server') {
  $name = $name -replace 'Windows 10', 'Windows 11'
}
[PSCustomObject]@{
  ProductName   = $name
  DisplayVersion= [string]$k.DisplayVersion
  CurrentBuild  = [string]$k.CurrentBuild
  UBR           = [int]$k.UBR
  EditionID     = [string]$k.EditionID
} | ConvertTo-Json -Compress
`);
}

async function checkUpdates() {
  const r = await runPSJson(`
$ErrorActionPreference='Stop'
try {
  $session=New-Object -ComObject Microsoft.Update.Session
  $searcher=$session.CreateUpdateSearcher()
  $result=$searcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
  $titles=@(); for($i=0;$i -lt [math]::Min($result.Updates.Count,15);$i++){ $titles+=$result.Updates.Item($i).Title }
  $last=$null
  $hc=$searcher.GetTotalHistoryCount()
  if($hc -gt 0){
    $h=$searcher.QueryHistory(0,[math]::Min($hc,25))
    for($i=0;$i -lt $h.Count;$i++){ if($h.Item($i).ResultCode -eq 2){ $last=$h.Item($i).Title+' — '+$h.Item($i).Date.ToLocalTime().ToShortDateString(); break } }
  }
  [PSCustomObject]@{pending=$result.Updates.Count; titles=$titles; last=$last} | ConvertTo-Json -Compress
} catch { [PSCustomObject]@{error=$_.Exception.Message} | ConvertTo-Json -Compress }
`);
  return r ?? { error: "Windows Update Agent unavailable." };
}

// ---------- Drives ----------
async function driveHealth() {
  const drives = await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$out=@()
foreach($d in Get-PhysicalDisk){
  $rel=$d | Get-StorageReliabilityCounter
  $out+=[PSCustomObject]@{
    name=$d.FriendlyName; media=[string]$d.MediaType; health=[string]$d.HealthStatus
    size=$d.Size; wear=$rel.Wear; temp=$rel.Temperature
  }
}
$i=0
foreach($s in (Get-CimInstance -Namespace root\\wmi -ClassName MSStorageDriver_FailurePredictStatus)){
  if($s.PredictFailure -and $i -lt $out.Count){ $out[$i] | Add-Member -NotePropertyName predictFailure -NotePropertyValue $true }
  $i++
}
ConvertTo-Json @($out) -Compress
`);
  return Array.isArray(drives) ? drives : drives ? [drives] : [];
}

async function volumes() {
  const v = await runPSJson(
    "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,FreeSpace,Size | ConvertTo-Json -Compress"
  );
  return Array.isArray(v) ? v : v ? [v] : [];
}

// ---------- Device health (Device Manager problem codes) ----------
// Windows records a ConfigManagerErrorCode per device — the same number Device
// Manager shows as "Code 43" etc. Anything non-zero means the device isn't
// working, which a health check should notice.
const DEVICE_ERRORS = {
  1:  ["Not configured correctly", "Reinstall the driver for this device."],
  3:  ["Driver may be corrupted", "Reinstall the driver, or check for low memory/resources."],
  9:  ["Windows can't identify this hardware", "Contact the hardware vendor for a proper driver."],
  10: ["Device cannot start", "Update the driver; if it persists the hardware may be failing."],
  12: ["Not enough free resources", "Disable another device, or free up IRQ/memory resources in BIOS."],
  14: ["Needs a restart", "Restart your PC to finish setting up this device."],
  16: ["Windows can't identify all resources it uses", "Assign resources manually in Device Manager."],
  18: ["Drivers need reinstalling", "Reinstall the driver for this device."],
  19: ["Registry information is corrupt", "Uninstall the device, then reinstall the driver."],
  21: ["Windows is removing the device", "Restart your PC."],
  22: ["Disabled", "This device was switched off — enable it in Device Manager if you need it."],
  24: ["Not present, not working, or missing a driver", "Reseat the hardware and reinstall its driver."],
  28: ["Drivers are not installed", "Install the driver from the hardware vendor."],
  29: ["Disabled by firmware", "Enable the device in your BIOS/UEFI settings."],
  31: ["Not working properly — driver failed to load", "Reinstall the driver from the vendor's site."],
  32: ["Start type is disabled in the registry", "Reinstall the driver."],
  33: ["Windows can't determine which resources it needs", "Hardware may be faulty — contact the vendor."],
  35: ["Firmware lacks information for this device", "Update your BIOS/UEFI."],
  37: ["Driver returned a failure", "Reinstall the driver."],
  38: ["A previous instance is still loaded", "Restart your PC."],
  39: ["Driver is corrupted or missing", "Reinstall the driver."],
  40: ["Registry service key is invalid", "Reinstall the driver."],
  41: ["Driver loaded but Windows can't find the device", "Reseat or reconnect the hardware."],
  42: ["A duplicate device is already running", "Restart your PC."],
  43: ["Windows stopped this device because it reported problems", "Usually a driver fault or failing hardware: reinstall the vendor driver, and if it returns the device may need service or replacement."],
  44: ["Stopped by an application or service", "Restart your PC."],
  47: ["Prepared for safe removal", "Unplug and reconnect the device, or restart."],
  48: ["Driver blocked because of known problems", "Get an updated driver from the vendor."],
  49: ["Registry hive is too large", "Remove unused hardware entries from the registry."],
  52: ["Driver signature couldn't be verified", "Install a properly signed driver from the vendor."],
};

async function deviceHealth() {
  const r = await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_PnPEntity |
  Where-Object { $_.ConfigManagerErrorCode -ne 0 -and $_.ConfigManagerErrorCode -ne $null } |
  Select-Object Name, PNPClass, ConfigManagerErrorCode |
  ConvertTo-Json -Compress
`);
  const list = Array.isArray(r) ? r : r ? [r] : [];
  return list
    // 45 = "not currently connected" — normal for unplugged USB/bluetooth kit
    .filter((d) => d.ConfigManagerErrorCode !== 45)
    .map((d) => {
      const code = d.ConfigManagerErrorCode;
      const [meaning, advice] = DEVICE_ERRORS[code] ?? ["Reported a problem", "Check this device in Device Manager."];
      return {
        name: d.Name ?? "Unknown device",
        deviceClass: d.PNPClass ?? "",
        code,
        meaning,
        advice,
        // 22 (user-disabled) is informational; everything else is a real fault
        severity: code === 22 ? "info" : "bad",
      };
    });
}

// ---------- Performance ----------
async function perfSample() {
  return await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$cpu=[math]::Round((Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples[0].CookedValue)
$disk=[math]::Round([math]::Min(100,(Get-Counter '\\PhysicalDisk(_Total)\\% Disk Time').CounterSamples[0].CookedValue))
$os=Get-CimInstance Win32_OperatingSystem
$total=$os.TotalVisibleMemorySize*1024; $free=$os.FreePhysicalMemory*1024
[PSCustomObject]@{cpu=$cpu; disk=$disk; memTotal=$total; memUsed=($total-$free)} | ConvertTo-Json -Compress
`);
}

async function topProcesses() {
  const r = await runPSJson(`
Get-Process | Group-Object ProcessName | ForEach-Object {
  [PSCustomObject]@{name=$_.Name; count=$_.Count; bytes=($_.Group | Measure-Object PrivateMemorySize64 -Sum).Sum}
} | Sort-Object bytes -Descending | Select-Object -First 8 | ConvertTo-Json -Compress
`);
  return Array.isArray(r) ? r : r ? [r] : [];
}

// ---------- Startup apps ----------
async function startupList() {
  const r = await runPSJson(`
$ErrorActionPreference='SilentlyContinue'
$out=@()
$scopes=@(@{root='HKCU:'; label='You'},@{root='HKLM:'; label='All users'})
foreach($s in $scopes){
  $runKey=$s.root+'\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  $apprKey=$s.root+'\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
  $run=Get-Item $runKey
  if($run){
    foreach($name in $run.GetValueNames()){
      $enabled=$true
      $appr=Get-ItemProperty -Path $apprKey -Name $name
      if($appr){ $bytes=$appr.$name; if($bytes -and ($bytes[0] % 2) -eq 1){ $enabled=$false } }
      $out+=[PSCustomObject]@{name=$name; command=$run.GetValue($name); scope=$s.label; enabled=$enabled}
    }
  }
}
ConvertTo-Json @($out) -Compress
`);
  return Array.isArray(r) ? r : r ? [r] : [];
}

async function startupToggle(name, scope, enable) {
  const root = scope === "You" ? "HKCU:" : "HKLM:";
  const safe = name.replace(/'/g, "''");
  const { code, err } = await runPS(`
$key='${root}\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
if(-not (Test-Path $key)){ New-Item -Path $key -Force | Out-Null }
$bytes=New-Object byte[] 12
${enable
    ? "$bytes[0]=2"
    : "$bytes[0]=3; $ft=[BitConverter]::GetBytes([DateTime]::UtcNow.ToFileTimeUtc()); [Array]::Copy($ft,0,$bytes,4,8)"}
Set-ItemProperty -Path $key -Name '${safe}' -Value $bytes -Type Binary
`);
  return { ok: code === 0, error: err };
}

// ---------- Bloatware ----------
const SAFE_APPS = [
  "Microsoft.BingNews", "Microsoft.BingWeather", "Microsoft.BingSearch",
  "Microsoft.GetHelp", "Microsoft.Getstarted", "Microsoft.WindowsFeedbackHub",
  "Microsoft.Microsoft3DViewer", "Microsoft.MicrosoftOfficeHub",
  "Microsoft.MicrosoftSolitaireCollection", "Microsoft.MixedReality.Portal",
  "Microsoft.People", "Microsoft.SkypeApp", "Microsoft.Todos",
  "Microsoft.WindowsMaps", "Microsoft.ZuneMusic", "Microsoft.ZuneVideo",
  "Microsoft.YourPhone", "Clipchamp.Clipchamp", "Microsoft.549981C3F5F10",
  "MicrosoftTeams", "MSTeams", "Microsoft.Wallet", "Microsoft.WindowsAlarms",
  "Microsoft.WindowsSoundRecorder", "Microsoft.PowerAutomateDesktop",
  "Microsoft.XboxApp", "Microsoft.GamingApp", "Microsoft.XboxGameOverlay",
  "Microsoft.XboxGamingOverlay", "Microsoft.XboxSpeechToTextOverlay",
];
const BLOCKED_APPS = [
  "Microsoft.WindowsStore", "Microsoft.WindowsCalculator", "Microsoft.Windows.Photos",
  "Microsoft.WindowsNotepad", "Microsoft.ScreenSketch", "Microsoft.WindowsTerminal",
  "Microsoft.SecHealthUI", "Microsoft.DesktopAppInstaller", "Microsoft.WindowsCamera",
  "Microsoft.VCLibs", "Microsoft.NET", "Microsoft.UI.Xaml", "Microsoft.WebpImageExtension",
  "Microsoft.HEIFImageExtension", "Microsoft.VP9VideoExtensions", "Microsoft.WebMediaExtensions",
  "Microsoft.RawImageExtension", "Microsoft.WindowsAppRuntime", "MicrosoftWindows.Client",
];

async function bloatwareList() {
  const r = await runPSJson(
    "Get-AppxPackage | Where-Object { -not $_.IsFramework } | Select-Object Name,PackageFullName | ConvertTo-Json -Compress"
  );
  const list = Array.isArray(r) ? r : r ? [r] : [];
  return list
    .filter((a) => !BLOCKED_APPS.some((b) => a.Name?.toLowerCase().startsWith(b.toLowerCase())))
    .map((a) => ({ name: a.Name, packageFullName: a.PackageFullName, safe: SAFE_APPS.includes(a.Name) }))
    .sort((a, b) => (b.safe ? 1 : 0) - (a.safe ? 1 : 0) || a.name.localeCompare(b.name));
}

async function bloatwareRemove(packages) {
  const results = [];
  for (const p of packages) {
    const { code, err } = await runPS(`Remove-AppxPackage -Package '${p.packageFullName}'`);
    results.push({ name: p.name, ok: code === 0, error: err });
  }
  return results;
}

// ---------- Privacy ----------
const TWEAKS = [
  { id: "telemetry", name: "Limit diagnostic data (telemetry)",
    desc: "Sets diagnostic data to the minimum. Registry: HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection\\AllowTelemetry = 0",
    hive: "HKLM:", key: "SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", value: "AllowTelemetry", on: 0, off: 1 },
  { id: "adid", name: "Disable advertising ID",
    desc: "Stops apps using your advertising ID for personalized ads. Registry: HKCU\\...\\AdvertisingInfo\\Enabled = 0",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo", value: "Enabled", on: 0, off: 1 },
  { id: "tailored", name: "Disable tailored experiences",
    desc: "Stops Windows using your diagnostic data for tips and ad suggestions.",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\Privacy", value: "TailoredExperiencesWithDiagnosticDataEnabled", on: 0, off: 1 },
  { id: "activity", name: "Disable activity history upload",
    desc: "Stops your activity timeline being sent to Microsoft.",
    hive: "HKLM:", key: "SOFTWARE\\Policies\\Microsoft\\Windows\\System", value: "UploadUserActivities", on: 0, off: 1 },
  { id: "searchweb", name: "Disable Start menu web suggestions",
    desc: "Removes Bing web results from Start menu search. Frees resources and reduces data sent.",
    hive: "HKCU:", key: "Software\\Policies\\Microsoft\\Windows\\Explorer", value: "DisableSearchBoxSuggestions", on: 1, off: 0 },
  { id: "apptrack", name: "Disable app launch tracking",
    desc: "Stops Windows tracking which apps you launch (used for Start menu suggestions).",
    hive: "HKCU:", key: "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced", value: "Start_TrackProgs", on: 0, off: 1 },
  { id: "feedback", name: "Disable feedback requests",
    desc: "Stops Windows periodically asking for feedback.",
    hive: "HKCU:", key: "Software\\Microsoft\\Siuf\\Rules", value: "NumberOfSIUFInPeriod", on: 0, off: 1 },
];

async function privacyList() {
  const reads = TWEAKS.map(
    (t, i) => `$v${i}=(Get-ItemProperty -Path '${t.hive}\\${t.key}' -Name '${t.value}' -ErrorAction SilentlyContinue).'${t.value}'`
  ).join("\n");
  const outs = TWEAKS.map((t, i) => `'${t.id}'=$v${i}`).join(";");
  const values = (await runPSJson(`${reads}\n@{${outs}} | ConvertTo-Json -Compress`)) ?? {};
  return TWEAKS.map((t) => ({ ...t, applied: values[t.id] === t.on }));
}

async function privacyApply(id, on) {
  const t = TWEAKS.find((x) => x.id === id);
  if (!t) return { ok: false, error: "Unknown tweak" };
  const { code, err } = await runPS(`
if(-not (Test-Path '${t.hive}\\${t.key}')){ New-Item -Path '${t.hive}\\${t.key}' -Force | Out-Null }
Set-ItemProperty -Path '${t.hive}\\${t.key}' -Name '${t.value}' -Value ${on ? t.on : t.off} -Type DWord
`);
  return { ok: code === 0, error: err };
}

// ---------- Tools & Autounattend ----------
function openTool(cmd) {
  spawn("cmd", ["/c", "start", "", cmd], { windowsHide: true, detached: true });
}

function generateAutounattend(o) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let order = 1;
  let firstLogon = "";
  const cmd = (c) => {
    firstLogon += `
                <SynchronousCommand wcm:action="add">
                    <Order>${order++}</Order>
                    <CommandLine>${esc(c)}</CommandLine>
                </SynchronousCommand>`;
  };
  if (o.disableTelemetry)
    cmd("reg add HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection /v AllowTelemetry /t REG_DWORD /d 0 /f");
  if (o.localAccountOnly)
    cmd("reg add HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\OOBE /v BypassNRO /t REG_DWORD /d 1 /f");

  const bypass = o.bypassHardwareChecks
    ? `
            <component name="Microsoft-Windows-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
                <RunSynchronous>
                    <RunSynchronousCommand wcm:action="add"><Order>1</Order><Path>reg add HKLM\\SYSTEM\\Setup\\LabConfig /v BypassTPMCheck /t REG_DWORD /d 1 /f</Path></RunSynchronousCommand>
                    <RunSynchronousCommand wcm:action="add"><Order>2</Order><Path>reg add HKLM\\SYSTEM\\Setup\\LabConfig /v BypassSecureBootCheck /t REG_DWORD /d 1 /f</Path></RunSynchronousCommand>
                    <RunSynchronousCommand wcm:action="add"><Order>3</Order><Path>reg add HKLM\\SYSTEM\\Setup\\LabConfig /v BypassRAMCheck /t REG_DWORD /d 1 /f</Path></RunSynchronousCommand>
                </RunSynchronous>
            </component>`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by Anchor (open-source). Review before use: this file automates Windows Setup. -->
<unattend xmlns="urn:schemas-microsoft-com:unattend" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
    <settings pass="windowsPE">
        <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
            <SetupUILanguage><UILanguage>${esc(o.locale)}</UILanguage></SetupUILanguage>
            <InputLocale>${esc(o.locale)}</InputLocale>
            <SystemLocale>${esc(o.locale)}</SystemLocale>
            <UILanguage>${esc(o.locale)}</UILanguage>
            <UserLocale>${esc(o.locale)}</UserLocale>
        </component>${bypass}
    </settings>
    <settings pass="specialize">
        <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
            <ComputerName>${esc(o.computerName)}</ComputerName>
            <TimeZone>${esc(o.timeZone)}</TimeZone>
        </component>
    </settings>
    <settings pass="oobeSystem">
        <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
            <OOBE>
                <HideEULAPage>true</HideEULAPage>
                <ProtectYourPC>${o.skipPrivacyQuestions ? 3 : 1}</ProtectYourPC>
                <HideOnlineAccountScreens>${o.localAccountOnly}</HideOnlineAccountScreens>
            </OOBE>
            <UserAccounts>
                <LocalAccounts>
                    <LocalAccount wcm:action="add">
                        <Name>${esc(o.userName)}</Name>
                        <Group>Administrators</Group>
                        <DisplayName>${esc(o.userName)}</DisplayName>
                    </LocalAccount>
                </LocalAccounts>
            </UserAccounts>
            <FirstLogonCommands>${firstLogon}
            </FirstLogonCommands>
        </component>
    </settings>
</unattend>`;
}

module.exports = {
  buildInfo, checkUpdates, driveHealth, volumes, perfSample, topProcesses, deviceHealth,
  startupList, startupToggle, bloatwareList, bloatwareRemove,
  privacyList, privacyApply, openTool, generateAutounattend,
};
