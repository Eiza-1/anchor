using Microsoft.Win32;

namespace Anchor.Services;

public class StartupEntry
{
    public string Name { get; set; } = "";
    public string Command { get; set; } = "";
    public string Scope { get; set; } = "";          // "You" or "All users"
    public bool Enabled { get; set; }
    public string EnabledText => Enabled ? "Enabled" : "Disabled";
}

/// <summary>Lists and toggles apps that launch at boot (registry Run keys), the same
/// mechanism Task Manager's Startup tab uses. Nothing is uninstalled — only stopped
/// from auto-starting, and every change is reversible with one click.</summary>
public static class StartupService
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ApprovedKey = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

    public static List<StartupEntry> GetEntries()
    {
        var list = new List<StartupEntry>();
        Collect(Registry.CurrentUser, "You", list);
        Collect(Registry.LocalMachine, "All users", list);
        return list.OrderBy(e => e.Name).ToList();
    }

    private static void Collect(RegistryKey root, string scope, List<StartupEntry> list)
    {
        using var run = root.OpenSubKey(RunKey);
        if (run == null) return;
        using var approved = root.OpenSubKey(ApprovedKey);
        foreach (var name in run.GetValueNames())
        {
            bool enabled = true;
            if (approved?.GetValue(name) is byte[] b && b.Length > 0)
                enabled = (b[0] & 0x01) == 0; // even first byte = enabled, odd = disabled
            list.Add(new StartupEntry
            {
                Name = name,
                Command = run.GetValue(name)?.ToString() ?? "",
                Scope = scope,
                Enabled = enabled
            });
        }
    }

    public static void SetEnabled(StartupEntry entry, bool enabled)
    {
        var root = entry.Scope == "You" ? Registry.CurrentUser : Registry.LocalMachine;
        using var approved = root.CreateSubKey(ApprovedKey);
        var data = new byte[12];
        data[0] = enabled ? (byte)0x02 : (byte)0x03;
        if (!enabled)
        {
            var ft = BitConverter.GetBytes(DateTime.UtcNow.ToFileTimeUtc());
            Array.Copy(ft, 0, data, 4, 8);
        }
        approved.SetValue(entry.Name, data, RegistryValueKind.Binary);
        entry.Enabled = enabled;
    }
}
