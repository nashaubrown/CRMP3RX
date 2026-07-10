"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { importCsvAction, type ImportState } from "@/app/(app)/_actions/import";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const initialState: ImportState = { error: null };

export function ImportDialog({
  entity,
  revalidatePath,
  columnsHint,
}: {
  entity: "merchants" | "contacts";
  revalidatePath: string;
  columnsHint: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: ImportState, formData: FormData) => {
      const result = await importCsvAction(prev, formData);
      if (result.result) {
        toast.success(
          `Imported ${result.result.created} ${entity}` +
            (result.result.skipped ? `, skipped ${result.result.skipped} existing` : "")
        );
      }
      return result;
    },
    initialState
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadIcon /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import {entity} from CSV</DialogTitle>
          <DialogDescription>
            The first line must be the column headers (any order, extra columns are ignored):{" "}
            <code className="text-xs">{columnsHint}</code>. Rows matching existing {entity} are
            skipped, so re-importing an export is safe. Tip: use Export CSV as a template.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="revalidate" value={revalidatePath} />

          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          {state.result ? (
            <Alert variant={state.result.errors.length > 0 ? "destructive" : "default"}>
              <AlertDescription className="w-full">
                <p>
                  Created {state.result.created} · skipped {state.result.skipped} existing ·{" "}
                  {state.result.errors.length} error{state.result.errors.length === 1 ? "" : "s"}
                </p>
                {state.result.errors.length > 0 ? (
                  <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-4 text-xs">
                    {state.result.errors.slice(0, 30).map((e, i) => (
                      <li key={i}>
                        Line {e.row}: {e.message}
                      </li>
                    ))}
                    {state.result.errors.length > 30 ? (
                      <li>…and {state.result.errors.length - 30} more</li>
                    ) : null}
                  </ul>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Input type="file" name="file" accept=".csv,text/csv" required />

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Import
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
