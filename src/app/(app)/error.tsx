"use client";

import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex justify-center py-16">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <AlertTriangleIcon className="text-destructive mx-auto mb-2 size-8" />
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            {error.message || "An unexpected error occurred."}
            {error.digest ? ` (ref: ${error.digest})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={reset}>
            <RotateCcwIcon /> Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
