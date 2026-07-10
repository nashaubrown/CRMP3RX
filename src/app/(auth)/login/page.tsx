import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
          <div className="bg-primary text-primary-foreground mx-auto mb-2 flex size-10 items-center justify-center rounded-lg text-lg font-bold">
            P
          </div>
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
