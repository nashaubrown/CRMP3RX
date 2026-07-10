"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlusCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { runCanvasActionAction } from "@/app/(app)/_actions/canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CanvasAction, CanvasBlock, ViewSpec } from "@/lib/validators/canvas";
import { cn } from "@/lib/utils";

const toneClasses: Record<string, string> = {
  positive: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-transparent",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-transparent",
  danger: "bg-red-500/15 text-red-700 dark:text-red-300 border-transparent",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-transparent",
  default: "",
};

function ActionButton({ action }: { action: CanvasAction }) {
  const [pending, start] = React.useTransition();

  if (action.kind === "link") {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={action.href}>
          {action.label} <ArrowRightIcon />
        </Link>
      </Button>
    );
  }

  const Icon = action.kind === "complete_task" ? CheckCircle2Icon : PlusCircleIcon;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await runCanvasActionAction(action);
          if (result.ok) toast.success(result.message || "Done");
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <Icon />}
      {action.label}
    </Button>
  );
}

function BlockView({ block }: { block: CanvasBlock }) {
  switch (block.type) {
    case "text":
      return <p className="text-sm whitespace-pre-wrap">{block.body}</p>;

    case "stat_group":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {block.stats.map((s, i) => (
            <Card key={i} className="py-4">
              <CardContent className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">{s.label}</span>
                <span className="text-xl font-semibold tracking-tight">{s.value}</span>
                {s.sublabel ? (
                  <Badge className={cn("w-fit", toneClasses[s.tone ?? "default"])} variant="secondary">
                    {s.sublabel}
                  </Badge>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      );

    case "bar_chart": {
      const max = Math.max(...block.bars.map((b) => Math.abs(b.value)), 1);
      return (
        <Card>
          {block.title ? (
            <CardHeader>
              <CardTitle className="text-base">{block.title}</CardTitle>
            </CardHeader>
          ) : null}
          <CardContent className="flex flex-col gap-2">
            {block.bars.map((bar, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground w-28 shrink-0 truncate">{bar.label}</span>
                <div className="bg-muted h-5 flex-1 overflow-hidden rounded">
                  <div
                    className="bg-primary/70 h-full rounded"
                    style={{ width: `${Math.max(2, (Math.abs(bar.value) / max) * 100)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right font-medium">
                  {bar.display ?? bar.value.toLocaleString()}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      );
    }

    case "table":
      return (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  {block.columns.map((c) => (
                    <TableHead key={c.key} className="first:pl-4">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {block.rows.map((row, i) => (
                  <TableRow key={i}>
                    {block.columns.map((c) => (
                      <TableCell key={c.key} className="first:pl-4">
                        {row[c.key] === null || row[c.key] === undefined ? "—" : String(row[c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {block.caption ? (
              <p className="text-muted-foreground px-4 py-2 text-xs">{block.caption}</p>
            ) : null}
          </CardContent>
        </Card>
      );

    case "list":
      return (
        <Card>
          <CardContent className="flex flex-col">
            {block.items.map((item, i) => {
              const inner = (
                <div className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.subtitle ? (
                      <p className="text-muted-foreground truncate text-xs">{item.subtitle}</p>
                    ) : null}
                  </div>
                  {item.badge ? (
                    <Badge className={cn(toneClasses[item.tone ?? "default"])} variant="secondary">
                      {item.badge}
                    </Badge>
                  ) : null}
                </div>
              );
              return item.href ? (
                <Link
                  key={i}
                  href={item.href}
                  className="hover:bg-muted/60 -mx-2 rounded-md px-2 [&:not(:last-child)]:border-b"
                >
                  {inner}
                </Link>
              ) : (
                <div key={i} className="[&:not(:last-child)]:border-b">
                  {inner}
                </div>
              );
            })}
          </CardContent>
        </Card>
      );

    case "record_card":
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {block.href ? (
                <Link href={block.href} className="hover:underline">
                  {block.name}
                </Link>
              ) : (
                block.name
              )}
              <Badge variant="secondary" className="capitalize">
                {block.kind}
              </Badge>
            </CardTitle>
            {block.subtitle ? (
              <p className="text-muted-foreground text-sm">{block.subtitle}</p>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {block.fields && block.fields.length > 0 ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {block.fields.map((f, i) => (
                  <div key={i} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="text-right font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {block.actions && block.actions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {block.actions.map((a, i) => (
                  <ActionButton key={i} action={a} />
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      );

    case "actions":
      return (
        <div className="flex flex-col gap-2">
          {block.title ? <p className="text-sm font-medium">{block.title}</p> : null}
          <div className="flex flex-wrap gap-2">
            {block.actions.map((a, i) => (
              <ActionButton key={i} action={a} />
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function GenerativeView({ spec }: { spec: ViewSpec }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{spec.title}</h2>
        {spec.summary ? <p className="text-muted-foreground text-sm">{spec.summary}</p> : null}
      </div>
      {spec.blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
