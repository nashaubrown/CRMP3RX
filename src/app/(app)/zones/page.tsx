import type { Metadata } from "next";

import { ZonesClient } from "@/components/maps/zones-client";
import { isAdmin, requireUser } from "@/lib/rbac";
import { listGeofencesWithStats } from "@/services/geofences";
import { listMerchantsForMap } from "@/services/merchants";
import { listAssignableUsers } from "@/services/users";
import { merchantListParamsSchema } from "@/lib/validators/merchant";

export const metadata: Metadata = { title: "Zones" };

export default async function ZonesPage() {
  const user = await requireUser();
  const allParams = merchantListParamsSchema.parse({});

  const [zones, pins, owners] = await Promise.all([
    listGeofencesWithStats(),
    listMerchantsForMap(user, allParams),
    listAssignableUsers(user),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Zones</h1>
        <p className="text-muted-foreground text-sm">
          Draw sales territories and campaign zones, and see the merchants inside each.
        </p>
      </div>
      <ZonesClient
        zones={zones}
        pins={pins}
        owners={owners}
        currentUserId={user.id}
        isAdmin={isAdmin(user)}
      />
    </div>
  );
}
