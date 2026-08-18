import { useEffect, useState } from "react";
import { AlertTriangle, HardDrive, HardDriveDownload, RefreshCw, Save } from "lucide-react";
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress, Skeleton } from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import { cached, invalidate, peek } from "@/lib/store";

type Drive = { name: string; media: string; health: string; size: number; wear?: number; temp?: number; predictFailure?: boolean };
type Volume = { DeviceID: string; FreeSpace: number; Size: number };

const TTL = 60_000;

export default function DrivesPage() {
  const [drives, setDrives] = useState<Drive[] | null>(peek<Drive[]>("drives") ?? null);
  const [vols, setVols] = useState<Volume[]>(peek<Volume[]>("volumes") ?? []);
  const [loading, setLoading] = useState(false);

  async function scan(force = false) {
    setLoading(true);
    if (force) invalidate("drives", "volumes");
    const [d, v] = await Promise.all([
      cached("drives", TTL, () => window.anchor.driveHealth()),
      cached("volumes", TTL, () => window.anchor.volumes()),
    ]);
    setDrives(d);
    setVols(v);
    setLoading(false);
  }
  useEffect(() => { scan(); }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Drive Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Early warnings for SSD/HDD failure using Windows' own S.M.A.R.T. and storage-reliability data. If you ever see
          a warning here, back up first, diagnose second.
        </p>
      </div>

      <Button variant="outline" size="sm" onClick={() => scan(true)} loading={loading}>
        {!loading && <RefreshCw />} Scan drives
      </Button>

      <div className="space-y-3">
        {drives === null ? (
          [...Array(2)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
        ) : drives.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No drive health data available. Try running Anchor as administrator.
          </p>
        ) : (
          drives.map((d, i) => {
            const bad = d.predictFailure || d.health === "Unhealthy";
            const warn = d.health === "Warning";
            const DriveIcon = d.media === "SSD" ? HardDriveDownload : HardDrive;
            return (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DriveIcon className="size-4 text-muted-foreground" />
                    {d.name}
                    <Badge variant={bad ? "destructive" : warn ? "warning" : "success"}>{d.health}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-4 text-muted-foreground">
                    <span>{d.media}</span>
                    <span>{formatBytes(d.size)}</span>
                    {d.wear ? <span>Wear {d.wear}%</span> : null}
                    {d.temp ? <span>{d.temp}°C</span> : null}
                  </div>
                  {bad ? (
                    <Alert variant="destructive">
                      <span className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {d.predictFailure ? "S.M.A.R.T. predicts failure." : "Failure indicators detected."} Back up
                          your data now and replace this drive.
                        </span>
                      </span>
                    </Alert>
                  ) : warn ? (
                    <Alert variant="warning">
                      <span className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>Back up important files soon. This drive is showing early signs of trouble.</span>
                      </span>
                    </Alert>
                  ) : (
                    <p className="text-muted-foreground">No failure signs detected.</p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Disk space</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {vols.map((v) => {
            const freePct = (v.FreeSpace / v.Size) * 100;
            return (
              <div key={v.DeviceID} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <Save className="size-3.5 text-muted-foreground" />
                    {v.DeviceID}
                  </span>
                  <span className={freePct < 10 ? "text-amber-400" : "text-muted-foreground"}>
                    {formatBytes(v.FreeSpace)} free of {formatBytes(v.Size)} ({Math.round(freePct)}%)
                  </span>
                </div>
                <Progress value={100 - freePct} />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
