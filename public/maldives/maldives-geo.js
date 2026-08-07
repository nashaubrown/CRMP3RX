(() => {
  const LON0 = 73.2;
  const LAT0 = 3.2;
  const SCALE = 1e3;
  const P = (lat, lon) => [(lon - LON0) * SCALE, (LAT0 - lat) * SCALE];
  function mulberry32(a) {
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function closedSpline(pts) {
    const n = pts.length;
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)},${c2[0].toFixed(1)} ${c2[1].toFixed(1)},${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d + "Z";
  }
  function ringPoints(cx, cy, rx, ry, rot, seed, irr, n) {
    const rnd = mulberry32(seed);
    const wob = [];
    for (let i = 0; i < n; i++) wob.push(1 + irr * (rnd() - 0.5) * 2);
    const sm = wob.map((_, i) => (wob[(i - 1 + n) % n] + 2 * wob[i] + wob[(i + 1) % n]) / 4);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      const x = Math.cos(a) * rx * sm[i], y = Math.sin(a) * ry * sm[i];
      pts.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
    }
    return pts;
  }
  const ATOLL_DEFS = [
    ["Ihavandhippolhu", 6.95, 72.93, 0.055, 0.075, 0.1, 6],
    ["Thiladhunmathi", 6.62, 73.06, 0.085, 0.29, 0.05, 16],
    ["Makunudhoo", 6.4, 72.7, 0.035, 0.045, 0, 3],
    ["Miladhunmadulu N", 6.12, 73.2, 0.075, 0.23, -0.06, 12],
    ["Miladhunmadulu S", 5.72, 73.34, 0.08, 0.22, -0.1, 11],
    ["Maalhosmadulu N", 5.52, 72.96, 0.1, 0.23, 0.05, 12],
    ["Maalhosmadulu S", 5.12, 73.05, 0.105, 0.17, 0.02, 10],
    ["Goidhoo", 4.92, 72.99, 0.05, 0.055, 0, 4],
    ["Faadhippolhu", 5.38, 73.55, 0.135, 0.095, 0.12, 9],
    ["Kaashidhoo", 4.96, 73.46, 0.02, 0.02, 0, 2],
    ["Gaafaru", 4.73, 73.49, 0.025, 0.022, 0, 2],
    ["North Male", 4.35, 73.5, 0.075, 0.2, 0.03, 12],
    ["South Male", 3.98, 73.47, 0.055, 0.09, 0, 6],
    ["Thoddoo", 4.43, 72.95, 0.018, 0.018, 0, 1],
    ["Rasdhoo", 4.27, 73, 0.032, 0.03, 0, 3],
    ["Ari", 3.92, 72.85, 0.085, 0.27, -0.03, 15],
    ["Felidhu", 3.52, 73.5, 0.075, 0.13, 0.06, 8],
    ["Vattaru", 3.22, 73.42, 0.018, 0.018, 0, 1],
    ["North Nilandhe", 3.14, 72.94, 0.06, 0.085, 0, 6],
    ["South Nilandhe", 2.84, 72.94, 0.065, 0.13, 0.04, 8],
    ["Mulaku", 2.94, 73.53, 0.07, 0.11, -0.05, 7],
    ["Kolhumadulu", 2.34, 73.15, 0.14, 0.145, 0.08, 11],
    ["Hadhdhunmathi", 1.93, 73.44, 0.075, 0.155, -0.08, 9],
    ["Huvadhu", 0.53, 73.28, 0.23, 0.245, 0.05, 18],
    ["Fuvahmulah", -0.3, 73.42, 0.028, 0.04, 0.2, 2],
    ["Addu", -0.62, 73.13, 0.075, 0.07, 0.15, 7]
  ];
  const ATOLLS = ATOLL_DEFS.map(([name, lat, lon, rx, ry, rot, pins], i) => {
    const [cx, cy] = P(lat, lon);
    const RX = rx * SCALE, RY = ry * SCALE;
    const solid = name === "Fuvahmulah";
    const n = Math.max(14, Math.round(18 + RY / 40));
    const outer = ringPoints(cx, cy, RX, RY, rot, i * 977 + 13, 0.17, n);
    const inner = ringPoints(cx, cy, RX * 0.58, RY * 0.62, rot, i * 977 + 401, 0.2, n);
    const rnd = mulberry32(i * 131 + 7);
    const islets = [];
    const cnt = solid ? 0 : Math.round(10 + RY / 22);
    for (let k = 0; k < cnt; k++) {
      const a = k / cnt * Math.PI * 2 + rnd() * 0.22;
      const rr = 0.8 + rnd() * 0.3;
      const x = Math.cos(a) * RX * rr, y = Math.sin(a) * RY * rr;
      const co = Math.cos(rot), si = Math.sin(rot);
      islets.push({
        x: cx + x * co - y * si,
        y: cy + x * si + y * co,
        r: (1.1 + rnd() * 2.6) * (1 + RY / 900)
      });
    }
    return {
      name,
      lat,
      lon,
      cx,
      cy,
      rx: RX,
      ry: RY,
      rot,
      solid,
      outer: closedSpline(outer),
      inner: solid ? null : closedSpline(inner),
      islets,
      pinCount: pins,
      pinAnchors: ringPoints(cx, cy, RX * 0.94, RY * 0.94, rot, i * 977 + 55, 0.12, pins)
    };
  });
  const HUBS = [
    { id: "male", label: "Mal\xE9", lat: 4.1755, lon: 73.5093, r: 0.16 },
    { id: "hulhumale", label: "Hulhumal\xE9", lat: 4.2105, lon: 73.54, r: 0.1 },
    { id: "kulhudhuffushi", label: "Kulhudhuffushi", lat: 6.6221, lon: 73.07, r: 0.28 },
    { id: "hoarafushi", label: "Hoarafushi", lat: 6.981, lon: 72.89, r: 0.26 },
    { id: "thinadhoo", label: "Thinadhoo", lat: 0.53, lon: 73, r: 0.3 },
    { id: "fuvahmulah", label: "Fuvahmulah", lat: -0.3, lon: 73.42, r: 0.22 },
    { id: "addu", label: "Addu City", lat: -0.6, lon: 73.08, r: 0.26 }
  ];
  const PURPLE_SEEDS = ["Faadhippolhu:2", "Maalhosmadulu N:5", "Ari:9", "Kolhumadulu:4", "Hadhdhunmathi:6"];
  const PINS = (() => {
    const out = [];
    let id = 0;
    ATOLLS.forEach((a) => {
      a.pinAnchors.forEach((p, k) => {
        out.push({
          id: id++,
          x: p[0],
          y: p[1],
          atoll: a.name,
          type: PURPLE_SEEDS.includes(a.name + ":" + k) ? "purple" : "grey",
          region: "rest",
          size: 0.85 + id * 37 % 5 * 0.05
        });
      });
    });
    const rnd = mulberry32(4242);
    const cluster = (lat, lon, w, h, n, rot) => {
      const [cx, cy] = P(lat, lon);
      for (let k = 0; k < n; k++) {
        const u = rnd() - 0.5, v = rnd() - 0.5;
        const x = u * w, y = v * h;
        out.push({
          id: id++,
          x: cx + x * Math.cos(rot) - y * Math.sin(rot),
          y: cy + x * Math.sin(rot) + y * Math.cos(rot),
          atoll: "Greater Mal\xE9",
          type: "grey",
          region: "male",
          size: 0.9 + rnd() * 0.25
        });
      }
    };
    cluster(4.1755, 73.5093, 17, 9.5, 26, 0);
    cluster(4.213, 73.541, 7, 21, 12, 0.12);
    cluster(4.192, 73.529, 6, 22, 4, 0);
    out[out.length - 20].type = "purple";
    out[out.length - 8].type = "purple";
    const hubCluster = (hub, n, spread) => {
      const [cx, cy] = P(hub.lat, hub.lon);
      for (let k = 0; k < n; k++) {
        out.push({
          id: id++,
          x: cx + (rnd() - 0.5) * spread,
          y: cy + (rnd() - 0.5) * spread,
          atoll: hub.label,
          type: "grey",
          region: hub.id,
          size: 0.85 + rnd() * 0.2
        });
      }
    };
    hubCluster(HUBS[2], 11, 34);
    hubCluster(HUBS[3], 8, 26);
    hubCluster(HUBS[4], 12, 38);
    hubCluster(HUBS[5], 7, 22);
    hubCluster(HUBS[6], 11, 32);
    out.forEach((p) => {
      if (p.region !== "rest") return;
      for (const h of HUBS) {
        const [hx, hy] = P(h.lat, h.lon);
        if (Math.hypot(p.x - hx, p.y - hy) < h.r * SCALE) {
          p.region = h.id === "hulhumale" ? "male" : h.id;
          break;
        }
      }
    });
    return out;
  })();
  const CITY_BLOCKS = (() => {
    const rnd = mulberry32(99);
    const blocks = [];
    const grid = (lat, lon, w, h, cols, rows, rot) => {
      const [cx, cy] = P(lat, lon);
      const bw = w / cols, bh = h / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if (rnd() < 0.08) continue;
        const x = -w / 2 + i * bw + bw * 0.09, y = -h / 2 + j * bh + bh * 0.09;
        blocks.push({
          x: cx + x * Math.cos(rot) - y * Math.sin(rot),
          y: cy + x * Math.sin(rot) + y * Math.cos(rot),
          w: bw * 0.82,
          h: bh * 0.82,
          rot
        });
      }
    };
    grid(4.1755, 73.5093, 18, 10, 11, 6, 0);
    grid(4.213, 73.541, 8, 22, 4, 11, 0.12);
    return blocks;
  })();
  const HUB_ISLANDS = (() => {
    const rnd = mulberry32(777);
    const out = [];
    const spreads = { male: 0, hulhumale: 0, kulhudhuffushi: 46, hoarafushi: 34, thinadhoo: 52, fuvahmulah: 26, addu: 44 };
    HUBS.forEach((h) => {
      const sp = spreads[h.id];
      if (!sp) return;
      const [cx, cy] = P(h.lat, h.lon);
      out.push({ x: cx, y: cy, rx: sp * 0.2, ry: sp * 0.13, rot: rnd() * 3, main: true });
      for (let i = 0; i < 16; i++) {
        const a = rnd() * Math.PI * 2, d = (0.35 + rnd() * 0.95) * sp;
        out.push({
          x: cx + Math.cos(a) * d * 1.25,
          y: cy + Math.sin(a) * d,
          rx: sp * (0.025 + rnd() * 0.07),
          ry: sp * (0.02 + rnd() * 0.055),
          rot: rnd() * 3,
          main: false
        });
      }
    });
    return out;
  })();
  window.MV_GEO = { LON0, LAT0, SCALE, P, ATOLLS, HUBS, PINS, CITY_BLOCKS, HUB_ISLANDS };
})();
