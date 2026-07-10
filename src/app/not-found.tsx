import Link from "next/link";
import { SearchXIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4 text-center">
      <SearchXIcon className="text-muted-foreground size-10" />
      <div>
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="text-muted-foreground text-sm">
          This record doesn&apos;t exist or was deleted.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
