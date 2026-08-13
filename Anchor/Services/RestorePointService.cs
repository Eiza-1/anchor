using Microsoft.Win32;

namespace Anchor.Services;

/// <summary>Safety net: creates a System Restore point before Anchor changes anything.</summary>
public static class RestorePointService
{
    /// <summary>Creates a restore point. Returns (success, message).</summary>
    public static async Task<(bool Ok, string Message)> CreateAsync(string description)
    {
        try
        {
            // Windows throttles restore points to one per 24h by default; allow Anchor's
            // safety points to always be created. (Transparent: this sets
            // HKLM\...\SystemRestore\SystemRestorePointCreationFrequency = 0.)
            using (var key = Registry.LocalMachine.CreateSubKey(
                @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore"))
            {
                key.SetValue("SystemRestorePointCreationFrequency", 0, RegistryValueKind.DWord);
            }

            var (code, _, err) = await PowerShellRunner.RunAsync(
                $"Enable-ComputerRestore -Drive $env:SystemDrive; " +
                $"Checkpoint-Computer -Description '{description.Replace("'", "")}' -RestorePointType MODIFY_SETTINGS");

            return code == 0
                ? (true, "Restore point created. You can roll back any change from Windows System Restore.")
                : (false, $"Could not create restore point: {err}");
        }
        catch (Exception ex)
        {
            return (false, $"Could not create restore point: {ex.Message}");
        }
    }
}
