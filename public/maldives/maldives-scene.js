(() => {
  const { useComposition, Easing, clamp } = window;
  const G = window.MV_GEO;
  const { P, ATOLLS, HUBS, PINS, CITY_BLOCKS, HUB_ISLANDS, SCALE } = G;
  const PALETTE = {
    green: "#34C759",
    greenLight: "#3DD668",
    greenDark: "#28A046",
    purple: "#8B45D4",
    purpleDim: "#6B39A3",
    grey: "#6B7280",
    greyDim: "#4B5563",
    ink: "#0A0A0A",
    white: "#FFFFFF",
    muted: "#9CA3AF",
    deep: "#050B16",
    shelf: "#0E2A47",
    lagoon: "#17B39B",
    reef: "#22A2D6",
    indigo: "#3A46C8"
  };
  const W = 1920;
  const H = 1080;
  const MOTION = {
    fly: Easing.easeInOutCubic,
    // camera moves
    enter: Easing.easeOutQuart,
    // fades / reveals
    pop: Easing.easeOutBack
    // pin conversion overshoot
  };
  const lerp = (a, b, u) => a + (b - a) * u;
  const smooth = (t, a, b) => clamp((t - a) / (b - a || 1e-6), 0, 1);
  function CAM_KEYS(C) {
    return [
      { t: C.Establish + 0, lat: 3.1, lon: 74.85, h: 8600 },
      { t: C.Descent + 0, lat: 3.55, lon: 74.55, h: 7e3 },
      { t: C.Descent + 1.15, lat: 4.05, lon: 73.9, h: 1300 },
      { t: C.Ignite + 0, lat: 4.176, lon: 73.5095, h: 26 },
      { t: C.Ignite + 1, lat: 4.196, lon: 73.527, h: 58 },
      { t: C.ChainNorth + 0, lat: 4.205, lon: 73.533, h: 120 },
      { t: C.ChainNorth + 0.45, lat: 5.3, lon: 73.3, h: 2600 },
      { t: C.ChainNorth + 0.95, lat: 6.6221, lon: 73.07, h: 130 },
      { t: C.ChainNorth + 1.55, lat: 6.8, lon: 72.98, h: 700 },
      { t: C.ChainNorth + 1.95, lat: 6.981, lon: 72.89, h: 125 },
      { t: C.ChainSouth + 0, lat: 5.2, lon: 73.1, h: 3600 },
      { t: C.ChainSouth + 0.25, lat: 2.3, lon: 73.2, h: 3600 },
      { t: C.ChainSouth + 0.55, lat: 0.53, lon: 73, h: 150 },
      { t: C.ChainSouth + 1.15, lat: -0.3, lon: 73.42, h: 95 },
      { t: C.PullBack + 0.05, lat: -0.6, lon: 73.08, h: 150 },
      { t: C.PullBack + 0.9, lat: -0.2, lon: 73.3, h: 1800 },
      { t: C.Resolve + 0, lat: 3.1, lon: 74.85, h: 8100 },
      { t: C.Resolve + 3, lat: 3.1, lon: 74.85, h: 8600 }
    ];
  }
  function sampleCam(keys, T) {
    if (T <= keys[0].t) return keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (T <= b.t) {
        const e = MOTION.fly(clamp((T - a.t) / (b.t - a.t || 1e-6), 0, 1));
        return {
          lat: lerp(a.lat, b.lat, e),
          lon: lerp(a.lon, b.lon, e),
          h: Math.exp(lerp(Math.log(a.h), Math.log(b.h), e))
        };
      }
    }
    return keys[keys.length - 1];
  }
  function SCHEDULE(C) {
    const at = {};
    const male = PINS.filter((p) => p.region === "male");
    const [ox, oy] = P(4.1755, 73.5093);
    const sorted = male.slice().sort((a, b) => Math.hypot(a.x - ox, a.y - oy) - Math.hypot(b.x - ox, b.y - oy));
    sorted.forEach((p, i) => {
      if (i === 0) {
        at[p.id] = C.Ignite + 0.15;
        return;
      }
      const u = Easing.easeOutQuad(i / (sorted.length - 1));
      at[p.id] = C.Ignite + 0.42 + u * 0.95 + (p.type === "purple" ? 0.32 : 0);
    });
    const hub = (id, t) => {
      const list = PINS.filter((p) => p.region === id);
      const c = list.reduce((s, p) => [s[0] + p.x / list.length, s[1] + p.y / list.length], [0, 0]);
      list.slice().sort((a, b) => Math.hypot(a.x - c[0], a.y - c[1]) - Math.hypot(b.x - c[0], b.y - c[1])).forEach((p, i) => {
        at[p.id] = t + i * 0.028 + (p.type === "purple" ? 0.3 : 0);
      });
    };
    hub("kulhudhuffushi", C.ChainNorth + 0.95);
    hub("hoarafushi", C.ChainNorth + 1.95);
    hub("thinadhoo", C.ChainSouth + 0.55);
    hub("fuvahmulah", C.ChainSouth + 1.15);
    hub("addu", C.PullBack + 0.05);
    const rest = PINS.filter((p) => p.region === "rest");
    const [mx, my] = P(3.4, 73.3);
    const dmax = Math.max(...rest.map((p) => Math.hypot(p.x - mx, p.y - my)));
    rest.forEach((p) => {
      const u = Math.hypot(p.x - mx, p.y - my) / dmax;
      at[p.id] = C.PullBack + 0.55 + Easing.easeOutQuad(u) * 1.35 + (p.type === "purple" ? 0.45 : 0);
    });
    const holdout = PINS.find((p) => p.type === "purple" && p.atoll === "Faadhippolhu");
    if (holdout) at[holdout.id] = C.PullBack + 2.25;
    return at;
  }
  function LINKS(C) {
    const L = (a, b, s, e) => ({ a, b, s, e });
    const male = [4.1755, 73.5093], kul = [6.6221, 73.07], hoa = [6.981, 72.89];
    const thi = [0.53, 73], fuv = [-0.3, 73.42], add = [-0.6, 73.08];
    return [
      L(male, kul, C.ChainNorth + 0.95, C.ChainNorth + 1.6),
      L(kul, hoa, C.ChainNorth + 1.95, C.ChainNorth + 2.3),
      L(male, thi, C.ChainSouth + 0.55, C.ChainSouth + 1.1),
      L(thi, fuv, C.ChainSouth + 1.15, C.ChainSouth + 1.45),
      L(fuv, add, C.PullBack + 0.05, C.PullBack + 0.4),
      L(male, [5.38, 73.55], C.PullBack + 1.05, C.PullBack + 1.75),
      L(male, [3.92, 72.85], C.PullBack + 1.15, C.PullBack + 1.85),
      L(kul, [5.52, 72.96], C.PullBack + 1.25, C.PullBack + 1.95),
      L([5.52, 72.96], male, C.PullBack + 1.45, C.PullBack + 2.1),
      L(male, [2.34, 73.15], C.PullBack + 1.35, C.PullBack + 2.05),
      L([2.34, 73.15], [1.93, 73.44], C.PullBack + 1.55, C.PullBack + 2.15),
      L([1.93, 73.44], thi, C.PullBack + 1.7, C.PullBack + 2.3),
      L([6.12, 73.2], kul, C.PullBack + 1.6, C.PullBack + 2.2),
      L(male, [6.12, 73.2], C.PullBack + 1.8, C.PullBack + 2.4)
    ];
  }
  function LABELS(C) {
    return [
      { text: "Mal\xE9", sub: "Capital \xB7 densest merchant cluster", lat: 4.1755, lon: 73.5093, s: C.Ignite - 0.15, e: C.ChainNorth + 0.15 },
      { text: "Hulhumal\xE9", sub: null, lat: 4.213, lon: 73.541, s: C.Ignite + 1.05, e: C.ChainNorth + 0.15 },
      { text: "Kulhudhuffushi", sub: "Haa Dhaalu", lat: 6.6221, lon: 73.07, s: C.ChainNorth + 0.8, e: C.ChainNorth + 1.6 },
      { text: "Hoarafushi", sub: "Haa Alifu \xB7 northern tip", lat: 6.981, lon: 72.89, s: C.ChainNorth + 1.8, e: C.ChainSouth + 0.05 },
      { text: "Thinadhoo", sub: "Gaafu Dhaalu \xB7 Huvadhu", lat: 0.53, lon: 73, s: C.ChainSouth + 0.4, e: C.ChainSouth + 1.05 },
      { text: "Fuvahmulah", sub: "Below the equator", lat: -0.3, lon: 73.42, s: C.ChainSouth + 1, e: C.PullBack - 0.05 },
      { text: "Addu City", sub: "Southernmost city", lat: -0.6, lon: 73.08, s: C.PullBack - 0.05, e: C.PullBack + 0.8 }
    ];
  }
  const PIN_PATH = "M0 0C-0.30 -0.42 -0.36 -0.60 -0.36 -0.72A0.36 0.36 0 1 1 0.36 -0.72C0.36 -0.60 0.30 -0.42 0 0Z";
  function mixHex(a, b, u) {
    const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const A = p(a), B = p(b);
    return "#" + [0, 1, 2].map((i) => Math.round(lerp(A[i], B[i], u)).toString(16).padStart(2, "0")).join("");
  }
  function Pin({ pin, T, convertAt, px, wobble }) {
    const dt = T - convertAt;
    const converting = dt >= 0 && dt < 0.5;
    const done = dt >= 0.5;
    const resisting = pin.type === "purple" && dt > -0.2 && dt < 0;
    let fill, scale = 1, glow = 0, opacity;
    if (done) {
      fill = PALETTE.green;
      opacity = 1;
      glow = 1;
    } else if (converting) {
      const u = dt / 0.5;
      fill = u < 0.5 ? mixHex(pin.type === "purple" ? PALETTE.purple : PALETTE.grey, "#EAFFF0", u * 2) : mixHex("#EAFFF0", PALETTE.green, (u - 0.5) * 2);
      scale = 1 + 0.35 * (1 - MOTION.pop(u)) + (u < 0.18 ? 0.25 : 0);
      scale = 1 + (MOTION.pop(u) < 1 ? (1.35 - 1) * Math.sin(u * Math.PI) * 1.6 : 0);
      scale = clamp(scale, 1, 1.35);
      if (u > 0.55) scale = lerp(1.35, 1, MOTION.enter((u - 0.55) / 0.45));
      opacity = 1;
      glow = u;
    } else if (pin.type === "purple") {
      fill = PALETTE.purple;
      opacity = 0.9;
    } else {
      fill = PALETTE.grey;
      opacity = 0.55;
    }
    const breathe = pin.type === "grey" && !done && !converting ? 1 + 0.06 * Math.sin(T * 1.6 + wobble) : 1;
    const alive = done ? 1 + 0.045 * Math.sin(T * 2.1 + wobble) : 1;
    const s = px * pin.size * scale * breathe * alive * (pin.type === "grey" && !done ? 0.82 : pin.type === "purple" && !done ? 0.92 : 1);
    const ring = converting ? dt / 0.5 : -1;
    return /* @__PURE__ */ React.createElement("g", { transform: `translate(${pin.x.toFixed(1)} ${pin.y.toFixed(1)})`, opacity }, ring >= 0 && /* @__PURE__ */ React.createElement(
      "circle",
      {
        cx: "0",
        cy: -0.72 * s,
        r: (0.5 + ring * 4.2) * s,
        fill: "none",
        stroke: PALETTE.greenLight,
        strokeWidth: 0.16 * s * (1 - ring),
        opacity: (1 - ring) * 0.75
      }
    ), done && /* @__PURE__ */ React.createElement(
      "circle",
      {
        cx: "0",
        cy: -0.72 * s,
        r: 1.5 * s,
        fill: PALETTE.green,
        opacity: 0.13 + 0.05 * Math.sin(T * 2.1 + wobble)
      }
    ), /* @__PURE__ */ React.createElement("ellipse", { cx: 0.12 * s, cy: 0.05 * s, rx: 0.3 * s, ry: 0.11 * s, fill: "#000", opacity: "0.35" }), /* @__PURE__ */ React.createElement("g", { transform: `translate(${resisting ? Math.sin(T * 90) * 0.09 * s : 0} 0) scale(${s})` }, /* @__PURE__ */ React.createElement("path", { d: PIN_PATH, fill }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "-0.72", r: "0.135", fill: done || converting ? "#0A2A14" : "#0A0A0A", opacity: "0.55" })));
  }
  function MaldivesPiece(props) {
    const { T, CUES: C, authoredTotal } = useComposition();
    const t = props.tweaks || {};
    const showLabels = t.showLabels !== false;
    const showEquator = t.showEquator !== false;
    const aurora = t.auroraIntensity == null ? 1 : t.auroraIntensity;
    const keys = React.useMemo(() => CAM_KEYS(C), [C.Resolve, C.PullBack, C.Ignite]);
    const sched = React.useMemo(() => SCHEDULE(C), [C.Resolve, C.PullBack, C.Ignite]);
    const links = React.useMemo(() => LINKS(C), [C.Resolve, C.PullBack, C.Ignite]);
    const labels = React.useMemo(() => LABELS(C), [C.Resolve, C.PullBack, C.Ignite]);
    const cam = sampleCam(keys, T);
    const k = H / cam.h;
    const [ccx, ccy] = P(cam.lat, cam.lon);
    const TILT = -4.2 * Math.PI / 180;
    const SQUASH = 0.955;
    const toScreen = (x, y) => {
      const dx = x - ccx, dy = y - ccy;
      const rx = dx * Math.cos(TILT) - dy * Math.sin(TILT);
      const ry = (dx * Math.sin(TILT) + dy * Math.cos(TILT)) * SQUASH;
      return [W / 2 + rx * k, H / 2 + ry * k];
    };
    const mapT = `translate(${W / 2} ${H / 2}) scale(${k} ${k * SQUASH}) rotate(${TILT * 180 / Math.PI}) translate(${-ccx} ${-ccy})`;
    const zu = clamp(Math.log(cam.h / 26) / Math.log(8600 / 26), 0, 1);
    const pinPx = lerp(26, 14, zu) / k;
    const hairline = 1 / k;
    const detail = 1 - clamp((cam.h - 60) / 190, 0, 1);
    const haze = clamp((cam.h - 400) / 8e3, 0, 1);
    return /* @__PURE__ */ React.createElement(
      "svg",
      {
        width: W,
        height: H,
        viewBox: `0 0 ${W} ${H}`,
        xmlns: "http://www.w3.org/2000/svg",
        "data-screen-label": `${Math.floor(T)}s`,
        style: { display: "block", width: "100%", height: "100%", background: PALETTE.ink }
      },
      /* @__PURE__ */ React.createElement("title", null, "Perx across the Maldives"),
      /* @__PURE__ */ React.createElement("desc", null, "An animated map of the Maldives in which merchant location pins convert from grey and purple to Perx green, spreading from Mal\xE9 outward to every atoll."),
      /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("radialGradient", { id: "oc1", cx: "50%", cy: "50%" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#123a5c", stopOpacity: "0.85" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#050B16", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "lag" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: PALETTE.lagoon, stopOpacity: "0.55" }), /* @__PURE__ */ React.createElement("stop", { offset: "70%", stopColor: PALETTE.reef, stopOpacity: "0.30" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: PALETTE.reef, stopOpacity: "0.10" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "au1" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#34C759", stopOpacity: 0.5 * aurora }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#34C759", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "au2" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#2E6FD0", stopOpacity: 0.5 * aurora }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#2E6FD0", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("radialGradient", { id: "au3" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#8B45D4", stopOpacity: 0.33 * aurora }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#8B45D4", stopOpacity: "0" })), /* @__PURE__ */ React.createElement("linearGradient", { id: "azure", x1: "0", y1: "0", x2: "1", y2: "0" }, /* @__PURE__ */ React.createElement("stop", { offset: "0%", stopColor: "#00A6FF" }), /* @__PURE__ */ React.createElement("stop", { offset: "100%", stopColor: "#2563EB" }))),
      /* @__PURE__ */ React.createElement("rect", { x: "0", y: "0", width: W, height: H, fill: PALETTE.ink }),
      /* @__PURE__ */ React.createElement("g", { opacity: "0.9" }, /* @__PURE__ */ React.createElement("ellipse", { cx: 330 + Math.sin(T * 0.14) * 70, cy: 120 + Math.cos(T * 0.11) * 50, rx: "900", ry: "640", fill: "url(#au1)" }), /* @__PURE__ */ React.createElement("ellipse", { cx: 220 + Math.cos(T * 0.09) * 60, cy: 960 + Math.sin(T * 0.13) * 45, rx: "880", ry: "620", fill: "url(#au2)" }), /* @__PURE__ */ React.createElement("ellipse", { cx: 1720 + Math.sin(T * 0.1) * 55, cy: 800 + Math.cos(T * 0.12) * 60, rx: "820", ry: "600", fill: "url(#au3)" })),
      /* @__PURE__ */ React.createElement("rect", { x: "0", y: "0", width: W, height: H, fill: "url(#oc1)", opacity: 0.55 - 0.35 * (1 - haze) }),
      /* @__PURE__ */ React.createElement("g", { transform: mapT }, showEquator && /* @__PURE__ */ React.createElement("g", { opacity: 0.3 + 0.15 * Math.sin(T * 0.8) }, /* @__PURE__ */ React.createElement(
        "line",
        {
          x1: -9e3,
          y1: P(0, 0)[1],
          x2: 9e3,
          y2: P(0, 0)[1],
          stroke: "#5BA6FE",
          strokeWidth: hairline * 1.2,
          strokeDasharray: `${hairline * 14} ${hairline * 12}`
        }
      )), ATOLLS.map((a, i) => {
        const glowU = smooth(T, C.PullBack + 0.4, C.Resolve + 0.6);
        return /* @__PURE__ */ React.createElement("g", { key: a.name }, /* @__PURE__ */ React.createElement("path", { d: a.outer, fill: "url(#lag)", opacity: 0.55 }), /* @__PURE__ */ React.createElement(
          "path",
          {
            d: a.outer,
            fill: "none",
            stroke: PALETTE.reef,
            strokeWidth: Math.max(hairline * 1.1, a.ry * 0.012),
            opacity: "0.45"
          }
        ), a.inner && /* @__PURE__ */ React.createElement("path", { d: a.inner, fill: PALETTE.deep, opacity: "0.55" }), a.inner && /* @__PURE__ */ React.createElement("path", { d: a.inner, fill: PALETTE.lagoon, opacity: "0.16" }), a.solid && /* @__PURE__ */ React.createElement("path", { d: a.outer, fill: "#1b2b22", opacity: "0.9" }), a.islets.map((s, j) => /* @__PURE__ */ React.createElement(
          "circle",
          {
            key: j,
            cx: s.x,
            cy: s.y,
            r: s.r,
            fill: "#9db5a6",
            opacity: 0.55 + 0.25 * Math.sin(i + j)
          }
        )), /* @__PURE__ */ React.createElement(
          "path",
          {
            d: a.outer,
            fill: "none",
            stroke: PALETTE.green,
            strokeWidth: hairline * 2.2,
            opacity: glowU * 0.22
          }
        ));
      }), /* @__PURE__ */ React.createElement("g", null, HUB_ISLANDS.map((s2, i) => /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement(
        "ellipse",
        {
          cx: s2.x,
          cy: s2.y,
          rx: s2.rx * 1.9,
          ry: s2.ry * 1.9,
          fill: PALETTE.lagoon,
          opacity: "0.14"
        }
      ), /* @__PURE__ */ React.createElement(
        "ellipse",
        {
          cx: s2.x,
          cy: s2.y,
          rx: s2.rx,
          ry: s2.ry,
          transform: `rotate(${s2.rot * 40} ${s2.x} ${s2.y})`,
          fill: s2.main ? "#b6c9ba" : "#9db5a6",
          opacity: s2.main ? 0.75 : 0.6
        }
      )))), detail > 0.01 && /* @__PURE__ */ React.createElement("g", { opacity: detail }, CITY_BLOCKS.map((b, i) => /* @__PURE__ */ React.createElement(
        "rect",
        {
          key: i,
          x: b.x,
          y: b.y,
          width: b.w,
          height: b.h,
          transform: `rotate(${b.rot * 180 / Math.PI} ${b.x} ${b.y})`,
          fill: "#c8d4cc",
          opacity: 0.22 + i * 7 % 5 * 0.04,
          rx: b.w * 0.12
        }
      ))), links.map((L, i) => {
        const u = MOTION.enter(smooth(T, L.s, L.e));
        if (u <= 0) return null;
        const [x1, y1] = P(L.a[0], L.a[1]);
        const [x2, y2] = P(L.b[0], L.b[1]);
        const mx = (x1 + x2) / 2 + (y2 - y1) * 0.13;
        const my = (y1 + y2) / 2 - (x2 - x1) * 0.13;
        const len = Math.hypot(x2 - x1, y2 - y1) * 1.12;
        const done = T > L.e;
        return /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement(
          "path",
          {
            d: `M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`,
            fill: "none",
            stroke: PALETTE.greenLight,
            strokeWidth: hairline * 1.6,
            strokeDasharray: `${len * u} ${len}`,
            opacity: done ? 0.45 + 0.25 * Math.sin(T * 2 + i) : 0.85
          }
        ));
      }), PINS.map((p) => /* @__PURE__ */ React.createElement(Pin, { key: p.id, pin: p, T, convertAt: sched[p.id], px: pinPx, wobble: p.id % 17 * 0.61 }))),
      /* @__PURE__ */ React.createElement("rect", { x: "0", y: "0", width: W, height: H, fill: "#0A1428", opacity: haze * 0.28, pointerEvents: "none" }),
      showLabels && labels.map((L, i) => {
        const u = MOTION.enter(smooth(T, L.s, L.s + 0.35)) * (1 - smooth(T, L.e - 0.3, L.e));
        if (u <= 0.01) return null;
        const [sx, sy] = toScreen(...P(L.lat, L.lon));
        if (sx < -400 || sx > W + 400 || sy < -300 || sy > H + 300) return null;
        return /* @__PURE__ */ React.createElement("g", { key: i, transform: `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`, opacity: u }, /* @__PURE__ */ React.createElement("line", { x1: "0", y1: "0", x2: "0", y2: "-64", stroke: "#FFFFFF", strokeWidth: "1.5", opacity: "0.5" }), /* @__PURE__ */ React.createElement("circle", { cx: "0", cy: "0", r: "4", fill: PALETTE.greenLight }), /* @__PURE__ */ React.createElement(
          "rect",
          {
            x: "2",
            y: L.sub ? -104 : -104,
            width: Math.max(L.text.length * 19, L.sub ? L.sub.length * 9 : 0) + 34,
            height: L.sub ? 76 : 50,
            rx: "12",
            fill: "#0A0A0A",
            opacity: "0.62"
          }
        ), /* @__PURE__ */ React.createElement(
          "text",
          {
            x: "14",
            y: "-70",
            fill: "#FFFFFF",
            fontSize: "34",
            fontWeight: "700",
            letterSpacing: "-0.02em",
            style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" },
            transform: `translate(0 ${(1 - u) * 8})`
          },
          L.text
        ), L.sub && /* @__PURE__ */ React.createElement(
          "text",
          {
            x: "14",
            y: "-42",
            fill: PALETTE.muted,
            fontSize: "18",
            fontWeight: "400",
            style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
          },
          L.sub
        ));
      }),
      /* @__PURE__ */ React.createElement(OpeningTitle, { T, C }),
      /* @__PURE__ */ React.createElement(Legend, { T, C, sched }),
      /* @__PURE__ */ React.createElement(Resolve, { T, C, authoredTotal })
    );
  }
  function OpeningTitle({ T, C }) {
    const u = MOTION.enter(smooth(T, 0.35, 1.2)) * (1 - MOTION.enter(smooth(T, C.Descent + 0.15, C.Descent + 0.75)));
    if (u <= 0.01) return null;
    return /* @__PURE__ */ React.createElement("g", { opacity: u, transform: `translate(${1120} ${400 - (1 - u) * 8})` }, /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "0",
        y: "0",
        fill: PALETTE.muted,
        fontSize: "20",
        fontWeight: "700",
        letterSpacing: "0.14em",
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
      },
      "THE MALDIVES \xB7 2026"
    ), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "0",
        y: "92",
        fill: "#FFFFFF",
        fontSize: "68",
        fontWeight: "900",
        letterSpacing: "-0.02em",
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
      },
      "1,192 islands."
    ), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "0",
        y: "160",
        fill: "#FFFFFF",
        fontSize: "68",
        fontWeight: "900",
        letterSpacing: "-0.02em",
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" },
        opacity: "0.45"
      },
      "One loyalty network."
    ));
  }
  function Legend({ T, C, sched }) {
    const u = MOTION.enter(smooth(T, 1.1, 1.9)) * (1 - MOTION.enter(smooth(T, C.Resolve - 0.5, C.Resolve + 0.1)));
    if (u <= 0.01) return null;
    const green = PINS.filter((p) => T >= (sched[p.id] || 1e9) + 0.5).length;
    const rows = [
      ["No loyalty platform", PALETTE.grey, 0.55],
      ["Other provider", PALETTE.purple, 0.9],
      ["Live on Perx", PALETTE.green, 1]
    ];
    return /* @__PURE__ */ React.createElement("g", { opacity: u, transform: "translate(96 852)" }, rows.map(([label, color, op], i) => /* @__PURE__ */ React.createElement("g", { key: label, transform: `translate(0 ${i * 40})` }, /* @__PURE__ */ React.createElement("g", { transform: "scale(26)", opacity: op }, /* @__PURE__ */ React.createElement("path", { d: PIN_PATH, fill: color, transform: "translate(0 0.5)" })), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "26",
        y: "4",
        fill: "#FFFFFF",
        fontSize: "19",
        fontWeight: "500",
        opacity: "0.85",
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
      },
      label
    ))), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "0",
        y: "168",
        fill: PALETTE.greenLight,
        fontSize: "44",
        fontWeight: "900",
        letterSpacing: "-0.02em",
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
      },
      green
    ), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "0",
        y: "196",
        fill: PALETTE.muted,
        fontSize: "16",
        fontWeight: "400",
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
      },
      "merchants live on Perx"
    ));
  }
  const WORDMARK = [
    "M64.2999 217.04H0.119921V180.76C0.119921 160.62 -1.41008 138.93 6.45992 119.89C11.0399 108.82 18.8899 100.01 29.2899 94.05C38.9099 88.54 50.3399 85.91 61.3899 85.99C73.2399 86.08 86.3999 88.26 95.5599 96.36C98.3899 98.87 101 101.61 103 104.84C104.05 106.54 104.93 108.34 105.68 110.2C106.24 111.58 108.22 115.27 107.84 116.7C113.84 94.16 121.59 85.61 144.51 78.79C121.86 71.11 113.75 62.9 107.84 40.88C104.2 52.57 100.49 57.37 91.7299 63.68C72.4499 77.56 44.3699 73.44 27.0399 58.31C16.2699 48.9 9.76991 35.35 8.15991 21.22C7.92991 19.23 6.73992 0 7.09992 0H107.83C127.34 0 145.68 9.90999 158.87 22.05C174.87 36.77 182.66 58.47 182.66 79.29C181.71 102.02 169.34 124.14 158.87 134.54C148.41 144.95 135.27 155.79 110.31 156.84C85.3399 157.89 64.2999 156.84 64.2999 156.84V217.05V217.04Z",
    "M238.14 70.67C234.45 74.36 232.16 79.47 232.16 85.1H312.03V139.83H232.16V141.9C232.16 153.17 241.3 162.31 252.57 162.31H317.94V217.04H230.75C198.85 217.04 172.99 191.18 172.99 159.28V129.47C181.84 116.6 189.6 98.33 190.39 79.6V79.4401V79.2801C190.39 63.5201 186.46 48.44 179.25 35.6C188.81 16.88 208.28 4.05005 230.74 4.05005H317.93V64.6901H252.56C246.92 64.6901 241.82 66.97 238.13 70.67H238.14Z",
    "M612.53 104.63L683.23 4.05005H613.71L580.28 57.89L543.01 4.05005H469.06L540.35 106.11L507.48 154.26C494.98 172.57 468.44 173.82 454.26 156.78L444.6 145.16C460.87 138.95 471.22 129.19 477.73 118.54C486.01 104.64 487.79 88.6601 487.79 75.0601C487.79 25.9501 449.04 4.06006 394.9 4.06006H325.68V217.05H384.84V153.15L419.18 197.04C429.06 209.66 444.2 217.04 460.23 217.04H504.35C522 217.04 538.44 208.11 548.06 193.31L573.77 153.73L617.85 217.03H690.32L612.52 104.62L612.53 104.63ZM399.94 105.82H384.85V64.7H398.16C415.91 64.7 427.15 70.62 427.15 83.04C427.15 98.42 416.8 105.82 399.94 105.82Z"
  ];
  function Resolve({ T, C, authoredTotal }) {
    const u = MOTION.enter(smooth(T, C.Resolve + 0.35, C.Resolve + 1.25));
    const out = MOTION.enter(smooth(T, authoredTotal - 0.22, authoredTotal));
    const o = u * (1 - out);
    if (o <= 0.01) return null;
    const s = 0.62;
    return /* @__PURE__ */ React.createElement("g", { opacity: o, transform: `translate(1120 ${430 - (1 - u) * 8})` }, /* @__PURE__ */ React.createElement("g", { transform: `scale(${s})` }, WORDMARK.map((d, i) => /* @__PURE__ */ React.createElement("path", { key: i, d, fill: "#FFFFFF" }))), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "2",
        y: "196",
        fill: "#FFFFFF",
        fontSize: "30",
        fontWeight: "500",
        opacity: "0.75",
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
      },
      "The Merchant Growth Platform"
    ), /* @__PURE__ */ React.createElement(
      "line",
      {
        x1: "2",
        y1: "240",
        x2: "430",
        y2: "240",
        stroke: PALETTE.green,
        strokeWidth: "2",
        opacity: MOTION.enter(smooth(T, C.Resolve + 0.9, C.Resolve + 1.5))
      }
    ), /* @__PURE__ */ React.createElement(
      "text",
      {
        x: "2",
        y: "300",
        fill: "#FFFFFF",
        fontSize: "46",
        fontWeight: "900",
        letterSpacing: "-0.02em",
        opacity: MOTION.enter(smooth(T, C.Resolve + 1.05, C.Resolve + 1.7)),
        style: { fontFamily: "Satoshi, Inter, system-ui, sans-serif" }
      },
      "One network. Every atoll."
    ));
  }
  window.MaldivesPiece = MaldivesPiece;
})();
