"use client";

import * as React from "react";

// Reading the device's own position, for a rep standing outside a shop.
//
// Deliberately a single fix per press rather than a watch: continuous tracking
// drains a phone that has to last a day of visits, and nothing here needs to
// follow someone as they move. Nothing is sent to the server or stored — the
// fix lives in this hook's state and is gone on refresh.

export type Fix = {
  lat: number;
  lng: number;
  /** Radius of the 95% confidence circle, in metres, as reported by the device. */
  accuracyM: number;
};

export type MyLocationStatus = "unsupported" | "idle" | "locating" | "ready" | "error";

export type MyLocationState = {
  status: MyLocationStatus;
  fix: Fix | null;
  /** Set only when status is "error" or "unsupported". */
  error: string | null;
};

// Geolocation is one of the APIs where the browser's own error is useless to
// the person holding the phone, so every branch says what to do next.
function messageFor(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Location is blocked for this site. Allow it in your browser's site settings, then try again.";
    case err.POSITION_UNAVAILABLE:
      return "No GPS fix. Step outside or somewhere with a clearer view of the sky, then try again.";
    case err.TIMEOUT:
      return "Location took too long. Try again — the second attempt is usually quicker.";
    default:
      return "Couldn't read your location. Try again.";
  }
}

const OPTIONS: PositionOptions = {
  // Field reps need street-level accuracy to pin a shopfront; wifi-only fixes
  // in Malé can be 100m+ out.
  enableHighAccuracy: true,
  timeout: 15_000,
  // A fix from the last quarter-minute is fine and returns instantly.
  maximumAge: 15_000,
};

export function useMyLocation() {
  const [state, setState] = React.useState<MyLocationState>({
    status: "idle",
    fix: null,
    error: null,
  });

  // Guards a late callback from a request the component has already unmounted
  // past — getCurrentPosition has no abort.
  const liveRef = React.useRef(true);
  React.useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  const locate = React.useCallback(() => {
    // Browsers only expose geolocation on https (or localhost). Say so plainly
    // rather than letting the button silently do nothing.
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setState({
        status: "unsupported",
        fix: null,
        error: "This browser can't share your location.",
      });
      return;
    }
    if (!window.isSecureContext) {
      setState({
        status: "unsupported",
        fix: null,
        error: "Location needs a secure (https) connection. This page isn't on one.",
      });
      return;
    }

    setState((s) => ({ status: "locating", fix: s.fix, error: null }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!liveRef.current) return;
        setState({
          status: "ready",
          fix: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
          },
          error: null,
        });
      },
      (err) => {
        if (!liveRef.current) return;
        // Keep any previous fix on screen: a failed refresh shouldn't erase a
        // position the rep is still working from.
        setState((s) => ({ status: "error", fix: s.fix, error: messageFor(err) }));
      },
      OPTIONS
    );
  }, []);

  const clear = React.useCallback(() => {
    setState({ status: "idle", fix: null, error: null });
  }, []);

  return { ...state, locate, clear };
}
