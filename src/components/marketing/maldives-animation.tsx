"use client";

import * as React from "react";

// The Maldives archipelago animation on the public welcome page.
//
// The piece is a Claude Design export (see vendor/maldives-animation/): plain
// React components that attach themselves to `window` rather than exporting
// modules. So rather than porting 60KB of timeline code, we hand it the app's
// own React, load its three scripts, and then render its components straight
// into this tree — one React on the page, no iframe, no second root.

const SCRIPTS = [
  "/maldives/maldives-geo.js", // window.MV_GEO — the atoll geometry
  "/maldives/animations-v3.js", // CompositionStage, useComposition, easings
  "/maldives/maldives-scene.js", // window.MaldivesPiece
];

// The scene outline wasn't in the export — the Claude Design host page defined
// it inline. Reconstructed from the cues maldives-scene.jsx references and the
// 13-second runtime in the brief. Names are fixed by the scene; durations are
// free to retune.
const SCENES = JSON.stringify([
  { name: "Establish", dur: 2.2 },
  { name: "Descent", dur: 2.0 },
  { name: "Ignite", dur: 1.6 },
  { name: "ChainNorth", dur: 2.2 },
  { name: "ChainSouth", dur: 2.2 },
  { name: "PullBack", dur: 1.6 },
  { name: "Resolve", dur: 1.2 },
]);

type StageProps = {
  width: number;
  height: number;
  scenes: string;
  playback: { mode: string };
  bg: string;
  children: React.ReactNode;
};

declare global {
  interface Window {
    React?: unknown;
    MV_GEO?: unknown;
    CompositionStage?: React.ComponentType<StageProps>;
    MaldivesPiece?: React.ComponentType<{ tweaks: Record<string, unknown> }>;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = false; // order matters: geo -> runtime -> scene
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

export function MaldivesAnimation() {
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // The bundles expect a global React; give them the app's own so there
        // is exactly one copy and its components can render in this tree.
        window.React = React;
        for (const src of SCRIPTS) await loadScript(src);
        if (!cancelled) setReady(Boolean(window.CompositionStage && window.MaldivesPiece));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The page reads fine without it, so a failed or pending load just leaves
  // the background — never a broken frame or a spinner over the sign-in link.
  if (failed || !ready) return null;

  const Stage = window.CompositionStage;
  const Piece = window.MaldivesPiece;
  if (!Stage || !Piece) return null;

  return (
    <Stage
      width={1920}
      height={1080}
      scenes={SCENES}
      playback={{ mode: "loop" }}
      bg="transparent"
    >
      <Piece tweaks={{ showLabels: true, showEquator: true, auroraIntensity: 0.9 }} />
    </Stage>
  );
}
