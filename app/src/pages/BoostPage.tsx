import { useState } from "react";
import { Zap } from "lucide-react";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Label,
} from "@/components/ui";
import { runBoost, useAppState } from "@/lib/store";

export default function BoostPage() {
  const { boost } = useAppState();
  const [temp, setTemp] = useState(true);
  const [recycle, setRecycle] = useState(false);
  const [restore, setRestore] = useState(true);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <h1 className="text-3xl font-semibold tracking-tight">Boost & Health Check</h1>

      <Card>
        <CardHeader>
          <CardTitle>What Boost does (and doesn't)</CardTitle>
          <CardDescription>
            Boost trims the memory working set of background processes. Processes with an open window (anything on your
            taskbar) and critical system processes are always skipped. Trimming never kills a process — Windows simply
            reloads memory pages if the app needs them again. It keeps running if you switch pages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox checked={temp} onCheckedChange={setTemp} />
              <Label>Also clear temporary files (%TEMP% and Windows\Temp)</Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox checked={recycle} onCheckedChange={setRecycle} />
              <Label>Also empty the Recycle Bin</Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox checked={restore} onCheckedChange={setRestore} />
              <Label>Create a System Restore point first (recommended)</Label>
            </div>
          </div>
          <Button
            onClick={() => runBoost({ includeTemp: temp, includeRecycleBin: recycle, restorePoint: restore })}
            loading={boost.running}
          >
            {!boost.running && <Zap />} Run Boost
          </Button>
          {boost.message && <p className="text-sm text-muted-foreground">{boost.message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skipped processes (transparency log)</CardTitle>
          <CardDescription>
            After a boost, everything that was deliberately left alone is listed here so you can verify nothing
            important was touched.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {boost.skipped.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run a boost to see the log.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {boost.skipped.map((s) => (
                <span key={s} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
