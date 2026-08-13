using System.Management;

namespace Anchor.Services;

public class DriveStatus
{
    public string Name { get; set; } = "";
    public string MediaType { get; set; } = "Unknown";
    public string Health { get; set; } = "Unknown";
    public bool FailurePredicted { get; set; }
    public int? WearPercent { get; set; }
    public int? TemperatureC { get; set; }
    public ulong SizeBytes { get; set; }
    public string Advice { get; set; } = "";
    public string SizeText => $"{SizeBytes / (double)(1UL << 30):0} GB";
}

public class VolumeSpace
{
    public string Letter { get; set; } = "";
    public long Free { get; set; }
    public long Total { get; set; }
    public double FreePercent => Total > 0 ? Free * 100.0 / Total : 0;
    public string Text => $"{Letter} — {BoostService.FormatBytes(Free)} free of {BoostService.FormatBytes(Total)} ({FreePercent:0}%)";
    public bool Low => FreePercent < 10;
}

/// <summary>Drive failure early-warning via Windows' own S.M.A.R.T. data
/// (MSFT_PhysicalDisk + failure-prediction WMI classes). Warns before data loss.</summary>
public static class DriveHealthService
{
    public static Task<List<DriveStatus>> GetDrivesAsync() => Task.Run(() =>
    {
        var drives = new List<DriveStatus>();
        try
        {
            var scope = new ManagementScope(@"\\.\root\Microsoft\Windows\Storage");
            scope.Connect();
            using var searcher = new ManagementObjectSearcher(scope,
                new ObjectQuery("SELECT FriendlyName, MediaType, HealthStatus, Size, DeviceId FROM MSFT_PhysicalDisk"));
            foreach (ManagementObject d in searcher.Get())
            {
                var status = new DriveStatus
                {
                    Name = d["FriendlyName"]?.ToString() ?? "Disk",
                    SizeBytes = (ulong)(d["Size"] ?? 0UL),
                    MediaType = Convert.ToInt32(d["MediaType"] ?? 0) switch { 3 => "HDD", 4 => "SSD", 5 => "SCM", _ => "Unknown" },
                    Health = Convert.ToInt32(d["HealthStatus"] ?? -1) switch
                    { 0 => "Healthy", 1 => "Warning", 2 => "Unhealthy", _ => "Unknown" }
                };

                // Reliability counters (wear/temperature) where the drive exposes them.
                try
                {
                    using var rel = new ManagementObjectSearcher(scope, new ObjectQuery(
                        "SELECT Wear, Temperature FROM MSFT_StorageReliabilityCounter"));
                    foreach (ManagementObject r in rel.Get())
                    {
                        var wear = Convert.ToInt32(r["Wear"] ?? 0);
                        var temp = Convert.ToInt32(r["Temperature"] ?? 0);
                        if (wear > 0) status.WearPercent = wear;
                        if (temp > 0) status.TemperatureC = temp;
                        break;
                    }
                }
                catch { }

                status.Advice = status.Health switch
                {
                    "Unhealthy" => "⚠ BACK UP YOUR DATA NOW and replace this drive. Failure indicators detected.",
                    "Warning" => "⚠ Back up important files soon. This drive is showing early signs of trouble.",
                    "Healthy" => "No failure signs detected.",
                    _ => "Health data unavailable for this drive."
                };
                drives.Add(status);
            }
        }
        catch { }

        // S.M.A.R.T. failure prediction (root\wmi) as a second signal.
        try
        {
            using var smart = new ManagementObjectSearcher(@"\\.\root\wmi",
                "SELECT PredictFailure FROM MSStorageDriver_FailurePredictStatus");
            int i = 0;
            foreach (ManagementObject s in smart.Get())
            {
                if ((bool)(s["PredictFailure"] ?? false) && i < drives.Count)
                {
                    drives[i].FailurePredicted = true;
                    drives[i].Advice = "⚠ S.M.A.R.T. PREDICTS FAILURE. Back up immediately and replace this drive.";
                }
                i++;
            }
        }
        catch { }
        return drives;
    });

    public static List<VolumeSpace> GetVolumeSpace() =>
        DriveInfo.GetDrives()
            .Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
            .Select(d => new VolumeSpace { Letter = d.Name.TrimEnd('\\'), Free = d.TotalFreeSpace, Total = d.TotalSize })
            .ToList();
}
