"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Quick scenarios that set new-merchants/month + churn. Avg-per-merchant is
// left alone (it reflects the org's real plan mix).
const PRESETS = [
  { key: "Conservative", newPerMonth: 1, churn: 4 },
  { key: "Base", newPerMonth: 3, churn: 2 },
  { key: "Aggressive", newPerMonth: 6, churn: 1 },
] as const;

function money(n: number, currency: string) {
  return `${currency} ${Math.round(n).toLocaleString("en-US")}`;
}

// Projects MRR 12 months out from the caller's assumptions. Model, per month:
//   next = current × (1 − churn) + newPerMonth × revenuePerMerchant
// It's an explicit what-if driven by the inputs — not a prediction.
function project(start: number, newPerMonth: number, arpa: number, churnPct: number): number[] {
  const churn = Math.min(1, Math.max(0, churnPct / 100));
  const series = [start];
  let mrr = start;
  for (let m = 0; m < 12; m++) {
    mrr = mrr * (1 - churn) + newPerMonth * arpa;
    series.push(Math.max(0, mrr));
  }
  return series; // length 13: now + 12 months
}

const MONTH_LABELS = ["Now", "", "", "3mo", "", "", "6mo", "", "", "9mo", "", "", "12mo"];

export function MrrForecast({
  currentMrr,
  defaultArpa,
  currency,
}: {
  currentMrr: number;
  defaultArpa: number;
  currency: string;
}) {
  const [newPerMonth, setNewPerMonth] = React.useState(3);
  const [arpa, setArpa] = React.useState(defaultArpa || 700);
  const [churn, setChurn] = React.useState(2);

  const series = React.useMemo(
    () => project(currentMrr, newPerMonth, arpa, churn),
    [currentMrr, newPerMonth, arpa, churn]
  );
  const endMrr = series[series.length - 1];

  // Chart geometry (viewBox units; scales to the container via w-full, so the
  // viewBox aspect ratio sets the rendered height). This card is full-width,
  // so the box is wide: a narrow one gets scaled up ~4x here, which made the
  // chart ~550px tall with a correspondingly fat line and huge tick labels.
  const W = 900;
  const H = 130;
  const padX = 16;
  const padTop = 12;
  const padBottom = 22;
  const max = Math.max(...series, 1);
  const stepX = (W - padX * 2) / (series.length - 1);
  const usableH = H - padTop - padBottom;
  const pts = series.map((v, i) => {
    const x = padX + i * stepX;
    const y = padTop + usableH - (v / max) * usableH;
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - padBottom} L${padX},${H - padBottom} Z`;
  const [lastX, lastY] = pts[pts.length - 1];

  const activePreset = PRESETS.find((p) => p.newPerMonth === newPerMonth && p.churn === churn)?.key;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-xs">Scenario:</span>
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant={activePreset === p.key ? "secondary" : "outline"}
            size="sm"
            className={cn("h-7", activePreset === p.key && "ring-primary/40 ring-1")}
            onClick={() => {
              setNewPerMonth(p.newPerMonth);
              setChurn(p.churn);
            }}
          >
            {p.key}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-new" className="text-xs">
            New merchants / month
          </Label>
          <Input
            id="f-new"
            type="number"
            min={0}
            value={newPerMonth}
            onChange={(e) => setNewPerMonth(Math.max(0, Number(e.target.value) || 0))}
            className="h-8 w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-arpa" className="text-xs">
            Avg MVR / merchant
          </Label>
          <Input
            id="f-arpa"
            type="number"
            min={0}
            value={arpa}
            onChange={(e) => setArpa(Math.max(0, Number(e.target.value) || 0))}
            className="h-8 w-28"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-churn" className="text-xs">
            Monthly churn %
          </Label>
          <Input
            id="f-churn"
            type="number"
            min={0}
            max={100}
            value={churn}
            onChange={(e) => setChurn(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
            className="h-8 w-28"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-muted-foreground text-xs">Projected in 12 months</span>
        <span className="text-xl font-semibold tabular-nums">{money(endMrr, currency)}</span>
        <span className="text-muted-foreground text-xs">
          / mo · {money(endMrr * 12, currency)} ARR
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="text-primary h-auto max-h-60 w-full"
        role="img"
        aria-label={`Projected MRR reaching ${money(endMrr, currency)} per month in 12 months`}
      >
        {/* recessive baseline */}
        <line
          x1={padX}
          y1={H - padBottom}
          x2={W - padX}
          y2={H - padBottom}
          className="text-border"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path d={area} fill="currentColor" fillOpacity="0.14" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="2" fill="currentColor" fillOpacity={i === 0 || i === 12 ? 1 : 0}>
            {/* One string child, deliberately: React 19 treats <title> with
                split children as hoistable document metadata, renders it empty
                on the server, and the page then fails hydration. */}
            <title>{`${MONTH_LABELS[i] || `Month ${i}`}: ${money(series[i], currency)}/mo`}</title>
          </circle>
        ))}
        <circle cx={lastX} cy={lastY} r="3" fill="currentColor" />
        {/* month ticks */}
        {pts.map(([x], i) =>
          MONTH_LABELS[i] ? (
            <text
              key={`t-${i}`}
              x={x}
              y={H - 5}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="7"
            >
              {MONTH_LABELS[i]}
            </text>
          ) : null
        )}
      </svg>

      <p className="text-muted-foreground text-xs">
        A what-if based on your inputs above — not a prediction. Starts from your current MVR{" "}
        {Math.round(currentMrr).toLocaleString("en-US")}/mo.
      </p>
    </div>
  );
}
