import type { Metadata } from "next";

import { createTemplateAction } from "@/app/(app)/templates/actions";
import { TemplateForm } from "@/app/(app)/templates/template-form";
import { requireUser } from "@/lib/rbac";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requireUser();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">New template</h1>
      <TemplateForm action={createTemplateAction} submitLabel="Create template" />
    </div>
  );
}
