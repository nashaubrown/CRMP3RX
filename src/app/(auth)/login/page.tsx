import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandBadge, BrandLogo } from "@/components/layout/brand-logo";
import { googleAuthEnabled } from "@/lib/auth";
import { getSessionUser } from "@/lib/rbac";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <span className="mb-3 flex items-center justify-center gap-2.5">
            <BrandLogo imgClassName="h-7 w-auto" fallbackClassName="size-9 rounded-lg text-lg" />
            <BrandBadge>CRM</BrandBadge>
          </span>
          <CardTitle className="sr-only">Perx CRM</CardTitle>
          <CardDescription>Sign in with your Perx account</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm googleEnabled={googleAuthEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
