"use client";

import { InfoWindow } from "@vis.gl/react-google-maps";

import type { MerchantPin } from "@/lib/maps";

// The popup shown when a merchant pin is clicked. Shared by the merchants map
// and the zones map so both show the same details.
//
// Colors are hard-coded neutrals rather than theme tokens: the InfoWindow is
// rendered by Google inside its own white bubble, which doesn't follow our
// dark mode.
export function MerchantInfoWindow({
  pin,
  onClose,
}: {
  pin: MerchantPin;
  onClose: () => void;
}) {
  return (
    <InfoWindow position={{ lat: pin.lat, lng: pin.lng }} onCloseClick={onClose}>
      <div className="flex flex-col gap-0.5 pr-2">
        <span className="text-sm font-semibold text-neutral-900">{pin.name}</span>
        {pin.outletName && pin.outletName !== pin.name ? (
          <span className="text-xs text-neutral-500">{pin.outletName}</span>
        ) : null}
        <span className="text-xs text-neutral-600">
          {pin.onboarded ? "Onboarded" : pin.status}
          {pin.subscriptionPlan ? ` · ${pin.subscriptionPlan}` : ""}
        </span>
        <a
          href={`/merchants/${pin.merchantId}`}
          className="text-xs font-medium text-green-700 underline"
        >
          Open merchant →
        </a>
      </div>
    </InfoWindow>
  );
}
