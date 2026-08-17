import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { SuggestForm } from "@/components/roadmap/suggest-form";
import { requireUser } from "@/lib/rbac";

export const metadata: Metadata = { title: "Suggest a feature" };

export default async function SuggestPage() {
  await requireUser();
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumbs items={[{ label: "Roadmap", href: "/roadmap" }, { label: "Suggest" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suggest a feature</h1>
        <p className="text-muted-foreground text-sm">
          Say what it does for the merchant, not how to build it — the how is the devs&apos; half.
        </p>
      </div>
      <SuggestForm />
    </div>
  );
}
