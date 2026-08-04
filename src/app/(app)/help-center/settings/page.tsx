import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/rbac";
import { getHelpSettings, listHelpCategories } from "@/services/help-center";

import { CategoriesManager, HelpSettingsForm } from "./settings-client";

export const metadata: Metadata = { title: "Help Center settings" };

export default async function HelpSettingsPage() {
  await requireAdmin();
  const [categories, settings] = await Promise.all([
    listHelpCategories(),
    getHelpSettings(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/help-center">
            <ArrowLeftIcon /> Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Help Center settings</h1>
          <p className="text-muted-foreground text-sm">
            Categories shown on the public site, and how publishing triggers a rebuild
          </p>
        </div>
      </div>

      <HelpSettingsForm
        defaults={{
          netlifyBuildHookUrl: settings?.netlifyBuildHookUrl ?? "",
          siteUrl: settings?.siteUrl ?? "",
        }}
      />

      <CategoriesManager
        categories={categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.title,
          description: c.description,
          icon: c.icon,
          order: c.order,
          articleCount: c._count.articles,
        }))}
      />
    </div>
  );
}
