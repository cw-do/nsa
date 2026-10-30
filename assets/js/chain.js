// The hero figure. Top: a semiflexible (wormlike) chain of 120 segments that twists
// at random about its own bonds. Torsion moves keep every bond length and bond angle,
// so the chain stays a valid wormlike-chain conformation while it moves.
// Bottom: its scattering, P(q) = (1/N^2) sum_ij sin(q r_ij)/(q r_ij), next to the
// Debye function for an ideal Gaussian chain with the same radius of gyration.
(function () {
  "use strict";
  const canvas = document.getElementById("chain");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const N = 121;           // beads, so 120 segments of unit length
  const SIGMA = 0.35;      // rms bend between neighbouring bonds; persistence ~ 1/SIGMA^2 ~ 8 segments
  const TUBE = 2.0;        // drawn tube radius, in segment lengths
  const RING = 12;         // dots around the tube
  const SUB = 2;           // rings per segment
  const TWISTS = 6;        // torsion moves running at once
  const NQ = 72, QMIN = 0.01, QMAX = 2.5;
  const LOGP_MIN = -2.35, LOGP_MAX = 0.15;

  // Small deterministic generator, so the page opens on the same chain every time.
  let seed = 20250408;
  function rand() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  function randomUnit() {
    const z = 2 * rand() - 1, phi = 2 * Math.PI * rand(), r = Math.sqrt(1 - z * z);
    return [r * Math.cos(phi), r * Math.sin(phi), z];
  }

  function makeChain() {
    const p = [[0, 0, 0]];
    let t = randomUnit();
    for (let i = 1; i < N; i++) {
      const v = randomUnit();
      const d = dot(v, t);
      const u = norm([v[0] - d * t[0], v[1] - d * t[1], v[2] - d * t[2]]);
      const theta = SIGMA * Math.sqrt(-2 * Math.log(1 - rand()));
      t = norm([t[0] * Math.cos(theta) + u[0] * Math.sin(theta), t[1] * Math.cos(theta) + u[1] * Math.sin(theta), t[2] * Math.cos(theta) + u[2] * Math.sin(theta)]);
      const q = p[i - 1];
      p.push([q[0] + t[0], q[1] + t[1], q[2] + t[2]]);
    }
    return p;
  }

  function radiusOfGyration(p) {
    let cx = 0, cy = 0, cz = 0;
    for (const r of p) { cx += r[0]; cy += r[1]; cz += r[2]; }
    cx /= N; cy /= N; cz /= N;
    let s = 0;
    for (const r of p) s += (r[0] - cx) ** 2 + (r[1] - cy) ** 2 + (r[2] - cz) ** 2;
    return Math.sqrt(s / N);
  }

  // Open on a typical chain: of a few candidates, the one whose Rg is the median.
  let pos = (function () {
    const c = [];
    for (let k = 0; k < 15; k++) { const p = makeChain(); c.push([radiusOfGyration(p), p]); }
    c.sort((a, b) => a[0] - b[0]);
    return c[7][1];
  })();

  // Rotate the shorter end of the chain about bond k (beads k-1 -> k) by angle phi.
  function twist(k, phi) {
    const a = norm([pos[k][0] - pos[k - 1][0], pos[k][1] - pos[k - 1][1], pos[k][2] - pos[k - 1][2]]);
    const P = pos[k];
    const c = Math.cos(phi), s = Math.sin(phi);
    const from = k > N / 2 ? k + 1 : 0, to = k > N / 2 ? N : k - 1;
    for (let j = from; j < to; j++) {
      const v = [pos[j][0] - P[0], pos[j][1] - P[1], pos[j][2] - P[2]];
      const axv = cross(a, v), ad = dot(a, v) * (1 - c);
      pos[j] = [P[0] + v[0] * c + axv[0] * s + a[0] * ad, P[1] + v[1] * c + axv[1] * s + a[1] * ad, P[2] + v[2] * c + axv[2] * s + a[2] * ad];
    }
  }

  function newTwist(now) {
    const k = 1 + Math.floor(rand() * (N - 2));
    const tail = Math.max(2, Math.min(k, N - k));
    return { k, t0: now, dur: 3 + 4 * rand(), amp: (rand() < 0.5 ? -1 : 1) * 1.4 / Math.sqrt(tail) };
  }
  let twists = [];

  // ---- Scattering ----
  const qs = Array.from({ length: NQ }, (_, i) => QMIN * Math.pow(QMAX / QMIN, i / (NQ - 1)));
  const shown = { chain: null, debye: null, rg: 0 };
  let target = { chain: null, debye: null, rg: 0 };

  function scattering() {
    const dr = 0.1;
    const hist = new Float64Array(Math.ceil(N / dr) + 2);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const r = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1], pos[i][2] - pos[j][2]);
        hist[Math.round(r / dr)] += 1;
      }
    }
    const bins = [];
    for (let b = 1; b < hist.length; b++) if (hist[b]) bins.push([b * dr, hist[b]]);
    const rg = radiusOfGyration(pos);
    const chain = [], debye = [];
    for (const q of qs) {
      let s = N;
      for (const [r, h] of bins) { const x = q * r; s += 2 * h * Math.sin(x) / x; }
      chain.push(Math.log10(Math.max(s / (N * N), 1e-6)));
      const x = (q * rg) ** 2;
      const pd = x < 1e-4 ? 1 - x / 3 : 2 * (Math.exp(-x) + x - 1) / (x * x);
      debye.push(Math.log10(pd));
    }
    target = { chain, debye, rg };
    if (!shown.chain) { shown.chain = chain.slice(); shown.debye = debye.slice(); shown.rg = rg; }
  }

  // ---- Drawing ----
  let W = 0, H = 0, dpr = 1;
  const view = { cx: 0, cy: 0, scale: 0 };
  const colors = [[106, 212, 231], [128, 170, 240], [150, 140, 236], [182, 128, 220], [226, 160, 205]];
  const BUCKETS = 10, LEVELS = 4;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    view.scale = 0;
    draw(performance.now());
  }

  function colorAt(u) {
    const x = u * (colors.length - 1), i = Math.min(Math.floor(x), colors.length - 2), f = x - i;
    return colors[i].map((c, k) => Math.round(c + (colors[i + 1][k] - c) * f));
  }
  const bucketColor = Array.from({ length: BUCKETS }, (_, b) => colorAt(b / (BUCKETS - 1)));

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return [0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }

  function drawChain(time, panel) {
    const yaw = time * 0.00006, pitch = 0.32;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = (v) => {
      const x = v[0] * cyw + v[2] * syw, z = -v[0] * syw + v[2] * cyw;
      return [x, v[1] * cp - z * sp, v[1] * sp + z * cp];
    };

    // Smooth tube centreline through the beads.
    const line = [];
    for (let i = 0; i < N - 1; i++) {
      const p0 = pos[Math.max(i - 1, 0)], p1 = pos[i], p2 = pos[i + 1], p3 = pos[Math.min(i + 2, N - 1)];
      for (let s = 0; s < SUB; s++) line.push(catmull(p0, p1, p2, p3, s / SUB));
    }
    line.push(pos[N - 1]);
    const M = line.length;

    // Fit the view to the chain, easing so the frame never jumps.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const proj = line.map(rot);
    for (const r of proj) { x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1]); }
    const pad = TUBE * 2;
    const sTarget = Math.min(panel.w / (x1 - x0 + 2 * pad), panel.h / (y1 - y0 + 2 * pad));
    const cxT = (x0 + x1) / 2, cyT = (y0 + y1) / 2;
    if (!view.scale) { view.scale = sTarget; view.cx = cxT; view.cy = cyT; }
    view.scale += (sTarget - view.scale) * 0.02;
    view.cx += (cxT - view.cx) * 0.03;
    view.cy += (cyT - view.cy) * 0.03;

    // Parallel-transport frame along the tube, so the dot rings do not spin about the axis.
    const tang = [], nrm = [];
    for (let i = 0; i < M; i++) {
      const a = line[Math.max(i - 1, 0)], b = line[Math.min(i + 1, M - 1)];
      tang.push(norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
    }
    let n = norm(cross(tang[0], Math.abs(tang[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    for (let i = 0; i < M; i++) {
      const t = tang[i], d = dot(n, t);
      n = norm([n[0] - d * t[0], n[1] - d * t[1], n[2] - d * t[2]]);
      nrm.push(n);
    }

    // The radius of gyration as a ring about the centre of mass: the same R_g that
    // sets where the scattering curve below turns over, at q ~ 1/R_g.
    let mx = 0, my = 0, mz = 0;
    for (const r of pos) { mx += r[0]; my += r[1]; mz += r[2]; }
    const com = rot([mx / N, my / N, mz / N]);
    const ox = panel.x + panel.w / 2 + (com[0] - view.cx) * view.scale;
    const oy = panel.y + panel.h / 2 + (com[1] - view.cy) * view.scale;
    const rr = shown.rg * view.scale;
    ctx.setLineDash([2, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(106,212,231,0.5)";
    ctx.beginPath(); ctx.arc(ox, oy, rr, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    rgLabel(ox + rr * 0.71 + 6, oy - rr * 0.71 - 4, "", " = " + shown.rg.toFixed(1), "rgba(106,212,231,0.95)");

    const paths = Array.from({ length: BUCKETS * LEVELS }, () => new Path2D());
    const depthRange = Math.max(x1 - x0, y1 - y0) / 2 || 1;
    const spin = time * 0.0004;
    for (let i = 0; i < M; i++) {
      const c = line[i], t = tang[i], nn = nrm[i], bb = cross(t, nn);
      const bucket = Math.round((i / (M - 1)) * (BUCKETS - 1));
      for (let k = 0; k < RING; k++) {
        const th = (2 * Math.PI * k) / RING + i * 0.45 + spin;
        const ct = Math.cos(th), st = Math.sin(th);
        const off = [nn[0] * ct + bb[0] * st, nn[1] * ct + bb[1] * st, nn[2] * ct + bb[2] * st];
        const w = rot([c[0] + TUBE * off[0], c[1] + TUBE * off[1], c[2] + TUBE * off[2]]);
        const facing = rot(off)[2];                    // +1 faces the viewer
        const depth = Math.max(-1, Math.min(1, w[2] / depthRange));
        const light = (0.55 + 0.45 * facing) * (0.72 + 0.28 * depth);
        const level = Math.max(0, Math.min(LEVELS - 1, Math.floor(light * LEVELS)));
        const size = 1.3 + 0.9 * (depth + 1) / 2;
        const sx = panel.x + panel.w / 2 + (w[0] - view.cx) * view.scale;
        const sy = panel.y + panel.h / 2 + (w[1] - view.cy) * view.scale;
        paths[bucket * LEVELS + level].rect(sx - size / 2, sy - size / 2, size, size);
      }
    }
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < BUCKETS; b++) {
      const [r, g, bl] = bucketColor[b];
      for (let l = 0; l < LEVELS; l++) {
        ctx.fillStyle = `rgba(${r},${g},${bl},${(0.24 + 0.25 * l).toFixed(2)})`;
        ctx.fill(paths[b * LEVELS + l]);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // Italic R with a subscript g, between optional prefix and suffix text.
  function rgLabel(x, y, prefix, suffix, color, center) {
    const big = "italic 14px 'Source Serif', Georgia, serif", small = "italic 10px 'Source Serif', Georgia, serif";
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.font = big;
    const wp = ctx.measureText(prefix).width, wr = ctx.measureText("R").width, ws = ctx.measureText(suffix).width;
    ctx.font = small;
    const wg = ctx.measureText("g").width;
    let cx = center ? x - (wp + wr + wg + ws) / 2 : x;
    ctx.font = big; ctx.fillText(prefix, cx, y); cx += wp; ctx.fillText("R", cx, y); cx += wr;
    ctx.font = small; ctx.fillText("g", cx, y + 3); cx += wg;
    ctx.font = big; ctx.fillText(suffix, cx, y);
  }

  function drawPlot(panel) {
    if (!shown.chain) return;
    const lx0 = Math.log10(QMIN), lx1 = Math.log10(QMAX);
    const X = (lq) => panel.x + ((lq - lx0) / (lx1 - lx0)) * panel.w;
    const Y = (lp) => panel.y + panel.h - ((lp - LOGP_MIN) / (LOGP_MAX - LOGP_MIN)) * panel.h;
    const mist = "rgba(158,163,200,";

    ctx.lineWidth = 1;
    ctx.strokeStyle = mist + "0.45)";
    ctx.beginPath();
    ctx.moveTo(panel.x, panel.y); ctx.lineTo(panel.x, panel.y + panel.h); ctx.lineTo(panel.x + panel.w, panel.y + panel.h);
    for (const d of [-2, -1, 0]) { const x = X(d); ctx.moveTo(x, panel.y + panel.h); ctx.lineTo(x, panel.y + panel.h + 5); }
    for (const d of [-2, -1, 0]) { const y = Y(d); ctx.moveTo(panel.x - 5, y); ctx.lineTo(panel.x, y); }
    ctx.stroke();

    ctx.fillStyle = mist + "0.9)";
    ctx.font = "italic 14px 'Source Serif', Georgia, serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "right";
    ctx.fillText("q", panel.x + panel.w, panel.y + panel.h + 20);
    ctx.textAlign = "left";
    ctx.fillText("I(q)", panel.x + 8, panel.y + 4);

    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x + 1, panel.y - 6, panel.w, panel.h + 5);
    ctx.clip();
    const curve = (arr) => { ctx.beginPath(); arr.forEach((lp, i) => { const x = X(Math.log10(qs[i])), y = Y(lp); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };

    // q = 1/R_g, following the chain above as it swells and shrinks.
    const lqg = Math.log10(1 / shown.rg);
    const f = Math.max(0, Math.min(NQ - 1.001, ((lqg - lx0) / (lx1 - lx0)) * (NQ - 1)));
    const j = Math.floor(f), lpg = shown.chain[j] + (shown.chain[j + 1] - shown.chain[j]) * (f - j);
    const xg = X(lqg);
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(106,212,231,0.6)";
    ctx.beginPath(); ctx.moveTo(xg, panel.y + panel.h); ctx.lineTo(xg, Y(lpg)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(106,212,231,0.85)";
    curve(shown.debye); ctx.stroke();
    ctx.setLineDash([]);

    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#f2c26b";
    ctx.shadowColor = "rgba(242,194,107,0.7)";
    ctx.shadowBlur = 10;
    curve(shown.chain); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Label each curve where they have parted.
    const i = qs.findIndex((q) => q >= 0.5);
    ctx.font = "600 13px 'Source Sans', 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#f2c26b";
    ctx.fillText("chain", X(Math.log10(qs[i])) + 6, Y(shown.chain[i]) - 8);
    ctx.fillStyle = "#6ad4e7";
    ctx.fillText("Debye", X(Math.log10(qs[i])) - 46, Y(shown.debye[i]) + 18);
    rgLabel(xg, panel.y + panel.h + 20, "1/", "", "rgba(106,212,231,0.95)", true);
  }

  function draw(time) {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const plotH = Math.max(120, H * 0.27);
    drawChain(time, { x: 6, y: 6, w: W - 12, h: H - plotH - 40 });
    drawPlot({ x: 34, y: H - plotH - 4, w: W - 52, h: plotH - 24 });
  }

  // ---- Animation ----
  let last = 0, sinceScatter = 1e9, running = true, raf = 0;
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    while (twists.length < TWISTS) twists.push(newTwist(now / 1000));
    twists = twists.filter((tw) => {
      const age = now / 1000 - tw.t0;
      if (age > tw.dur) return false;
      twist(tw.k, tw.amp * Math.sin((Math.PI * age) / tw.dur) * dt);
      return true;
    });
    sinceScatter += dt;
    if (sinceScatter > 0.1) { scattering(); sinceScatter = 0; }
    for (const key of ["chain", "debye"]) {
      for (let i = 0; i < NQ; i++) shown[key][i] += (target[key][i] - shown[key][i]) * 0.2;
    }
    shown.rg += (target.rg - shown.rg) * 0.2;
    draw(now);
    if (running) raf = requestAnimationFrame(frame);
  }

  document.querySelectorAll("[data-segments]").forEach((el) => { el.textContent = String(N - 1); });
  scattering();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw(performance.now()));
  resize();

  if (reduceMotion) return;
  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      running = entries[0].isIntersecting;
      if (running && !raf) { last = 0; raf = requestAnimationFrame(frame); }
    }).observe(canvas);
  }
  raf = requestAnimationFrame(frame);
})();
