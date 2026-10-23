import { useEffect, useState } from "react";
import { BRAND_MARKS, type Season } from "./brand-marks";
import { cn } from "@/lib/utils";

/** Today's seasonal logo from main (null on ordinary days or when switched off). */
export function useSeason() {
  const [season, setSeason] = useState<Season | null>(null);
  useEffect(() => {
    window.anchor.season().then(setSeason);
    return window.anchor.onSeason(setSeason);
  }, []);
  return season;
}

/** The Anchor mark. Seasonal marks with a neutral body take the text colour. */
export function BrandMark({ season, className }: { season?: Season | null; className?: string }) {
  const mark = BRAND_MARKS[season ?? "default"];
  return (
    <svg
      viewBox={mark.viewBox}
      className={cn("shrink-0", className)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: mark.body }}
    />
  );
}
