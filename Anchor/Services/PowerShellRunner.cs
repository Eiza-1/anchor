using System.Diagnostics;

namespace Anchor.Services;

/// <summary>Runs PowerShell commands. Every command Anchor executes goes through here,
/// so auditing the app's system actions means auditing calls to this class.</summary>
public static class PowerShellRunner
{
    public static async Task<(int ExitCode, string Output, string Error)> RunAsync(string command)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{command.Replace("\"", "\\\"")}\"",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var p = Process.Start(psi)!;
        string output = await p.StandardOutput.ReadToEndAsync();
        string error = await p.StandardError.ReadToEndAsync();
        await p.WaitForExitAsync();
        return (p.ExitCode, output, error);
    }
}
