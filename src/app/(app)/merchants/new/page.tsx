import type { Metadata } from "next";

import { MerchantForm } from "@/app/(app)/merchants/merchant-form";
import { createMerchantAction } from "@/app/(app)/merchants/actions";
import { isAdmin, requireUser } from "@/lib/rbac";
import { listAssignableUsers } from "@/services/users";

export const metadata: Metadata = { title: "New merchant" };

export default async function NewMerchantPage() {
  const user = await requireUser();
  const owners = await listAssignableUsers(user);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">New merchant</h1>
      <MerchantForm
        action={createMerchantAction}
        owners={owners}
        showOwnerSelect={isAdmin(user)}
        cancelHref="/merchants"
        submitLabel="Create merchant"
      />
    </div>
  );
}
