import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandLogo } from "@/components/layout/brand-logo";
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
          <BrandLogo
            imgClassName="mx-auto mb-2 h-12 w-auto rounded-lg"
            fallbackClassName="mx-auto mb-2 size-10 rounded-lg text-lg"
          />
          <CardTitle className="text-xl">Perx CRM</CardTitle>
          <CardDescription>Sign in with your Perx account</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm googleEnabled={googleAuthEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}
