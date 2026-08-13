using Microsoft.Win32;

namespace Anchor.Services;

public class PrivacyTweak
{
    public string Name { get; init; } = "";
    public string Description { get; init; } = "";
    public string Hive { get; init; } = "HKCU";       // HKCU or HKLM
    public string KeyPath { get; init; } = "";
    public string ValueName { get; init; } = "";
    public int PrivateValue { get; init; }            // value when tweak is ON (more private)
    public int DefaultValue { get; init; }            // value when tweak is OFF (Windows default)
    public bool IsApplied { get; set; }
}

/// <summary>Privacy &amp; telemetry toggles. Each tweak lists the exact registry value it
/// changes — no hidden behavior. All are reversible from this same page.</summary>
public static class PrivacyService
{
    public static List<PrivacyTweak> GetTweaks()
    {
        var tweaks = new List<PrivacyTweak>
        {
            new() { Name = "Limit diagnostic data (telemetry)",
                Description = @"Sets diagnostic data to the minimum. Registry: HKLM\SOFTWARE\Policies\Microsoft\Windows\DataCollection\AllowTelemetry = 0",
                Hive = "HKLM", KeyPath = @"SOFTWARE\Policies\Microsoft\Windows\DataCollection", ValueName = "AllowTelemetry", PrivateValue = 0, DefaultValue = 1 },
            new() { Name = "Disable advertising ID",
                Description = @"Stops apps using your advertising ID for personalized ads. Registry: HKCU\...\AdvertisingInfo\Enabled = 0",
                Hive = "HKCU", KeyPath = @"Software\Microsoft\Windows\CurrentVersion\AdvertisingInfo", ValueName = "Enabled", PrivateValue = 0, DefaultValue = 1 },
            new() { Name = "Disable tailored experiences",
                Description = "Stops Windows using your diagnostic data for tips and ad suggestions.",
                Hive = "HKCU", KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Privacy", ValueName = "TailoredExperiencesWithDiagnosticDataEnabled", PrivateValue = 0, DefaultValue = 1 },
            new() { Name = "Disable activity history upload",
                Description = "Stops your activity timeline being sent to Microsoft.",
                Hive = "HKLM", KeyPath = @"SOFTWARE\Policies\Microsoft\Windows\System", ValueName = "UploadUserActivities", PrivateValue = 0, DefaultValue = 1 },
            new() { Name = "Disable Start menu web suggestions",
                Description = "Removes Bing web results and suggestions from Start menu search. Frees resources and reduces data sent.",
                Hive = "HKCU", KeyPath = @"Software\Policies\Microsoft\Windows\Explorer", ValueName = "DisableSearchBoxSuggestions", PrivateValue = 1, DefaultValue = 0 },
            new() { Name = "Disable app launch tracking",
                Description = "Stops Windows tracking which apps you launch (used for Start menu suggestions).",
                Hive = "HKCU", KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced", ValueName = "Start_TrackProgs", PrivateValue = 0, DefaultValue = 1 },
            new() { Name = "Disable feedback requests",
                Description = "Stops Windows periodically asking for feedback.",
                Hive = "HKCU", KeyPath = @"Software\Microsoft\Siuf\Rules", ValueName = "NumberOfSIUFInPeriod", PrivateValue = 0, DefaultValue = 1 },
        };
        foreach (var t in tweaks) t.IsApplied = ReadValue(t) == t.PrivateValue;
        return tweaks;
    }

    public static void Apply(PrivacyTweak t, bool on)
    {
        var root = t.Hive == "HKLM" ? Registry.LocalMachine : Registry.CurrentUser;
        using var key = root.CreateSubKey(t.KeyPath);
        key.SetValue(t.ValueName, on ? t.PrivateValue : t.DefaultValue, RegistryValueKind.DWord);
        t.IsApplied = on;
    }

    private static int? ReadValue(PrivacyTweak t)
    {
        var root = t.Hive == "HKLM" ? Registry.LocalMachine : Registry.CurrentUser;
        using var key = root.OpenSubKey(t.KeyPath);
        return key?.GetValue(t.ValueName) as int?;
    }
}
