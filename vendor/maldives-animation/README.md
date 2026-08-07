# Maldives archipelago animation

The "Taking Over the Maldives" map animation used on the public `/welcome`
page. Exported from Claude Design; `SPEC.md` is the brief it was built from.

## What's here

| File | Role |
|---|---|
| `maldives-geo.js` | `window.MV_GEO` — the hand-authored atoll geometry |
| `animations-v3.jsx` | The timeline runtime: `CompositionStage`, `useComposition`, easings |
| `maldives-scene.jsx` | `window.MaldivesPiece` — the animation itself |
| `SPEC.md` | The original design brief (geography, story, timings) |

## Two things the export did not include

**1. The scene outline.** `window.OM_SCENES` is a JSON *string* listing the
named sections and their durations. The Claude Design host page defined it
inline, so it wasn't in the archive — without it `CompositionStage` renders
"the scenes prop isn't a valid JSON scene list" and nothing animates.

It was reconstructed from the seven cues `maldives-scene.jsx` actually
references (`C.Establish`, `C.Descent`, `C.Ignite`, `C.ChainNorth`,
`C.ChainSouth`, `C.PullBack`, `C.Resolve`) and the 13-second runtime in
`SPEC.md`. It now lives in `src/components/marketing/maldives-animation.tsx`.
The cue *names* are fixed by the scene; the *durations* are a judgement call
and can be retuned there freely.

**2. `window.WatercolorKit`.** Referenced by the runtime but absent. It's
guarded (`if (!kit) return null`) and falls back cleanly, so nothing breaks.

## Known quirks

**`document.fonts.ready` never resolves on `/welcome`.** The runtime copies
the page's `@font-face` rules into the SVG as data: URLs so the frame is
self-describing for video export (`useInlineFontsInto`). Those injected faces
are never actually used for layout, so they sit pending and
`document.fonts.status` stays `"loading"`. Same-origin only, runs once, and
Chrome doesn't block paint on it — but headless screenshot tools that wait on
`document.fonts.ready` will time out here. Pass a timeout, or screenshot a
different page.

**The playhead is persisted.** `Stage` writes the current time to
`localStorage["animstage-v3:t"]`, so a repeat visitor rejoins the film where
they left it. Harmless because it loops; `CompositionStage` doesn't forward a
`persistKey`, so there's no per-page override.

## Regenerating `public/maldives/*.js`

The `.jsx` files are plain React attached to `window` — no imports, no JSX
runtime import. They're transpiled to IIFEs so each file gets its own scope:
without that, `maldives-scene`'s top-level `const { useComposition } = window`
collides with `animations-v3`'s `function useComposition` in the shared
classic-script global scope.

```sh
cd vendor/maldives-animation
for f in animations-v3 maldives-scene; do
  ../../node_modules/.bin/esbuild "$f.jsx" \
    --loader:.jsx=jsx --jsx-factory=React.createElement --jsx-fragment=React.Fragment \
    --format=iife --target=es2020 --outfile="../../public/maldives/$f.js"
done
../../node_modules/.bin/esbuild maldives-geo.js \
  --format=iife --target=es2020 --outfile=../../public/maldives/maldives-geo.js
```

React is **not** bundled with these — the page sets `window.React` from the
app's own copy before loading them, so there's only one React on the page.
