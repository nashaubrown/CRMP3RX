import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { deleteTemplateAction, updateTemplateAction } from "@/app/(app)/templates/actions";
import { TemplateForm } from "@/app/(app)/templates/template-form";
import { DeleteButton } from "@/components/delete-button";
import { requireUser } from "@/lib/rbac";
import { getTemplate } from "@/services/templates";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const template = await getTemplate(id);
  if (!template) notFound();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Edit {template.name}</h1>
        <DeleteButton
          action={deleteTemplateAction.bind(null, template.id)}
          title={`Delete "${template.name}"?`}
          description="Messages already sent keep their content; this only removes the template."
        />
      </div>
      <TemplateForm
        action={updateTemplateAction.bind(null, template.id)}
        defaultValues={{
          name: template.name,
          channel: template.channel,
          subject: template.subject,
          body: template.body,
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
