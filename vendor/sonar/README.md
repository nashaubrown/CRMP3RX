# Maldives bathymetric sonar

Source data for the sweeping-survey background proposed for the sign-in page.
Nothing here is wired into the app yet — the design is still being reviewed.

## `map.txt`

The archipelago as 2,048 soundings, three characters each, packed by the
point-cloud tool the piece came from. Decode one sounding at offset `i * 3`:

```js
const t = (n) => { const v = MAP.charCodeAt(i * 3 + n) - 48; return v - ((v / 45) | 0); };
const gx = t(0) / 63 - 0.5;              // easting,  -0.5 … 0.5
const gy = 0.5 - (t(1) * 4 + (t(2) >> 4)) / 255;  // northing, -0.5 … 0.5
const ed = (t(2) & 15) / 15;             // distance to the reef edge, 0 … 1
```

The `- ((v / 45) | 0)` step skips one character in the alphabet, so the
encoding is base-63 rather than base-64.

`ed` is what makes the atolls read as atolls: it is 0 on the reef rim and 1 in
the middle of the lagoon, which drives the depth term

```js
const rim = 1 - ed;
const metres = 2.4 * rim * rim - 55 * ed * ed * ed;   // +2.4 m reef flat, −55 m lagoon
```

Below that the whole chain sits on a flank falling away to the 2,000 m base of
the Chagos–Laccadive Ridge.

## Verifying a change

The decode is easy to break silently — a wrong mask still yields *a* point
cloud. Render it as ASCII and look for the chain:

```sh
node -e '
const MAP = require("fs").readFileSync("vendor/sonar/map.txt", "utf8").trim();
const W = 64, H = 110, g = Array.from({length: H}, () => Array(W).fill(" "));
for (let i = 0; i < MAP.length / 3; i++) {
  const t = (n) => { const v = MAP.charCodeAt(i * 3 + n) - 48; return v - ((v / 45) | 0); };
  const x = Math.round((t(0) / 63) * (W - 1));
  const y = Math.round((t(1) * 4 + (t(2) >> 4)) / 255 * (H - 1));
  const ed = (t(2) & 15) / 15;
  if (g[y]) g[y][x] = ed > 0.66 ? "#" : ed > 0.33 ? "+" : ".";
}
console.log(g.map((r) => r.join("")).join("\n"));
'
```

You should see a north–south chain of rings — rims in `.`, lagoons in `#`.
