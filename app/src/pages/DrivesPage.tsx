import { useEffect, useState } from "react";
import {
  AlertTriangle, HardDrive, HardDriveDownload, MemoryStick, Play, RefreshCw, Thermometer, Timer,
} from "lucide-react";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle,
  Select, Skeleton,
} from "@/components/ui";
import { cn, formatBytes } from "@/lib/utils";
import { invalidate, peek } from "@/lib/store";
import { Q } from "@/lib/queries";
import { runTask, useTask } from "@/lib/tasks";
import { tempInfo, volumeStats } from "@/lib/drives";
import { DiskRing } from "@/components/DiskRing";

type Drive = { name: string; media: string; health: string; size: number; wear?: number; temp?: number; predictFailure?: boolean };
type BenchResult = Awaited<ReturnType<typeof window.anchor.benchRun>>;
type Volume = { DeviceID: string; FreeSpace: number; Size: number };

export default function DrivesPage() {
  const [drives, setDrives] = useState<Drive[] | null>(peek<Drive[]>("drives") ?? null);
  const [vols, setVols] = useState<Volume[]>(peek<Volume[]>("volumes") ?? []);
  const [loading, setLoading] = useState(false);
  const [admin, setAdmin] = useState(peek<boolean>("isAdmin") ?? false);

  const [benchDrive, setBenchDrive] = useState("C:");
  const [benchSize, setBenchSize] = useState(256);
  const benchTask = useTask<BenchResult>("drives:bench");
  const benching = benchTask?.status === "running";
  const bench: BenchResult | null =
    benchTask?.result ?? (benchTask?.status === "error" ? { error: benchTask.error } : null);
  const [memTest, setMemTest] = useState<Awaited<ReturnType<typeof window.anchor.memoryTestResults>> | null>(null);

  useEffect(() => { window.anchor.memoryTestResults().then(setMemTest); }, []);
  useEffect(() => { Q.isAdmin().then(setAdmin).catch(() => {}); }, []);

  function runBench() {
    runTask(
      "drives:bench",
      {
        label: "Speed test",
        where: { section: "system", tab: "drives" },
        isError: (r: BenchResult) => r.error ?? null,
        summarize: (r) => `Read ${r.seqReadMB} MB/s`,
      },
      () => window.anchor.benchRun(benchDrive, benchSize),
    );
  }

  async function scan(force = false) {
    setLoading(true);
    if (force) invalidate("drives", "volumes");
    await Promise.allSettled([Q.drives().then(setDrives), Q.volumes().then(setVols)]);
    setLoading(false);
  }
  useEffect(() => { scan(); }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">

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
                    <TempChip temp={d.temp} admin={admin} />
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
          <CardDescription>
            SSDs need free space to shuffle data around — below about 10% they slow down measurably and wear faster.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          {vols.map((v) => {
            const st = volumeStats(v);
            return (
              <div key={v.DeviceID} className="space-y-2">
                <DiskRing stats={st} label={v.DeviceID} />
                {st.level !== "ok" && (
                  <p className={cn("text-xs", st.level === "critical" ? "text-red-400" : "text-amber-400")}>
                    {st.level === "critical"
                      ? `Critically low. Windows needs room for updates and the page file — free up at least ${formatBytes(st.total * 0.1 - st.free)} to get back to 10%.`
                      : `Getting low. Aim for ${formatBytes(st.total * 0.1)} free (10%) to keep performance and drive life healthy.`}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* speed benchmark */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="size-4 text-sky-500" /> Speed test
          </CardTitle>
          <CardDescription>
            The same measurements CrystalDiskMark takes — sequential and random 4K, read and write — using unbuffered
            I/O so you're timing the drive rather than Windows' cache.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-28" value={benchDrive} onChange={(e) => setBenchDrive(e.target.value)}>
              {vols.map((v) => <option key={v.DeviceID}>{v.DeviceID}</option>)}
            </Select>
            <Select className="w-40" value={String(benchSize)} onChange={(e) => setBenchSize(Number(e.target.value))}>
              <option value="128">Quick (128 MB)</option>
              <option value="256">Standard (256 MB)</option>
              <option value="1024">Thorough (1 GB)</option>
            </Select>
            <Button onClick={runBench} loading={benching}>
              {!benching && <Play />} Run speed test
            </Button>
          </div>

          {benching && (
            <p className="text-xs text-muted-foreground">
              Writing and reading test data… this takes up to a minute and briefly loads the drive.
            </p>
          )}

          {bench?.error && <Alert variant="warning">{bench.error}</Alert>}

          {bench && !bench.error && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <BenchStat label="Sequential read" value={`${bench.seqReadMB} MB/s`} />
                <BenchStat label="Sequential write" value={`${bench.seqWriteMB} MB/s`} />
                <BenchStat label="Random 4K read" value={`${bench.rndReadMB} MB/s`} sub={`${bench.rndReadIOPS?.toLocaleString()} IOPS`} />
                <BenchStat label="Random 4K write" value={`${bench.rndWriteMB} MB/s`} sub={`${bench.rndWriteIOPS?.toLocaleString()} IOPS`} />
              </div>
              <Alert variant={verdict(bench).tone}>{verdict(bench).text}</Alert>
              {bench.unbuffered === false && (
                <p className="text-xs text-muted-foreground">
                  This drive wouldn't allow unbuffered access, so read figures include Windows' cache and are higher
                  than the drive's real speed.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Rough guide: NVMe SSDs read 1,500–7,000 MB/s, SATA SSDs 400–550, hard drives 80–160. Random 4K matters
                far more for everyday responsiveness than the big sequential numbers.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* RAM test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MemoryStick className="size-4 text-sky-500" /> Memory (RAM) test
          </CardTitle>
          <CardDescription>
            Faulty RAM causes random crashes, corrupted files and blue screens that look like software problems.
            Windows' own memory test runs before Windows loads, which is the only way to test memory properly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {memTest?.found ? (
            <Alert variant={memTest.passed ? "success" : "destructive"}>
              Last test {memTest.time?.slice(0, 16)}: {memTest.passed
                ? "no memory errors found."
                : `problems were reported — ${memTest.message}`}
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">No previous memory test found on this PC.</p>
          )}
          <Button variant="outline" onClick={() => window.anchor.scheduleMemoryTest()}>
            Open Windows Memory Diagnostic
          </Button>
          <p className="text-xs text-muted-foreground">
            Choosing "Restart now" runs the test immediately; it takes several minutes and your PC is unusable during
            it. Results appear here afterwards.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function TempChip({ temp, admin }: { temp?: number | null; admin: boolean }) {
  const t = tempInfo(temp, admin);
  const tone = t.tone === "hot" ? "text-red-400" : t.tone === "warm" ? "text-amber-400" : t.tone === "normal" ? "text-foreground" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1", tone)}>
      <Thermometer className="size-3.5" /> {t.text}
    </span>
  );
}

function BenchStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Plain-language reading of the numbers. */
function verdict(b: { seqReadMB?: number; rndReadMB?: number }): { tone: "success" | "warning" | "destructive"; text: string } {
  const seq = b.seqReadMB ?? 0;
  const rnd = b.rndReadMB ?? 0;
  if (seq > 1200)
    return { tone: "success", text: `NVMe-class speed. Random 4K read of ${rnd} MB/s means apps and files open essentially instantly.` };
  if (seq > 300)
    return { tone: "success", text: `SATA SSD speed — healthy. Random 4K read of ${rnd} MB/s is fine for everyday use.` };
  if (seq > 120)
    return { tone: "warning", text: "These are hard-drive speeds. If this is meant to be an SSD, check the cable or port; if it's a mechanical drive, moving Windows to an SSD is the single biggest upgrade available." };
  return { tone: "destructive", text: "Unusually slow — slower than a healthy hard drive. Check drive health above, close anything heavy, and re-test; a failing drive or a full disk both look like this." };
}
