# Claude Design Prompt — Perx.mv "Taking Over the Maldives" Map Animation

> **How to use this:** paste everything below the line into Claude Design, and in the same message attach (a) your Perx brand guidelines + design system and (b) the Maldives silhouette map image. Where this prompt says `[FROM BRAND SYSTEM]`, Claude Design should pull the real value from your attachments rather than inventing one.

---

## ROLE

You are a senior motion designer and creative technologist building a cinematic, brand-accurate map animation for **Perx** (perx.mv), a merchant loyalty platform in the Maldives.

## BUILD TARGET

Produce **one self-contained HTML file**. No external assets, no CDN dependencies, no image files, no map libraries (no Mapbox, no Leaflet, no D3 geo imports). Everything — geometry, animation, styling — is hand-authored inline SVG + CSS + vanilla JavaScript.

- Primary canvas: **1920 × 1080 (16:9)**, letterboxed and scaled to fit any viewport so it can be screen-recorded cleanly to MP4/GIF.
- Include a **responsive mode**: below 900px viewport width, reflow to a 9:16-safe composition (map centred, no critical pins cropped) so the same file works as a mobile hero.
- Autoplay on load. Include a small, unobtrusive **Replay** control and a **Loop on/off** toggle in the bottom-right corner, styled to the brand system. These controls must be hideable via a `?clean=1` URL parameter so a screen recording captures nothing but the animation.
- Total runtime: **13 seconds**, then hold the final frame for 2 seconds before looping (if loop is on).
- Do **not** use `localStorage`, `sessionStorage`, or any browser storage API. Hold all state in JavaScript variables.

## THE STORY (this is the point of the piece — every design decision serves it)

The Maldives loyalty landscape starts fragmented and cold. Most of the country has **no loyalty platform at all** (grey pins). A scattered handful of islands run **other, competing loyalty providers** (purple pins). Then Perx arrives: pins begin converting to **Perx green**, first in Greater Malé, then cascading outward island by island, atoll by atoll, until the archipelago reads as a single connected green network from Hoarafushi in the far north to Addu in the far south.

The emotional arc is: **scattered and inert → a spark → a spreading current → a nation lit up.**

It should feel inevitable and confident, not aggressive. Think tide coming in, or a power grid switching on — not a military conquest map.

## REFERENCE IMAGE — HOW TO USE IT

An attached silhouette map of the Maldives shows the archipelago as solid dark shapes on white.

**Use it for:** the arrangement, count, relative size, spacing, and north–south rhythm of the atolls. The positional relationships in that image are correct and the final vector should be recognisably the same shape — if you overlaid your output on the reference at wide zoom, the blobs should sit in the same places.

**Do not copy its rendering.** The reference draws each atoll as a solid filled mass. Real atolls are **rings** — a coral rim enclosing a shallow lagoon, studded with tiny islands. Treat the silhouette as the *outer boundary* of each atoll and develop the interior: hollow it into a lagoon, break the rim into a scatter of small islands, and let that detail emerge progressively as the camera descends. At the widest zoom the atolls may read close to the reference's solid masses; by mid-zoom they must resolve into rims and lagoons; at street level, into individual named islands.

Do not trace the reference as a raster image or embed it as a bitmap. Rebuild it as clean vector paths.

## GEOGRAPHY (accuracy matters — Maldivians will watch this)

Render the Maldives as a **geographically credible vector archipelago**, not a generic blob. Key requirements:

- The country is a **long north–south double chain of 26 natural atolls**, spanning roughly **7.1°N down to 0.7°S**, and **72.6°E to 73.8°E**. It is far taller than it is wide — the aspect ratio is dramatic and should be respected, not squashed to fill a widescreen frame. Use the empty ocean around it deliberately.
- Each atoll is a **ring or elongated oval of a coral rim**, enclosing a paler lagoon, dotted with many tiny islands along the rim. Do not draw atolls as solid landmasses — the ring-with-lagoon structure is the visual signature of the Maldives and must read clearly at wide zoom.
- Render meaningful **inter-atoll channels**: the Kaashidhoo Kandu, the One and a Half Degree Channel (between Hadhdhunmathi/Laamu and Huvadhu), and the Equatorial Channel (between Huvadhu and Fuvahmulah). These gaps give the chain its rhythm.
- North-to-south atoll sequence to approximate: Ihavandhippolhu & Thiladhunmathi (HA/HDh), Miladhunmadulu (Sh/N), Maalhosmadulu (R/B), Faadhippolhu (Lh), North & South Malé (K), Ari (AA/ADh), Felidhu (V), Mulaku (M), North & South Nilandhe (F/Dh), Kolhumadulu (Th), Hadhdhunmathi (L), Huvadhu (GA/GDh — very large), Fuvahmulah (Gn — a single island, no atoll ring), Addu (S — heart-shaped, south of the equator).
- Optionally render a faint **equator line** across the frame between Huvadhu and Fuvahmulah. It is a true and quietly powerful detail: Perx's network crosses the equator.

### Zoom target coordinates (approximate anchors — use these to place the camera)

| Location | Lat | Lon | Note |
|---|---|---|---|
| Hoarafushi (HA) | 6.98 N | 72.89 E | Far northern tip |
| Kulhudhuffushi (HDh) | 6.62 N | 73.07 E | Northern regional city |
| Greater Malé — Malé | 4.18 N | 73.51 E | Capital, densest merchant cluster |
| Greater Malé — Hulhumalé | 4.21 N | 73.54 E | Reclaimed island, adjacent to Malé |
| Thinadhoo (GDh) | 0.53 N | 73.00 E | Huvadhu Atoll, southern hub |
| Fuvahmulah (Gn) | 0.30 S | 73.42 E | Single-island, below the equator |
| Addu City — Hithadhoo (S) | 0.60 S | 73.08 E | Southernmost city |

Label each zoom target with its **English name in the brand's UI typeface**, and where space allows, the **Thaana script name** beneath it at reduced size and opacity. Thaana is written right-to-left — set `dir="rtl"` on those elements. If the design system does not include a Thaana-capable font, render English only rather than producing broken glyphs.

## SHOT LIST & TIMING (13s)

**0.0 – 2.0s — Establishing.** Full archipelago in frame, seen from high altitude, tilted very slightly (a subtle 3–5° perspective, not a full 3D globe). Deep ocean. All pins are grey, small, and dim, breathing on a slow desynchronised pulse so the map feels alive but dormant. Six or seven purple pins are visible, scattered, each with a faint competing halo. Slow continuous push-in begins immediately — the camera never fully stops moving at any point in the piece.

**2.0 – 4.0s — Descent to Greater Malé.** Camera accelerates smoothly toward 4.18N / 73.51E. Atoll rings resolve into individual islands. Ocean gains depth gradation — deep indigo offshore, turquoise over the reef shelves. On arrival, Malé and Hulhumalé fill the frame with a legible street-scale grid and a dense cluster of ~40 pins.

**4.0 – 5.6s — The first conversion.** One pin in central Malé ignites green — a sharp flash, a ring pulse expanding outward, a short settle. Then the cluster converts in a spatial cascade radiating from that origin, roughly 25ms apart, easing out so the last few land softly. Two purple pins in the cluster convert last and differently: they hold, resist for ~200ms with a slight shake, then flip. The cascade's expanding ring pulse crosses to Hulhumalé and triggers the conversion there.

**5.6 – 9.5s — The chain reaction (four rapid stops).** The camera pulls back partway and travels in sequence, ~1s each, never fully zooming out between stops. At each arrival, pins convert in a fast cascade, and a thin animated **connection line** draws back to the previously converted region — building a visible network, not isolated events. Order:
1. **Kulhudhuffushi** (north)
2. **Hoarafushi** (far north — the chain now reaches the top of the country)
3. **Thinadhoo** (south, Huvadhu)
4. **Fuvahmulah**, then immediately **Addu City / Hithadhoo** (the two southern stops read as one continuous southward sweep across the equator)

**9.5 – 12.0s — The pull-back.** Fast but eased retreat to full-archipelago view. As altitude increases, the individual green pins merge into glowing clusters and the connection lines resolve into a lit network spanning the entire chain. Any remaining grey pins convert in a final wave from the centre outward. The last purple pin converts on the final beat — give it a distinct, slightly delayed moment.

**12.0 – 13.0s — Resolve.** The full archipelago holds, entirely green, network lines gently pulsing. The Perx wordmark/logo fades in with the tagline, positioned per the brand system's clear-space rules. Optional single line of supporting copy — keep it short, e.g. *"One network. Every atoll."* — but only if the brand voice guidelines support that register.

## PIN DESIGN & STATE SEMANTICS

Three states, visually distinct at every zoom level:

- **Grey — no loyalty platform.** Desaturated, low opacity (~55%), smallest size, flat with no glow. Slow ambient pulse. Reads as dormant.
- **Purple — competing loyalty provider.** `[FROM BRAND SYSTEM: use the purple defined in the palette]`. Slightly larger than grey, with a faint contained halo. Should read as "occupied, but not ours" — present, not threatening. Do not caricature it; no red, no warning styling, no X marks.
- **Green — live Perx merchant.** `[FROM BRAND SYSTEM: primary Perx green]`. Largest, fully saturated, with a soft outer glow and an occasional gentle pulse. Green pins connect to each other with thin animated lines; grey and purple pins never connect to anything.

**The conversion transition is the hero moment of the entire piece.** Specify it precisely: a colour interpolation that passes through a brief bright flash at the midpoint, a scale overshoot to ~1.35× that settles back to 1.0 on a spring ease, and an expanding ring that fades as it grows. Duration ~500ms per pin. It should feel like a switch closing — crisp, satisfying, and identical every time so it becomes a recognisable motif.

Pins should be **map markers, not dots** — a teardrop/pin silhouette with a visible tip anchoring it to its island, casting a soft shadow onto the water. If the brand system defines a pin or location icon, use that geometry instead.

## VISUAL & MOTION DIRECTION

- **Ocean:** layered depth, not flat fill. Deep indigo in open water, shifting to turquoise over reef shelves and lagoon interiors. Add a very slow, low-amplitude caustic or gradient drift so the water is never static. Keep it subtle — it must never compete with the pins.
- **Camera:** always moving. Use eased zoom and pan with slight overshoot on arrival at each target, as though a real operator is flying it. Add gentle atmospheric haze that reduces as altitude decreases. Never cut — every transition is a continuous move.
- **Easing:** no linear motion anywhere. Use custom cubic-beziers; `cubic-bezier(0.65, 0, 0.35, 1)` for camera moves and a spring-like overshoot for pin conversions.
- **Depth:** implement subtle parallax — distant atolls drift slightly slower than near ones during camera moves.
- **Restraint:** the archipelago and the conversions carry the piece. No particle systems, no lens flares, no rotating globes, no scanning grids, no HUD chrome.

## BRAND APPLICATION

Read the attached brand guidelines and design system and apply them strictly. Specifically:

- Pull **all** colours from the defined palette — the Perx green, the purple, the greys, and the ocean tones should be derived from the brand's colour system, not chosen ad hoc. If the system lacks ocean-appropriate colours, derive them from the primary palette (a darkened, desaturated variant of the brand's coolest hue) rather than importing an unrelated blue.
- Use the defined typefaces, weights, and type scale for all labels, the tagline, and the controls. Respect the letter-spacing and casing rules.
- Apply the logo per its clear-space and minimum-size rules. Do not recolour, rotate, or place it on an insufficiently contrasting background.
- Honour the design system's radius, elevation/shadow, and spacing tokens on the control chrome.
- Expose every brand value as a **CSS custom property in a single `:root` block at the top of the stylesheet**, named to match the design system's token names, so the palette can be retuned in one place without touching the animation logic.

## TECHNICAL CONSTRAINTS

- Animate the camera by transforming the SVG `viewBox` (or a group transform) — do **not** animate `width`/`height`/`top`/`left`. Keep the animation on the compositor: prefer `transform` and `opacity`.
- Drive the sequence from **one declarative timeline object** in JavaScript — an array of keyframes with `time`, `target`, `zoom`, and `event` fields — so the choreography can be retimed by editing data, not code. Comment it clearly.
- Target a sustained 60fps. Cap total pin count at roughly 220 across the country. Use CSS transforms and `will-change` judiciously; avoid per-frame DOM creation.
- Respect `prefers-reduced-motion: reduce` — serve a static, fully-converted final-state map with a simple crossfade instead of the flight.
- Provide meaningful `<title>` and `<desc>` on the SVG and an `aria-live` region announcing each stage, so the piece is not opaque to screen readers.
- Add a hidden `?debug=1` mode that overlays a timeline scrubber and elapsed-time readout, for reviewing and retiming the sequence.

## DELIVERABLE

A single, production-ready, commented HTML file. At the top, in a comment block, list: the timeline structure, where to change pin coordinates, where to change the palette, and how to swap the shot list — so the animation can be maintained without rebuilding it.

## WHAT SUCCESS LOOKS LIKE

A Maldivian sees this and immediately recognises their country from the atoll shapes alone, before any label appears. The pin conversion moment is satisfying enough to want to watch twice. The final frame makes Perx's coverage feel national and inevitable. And it looks unmistakably like Perx — not like a generic tech map animation with a green filter applied.
