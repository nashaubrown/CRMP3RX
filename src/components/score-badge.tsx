import { Badge } from "@/components/ui/badge";
import { scoreBand } from "@/services/lead-scoring";
import { cn } from "@/lib/utils";

const BAND_STYLES: Record<string, string> = {
  HOT: "bg-red-500/15 text-red-700 dark:text-red-300 border-transparent",
  WARM: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
  COLD: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-transparent",
};

export function ScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score);
  return (
    <Badge variant="outline" className={cn("tabular-nums", BAND_STYLES[band])}>
      {score} · {band.toLowerCase()}
    </Badge>
  );
}
