/* ==========================================================================
   Anchor website behaviour. All copy and data come from content.js (window.ANCHOR).
   Works without GSAP/Lenis (CDN blocked or slow): they only add smoothing.
   ========================================================================== */
(() => {
  "use strict";
  const C = window.ANCHOR;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  // Like the Anchor app, the site animates whatever Windows' "Animation effects" says:
  // the people who switch that off are mostly tuning for speed. The header's motion
  // switch turns animation off for anyone who wants a still page (remembered per browser).
  const reduced = root.classList.contains("reduce-motion");
  const finePointer = matchMedia("(pointer: fine)").matches;
  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), C);
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.flat().forEach((k) => n.append(k));
    return n;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const repoApi = `https://api.github.com/repos/${C.repo.owner}/${C.repo.name}`;

  /* ---------------- static copy and links ---------------- */
  $$("[data-c]").forEach((n) => { n.textContent = get(n.dataset.c) ?? ""; });
  $$("[data-gh-link]").forEach((a) => { a.href = C.links.github; a.target = "_blank"; a.rel = "noopener"; });
  $$("[data-link]").forEach((a) => { a.href = C.links[a.dataset.link]; a.target = "_blank"; a.rel = "noopener"; });

  /* ---------------- seasonal mark (same dates as the app) ---------------- */
  // Halloween only for now, matching ACTIVE in app/main/services/season.js.
  (() => {
    const d = new Date(), n = (d.getMonth() + 1) * 100 + d.getDate();
    if (n >= 1024 && n <= 1101) {
      $$('img[src$="anchor-mark.svg"]').forEach((img) => { img.src = "assets/anchor-mark-halloween.svg"; });
    }
  })();

  /* ---------------- the ocean: light shafts and marine snow ---------------- */
  // The page's focal motion. Particles drift slowly; scrolling down sends them
  // rushing up past you, so scrolling feels like sinking. Light shafts sway near
  // the surface and fade with depth; orange specks glow near the seabed.
  const ocean = (() => {
    const cv = $(".ocean"), api = { depth: 0, kick() {} };
    if (!cv) return api;
    const g = cv.getContext("2d");
    let W = 0, H = 0, dpr = 1, vel = 0, running = false;
    const parts = Array.from({ length: innerWidth < 720 ? 55 : 130 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75, s: Math.random() * 6.28, glow: Math.random() < 0.2,
    }));
    function size() {
      dpr = Math.min(1.5, devicePixelRatio || 1);   // soft specks need no more, and it halves raster cost on 4K
      W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
    }
    function frame(ts) {
      vel *= 0.9;
      const d = api.depth;
      g.clearRect(0, 0, W, H);
      g.globalCompositeOperation = "lighter";
      // light shafts from the surface
      const rayA = Math.max(0, 1 - d / 0.4) * 0.11;
      if (rayA > 0.002) {
        for (let i = 0; i < 5; i++) {
          const x = W * (0.1 + 0.2 * i) + Math.sin(ts / 5200 + i * 1.7) * 50 * dpr, w = (90 + i * 23 % 70) * dpr;
          g.save(); g.translate(x, -40 * dpr); g.rotate(0.22 + Math.sin(ts / 7400 + i) * 0.035);
          const lg = g.createLinearGradient(0, 0, 0, H * 0.95);
          lg.addColorStop(0, `rgba(235,245,255,${rayA * 0.45 * (0.6 + 0.4 * Math.sin(ts / 3100 + i * 2.1))})`);
          lg.addColorStop(1, "rgba(235,245,255,0)");
          g.fillStyle = lg;
          for (const k of [1, 0.62, 0.3]) g.fillRect((-w * k) / 2, 0, w * k, H * 0.95);   // stacked widths feather the edges
          g.restore();
        }
      }
      // marine snow
      const glowA = Math.max(0, (d - 0.55) / 0.45);
      for (const p of parts) {
        p.y += 0.00018 * p.z - (vel * p.z * 0.6) / innerHeight;   // slow sink, plus parallax against the scroll
        p.x += Math.sin(ts / 2600 + p.s) * 0.00008 * p.z;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } else if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
        const x = p.x * W, y = p.y * H, r = (0.5 + p.z * 1.5) * dpr;
        if (p.glow && glowA > 0) {
          const a = glowA * (0.35 + 0.35 * Math.sin(ts / 900 + p.s * 3));
          g.fillStyle = `rgba(255,122,51,${a})`;
          g.beginPath(); g.arc(x, y, r * 1.6, 0, 6.28); g.fill();
        } else {
          const a = 0.08 + 0.3 * p.z;
          const streak = Math.min(34, Math.abs(vel) * p.z * 0.7) * dpr;
          g.fillStyle = `rgba(230,238,248,${a})`;
          g.strokeStyle = `rgba(230,238,248,${a * 0.55})`;   // streaks stay fainter than the specks
          if (streak > 3) { g.lineWidth = r; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + streak * Math.sign(vel)); g.stroke(); }
          else { g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); }
        }
      }
      g.globalCompositeOperation = "source-over";
      if (running) requestAnimationFrame(frame);
    }
    function play() { if (running || document.hidden) return; running = true; requestAnimationFrame(frame); }
    size();
    addEventListener("resize", size);
    if (reduced) { requestAnimationFrame(frame); return api; }   // one still frame
    document.addEventListener("visibilitychange", () => { if (document.hidden) running = false; else play(); });
    play();
    // jump scrolls (links, the drop) give a nudge, not a storm
    api.kick = (dy) => { vel = Math.max(-45, Math.min(45, vel + Math.max(-60, Math.min(60, dy)) * 0.35)); };
    return api;
  })();

  /* ---------------- depth: gauge, chain, background ---------------- */
  const stops = C.depths;
  const sections = stops.map((s) => document.getElementById(s.id));
  // page colour from surface to seabed (depth 0 → 1)
  const palette = [[0, [58, 106, 135]], [0.1, [36, 70, 94]], [0.3, [22, 40, 58]], [0.5, [16, 28, 44]], [0.7, [11, 20, 34]], [0.85, [8, 15, 26]], [1, [5, 8, 15]]];
  const mix = (t) => {
    let i = 0;
    while (i < palette.length - 2 && t > palette[i + 1][0]) i++;
    const [a, ca] = palette[i], [b, cb] = palette[i + 1];
    const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return `rgb(${ca.map((v, j) => Math.round(v + (cb[j] - v) * k)).join(",")})`;
  };

  const gauge = $(".gauge"), now = $(".gauge__now"), marks = $(".gauge__marks");
  stops.forEach((s) => {
    marks.append(el("li", { style: `top:${(s.m / 1000) * 100}%` },
      el("a", { href: `#${s.id}`, innerHTML: `<span class="name">${s.name}</span> <span class="num">${s.m.toLocaleString("en")} m</span>` })));
  });
  const markLinks = $$("a", marks);
  const rope = $(".chain__rope"), chainAnchor = $(".chain__anchor");
  let tops = [], docMax = 1, movingTimer, depthM = 0;

  function measure() {
    tops = sections.map((s) => s.getBoundingClientRect().top + scrollY);
    docMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  }
  let lastY = scrollY, shownM = -1, shownMark = -1;
  const progressBar = $(".progress span");
  function onScroll() {
    const y = scrollY, p = Math.min(1, y / docMax);
    ocean.kick(y - lastY); lastY = y;
    root.classList.toggle("scrolled", y > innerHeight * 0.55);
    // depth interpolates between section tops (measured at 40% of the viewport)
    const probe = y + innerHeight * 0.4;
    let i = 0;
    while (i < tops.length - 1 && probe >= tops[i + 1]) i++;
    const next = Math.min(i + 1, tops.length - 1);
    const span = tops[next] - tops[i] || 1;
    const k = i === next ? 0 : Math.min(1, Math.max(0, (probe - tops[i]) / span));
    depthM = p > 0.995 ? 1000 : Math.round(stops[i].m + (stops[next].m - stops[i].m) * k);
    const t = depthM / 1000;
    // page-wide colour only changes when the depth moves a couple of metres
    if (Math.abs(depthM - shownM) >= 2 || depthM === 0 || depthM === 1000) {
      shownM = depthM;
      root.style.setProperty("--bg", mix(t));
      root.style.setProperty("--depth", t.toFixed(3));
      gauge.style.setProperty("--gauge-p", t);
      now.value = `${depthM.toLocaleString("en")} m`;
    }
    ocean.depth = t;
    progressBar.style.setProperty("--p", p.toFixed(4));
    if (i !== shownMark) { shownMark = i; markLinks.forEach((a, j) => a.setAttribute("aria-current", j === i ? "true" : "false")); }
    const h = Math.max(0, p * (innerHeight - 72 - 44));
    rope.setAttribute("height", h);
    chainAnchor.style.setProperty("--chain-y", `${h}px`);
    gauge.classList.add("is-moving");
    clearTimeout(movingTimer);
    movingTimer = setTimeout(() => gauge.classList.remove("is-moving"), 1400);
    sound.depth(t);
  }

  /* ---------------- smooth scroll (Lenis) ---------------- */
  let lenis = null;
  function scrollToEl(target) {
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("href").length < 2) return;
    const target = document.getElementById(a.getAttribute("href").slice(1));
    if (!target) return;
    e.preventDefault();
    scrollToEl(target);
  });

  /* ---------------- 0 m: junk and the drop ---------------- */
  const junk = $(".junk"), surface = $("#surface"), plunge = $(".plunge");
  // Free-form app icons for the fake junk apps: each gets its own silhouette
  // (cloud, flower, cog, blob) and a glyph drawn in one line style.
  const SHAPES = {
    cloud: '<circle cx="22" cy="22" r="15"/><circle cx="42" cy="22" r="15"/><circle cx="22" cy="42" r="15"/><circle cx="42" cy="42" r="15"/><rect x="18" y="18" width="28" height="28"/>',
    flower8: Array.from({ length: 8 }, (_, i) => `<circle cx="${(32 + 17 * Math.cos(i * Math.PI / 4)).toFixed(1)}" cy="${(32 + 17 * Math.sin(i * Math.PI / 4)).toFixed(1)}" r="11"/>`).join("") + '<circle cx="32" cy="32" r="20"/>',
    flower6: Array.from({ length: 6 }, (_, i) => `<circle cx="${(32 + 16 * Math.cos(i * Math.PI / 3 - Math.PI / 2)).toFixed(1)}" cy="${(32 + 16 * Math.sin(i * Math.PI / 3 - Math.PI / 2)).toFixed(1)}" r="13"/>`).join("") + '<circle cx="32" cy="32" r="18"/>',
    cog: (() => {
      const pts = [];
      for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2, r = i % 2 ? 24 : 29.5; pts.push(`${(32 + r * Math.cos(a)).toFixed(1)},${(32 + r * Math.sin(a)).toFixed(1)}`); }
      return `<polygon points="${pts.join(" ")}" stroke-width="5" stroke-linejoin="round"/>`;
    })(),
    blob: '<path d="M33 3c11 0 22 6 26 17s1 24-7 32-21 11-31 7S3 46 3 34 9 9 19 5c4-1.5 9-2 14-2z"/>',
  };
  const GLYPHS = {
    gamepad: '<path d="M21 25h22a9 9 0 0 1 9 9v2.5a6.5 6.5 0 0 1-11.6 4L37 37H27l-3.4 3.5A6.5 6.5 0 0 1 12 36.5V34a9 9 0 0 1 9-9z"/><path d="M22 30.5v7M18.5 34h7"/><circle cx="39.5" cy="32" r="1.6" fill="#fff" stroke="none"/><circle cx="44" cy="35.5" r="1.6" fill="#fff" stroke="none"/>',
    rocket: '<path d="M32 14c6.5 4.5 9.5 11.5 9.5 19l-4 6.5h-11l-4-6.5c0-7.5 3-14.5 9.5-19z"/><circle cx="32" cy="28" r="3.2"/><path d="M26.5 39.5 22 45M37.5 39.5 42 45M29.5 44.5q2.5 5.5 2.5 5.5t2.5-5.5"/>',
    sync: '<path d="M21.5 30a11 11 0 0 1 19.5-6.5l3 3"/><path d="M44 20.5v6.5h-6.5"/><path d="M42.5 34a11 11 0 0 1-19.5 6.5l-3-3"/><path d="M20 43.5V37h6.5"/>',
    terminal: '<path d="M22 24.5l7.5 7.5-7.5 7.5"/><path d="M33 40.5h10"/>',
    update: '<path d="M32 17v19"/><path d="M24.5 29.5 32 37l7.5-7.5"/><path d="M19.5 41v3.5a3.5 3.5 0 0 0 3.5 3.5h18a3.5 3.5 0 0 0 3.5-3.5V41"/>',
  };
  const ICONS = {
    gamepad: { shape: "cloud", from: "#8B6CFF", to: "#4B2BD6" },
    rocket: { shape: "flower8", from: "#FF6FA3", to: "#E2366B" },
    sync: { shape: "blob", from: "#3FD3C1", to: "#0F8E9E" },
    terminal: { shape: "cog", from: "#6E7B8F", to: "#2D3646" },
    update: { shape: "flower6", from: "#5AA9FF", to: "#2563EB" },
  };
  function iconSvg(name, badge, id) {
    const ic = ICONS[name];
    return `<svg class="junk__icon" viewBox="0 0 64 64" aria-hidden="true"><defs>
      <linearGradient id="jg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ic.from}"/><stop offset="1" stop-color="${ic.to}"/></linearGradient>
      <radialGradient id="jh${id}" cx=".3" cy=".22" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <clipPath id="jc${id}">${SHAPES[ic.shape]}</clipPath></defs>
      <g fill="url(#jg${id})" stroke="url(#jg${id})">${SHAPES[ic.shape]}</g>
      <rect width="64" height="64" fill="url(#jh${id})" clip-path="url(#jc${id})"/>
      <g fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[name]}</g>
      ${badge ? `<circle cx="52" cy="12" r="9" fill="#E5322D" stroke="#fff" stroke-width="2"/><text x="52" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Segoe UI, system-ui, sans-serif">${badge}</text>` : ""}
    </svg>`;
  }

  // Junk is placed by measuring: never over the headline, copy, buttons, header
  // or depth gauge, and never over another piece. A piece that doesn't fit is hidden.
  const junkItems = C.hero.junk.map((j, idx) => {
    const n = el("div", { className: `junk__item junk__${j.kind}` });
    if (j.kind === "toast") n.append(el("b", { textContent: j.text }), j.detail);
    else if (j.kind === "scare") n.append(j.text, el("small", { textContent: j.detail }));
    else if (j.kind === "tile" && j.icon) { n.innerHTML = iconSvg(j.icon, j.badge, idx); n.append(el("span", { textContent: j.text })); }
    else n.textContent = j.text;
    junk.append(n);
    return n;
  });
  function layoutJunk() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const box = surface.getBoundingClientRect(), W = box.width, H = box.height;
    const DRIFT = 22;   // room for the idle bob and a nudge
    const rel = (r, pad) => ({ x0: r.left - box.left - pad, y0: r.top - box.top - pad, x1: r.right - box.left + pad, y1: r.bottom - box.top + pad });
    const blocked = $$(".surface__title, .surface__sub, .surface__cta").map((n) => rel(n.getBoundingClientRect(), 28));
    blocked.push({ x0: 0, y0: 0, x1: W, y1: 84 });                               // header
    if (innerWidth > 900) blocked.push({ x0: W - 190, y0: 0, x1: W, y1: H });   // depth gauge
    const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
    const placed = [];
    junkItems.forEach((n) => {
      n.hidden = false;
      n.style.cssText = "";
      const w = n.offsetWidth, h = n.offsetHeight;
      let spot = null;
      for (let t = 0; t < 120 && !spot; t++) {
        const x = 12 + rnd() * Math.max(0, W - w - 24), y = 88 + rnd() * Math.max(0, H - h - 104);
        const r = { x0: x - DRIFT, y0: y - DRIFT, x1: x + w + DRIFT, y1: y + h + DRIFT };
        if (!blocked.some((b) => hit(r, b)) && !placed.some((p) => hit(r, p))) spot = { x, y, r };
      }
      if (!spot) { n.hidden = true; return; }
      placed.push(spot.r);
      n.style.cssText = `--x:${spot.x.toFixed(0)}px;--y:${spot.y.toFixed(0)}px`;
    });
    physics.reset();
  }

  /* Junk physics: every visible piece is a body on a spring anchored at its spot.
     It bobs gently; the cursor pushes pieces away and the one under it lifts;
     pieces can be grabbed and flung; they shove each other apart instead of
     overlapping; on "Drop anchor" they sink under gravity, tumbling. */
  const physics = (() => {
    let bodies = [], running = false, sinking = false, last = 0, t = 0;
    let px = -1e4, py = -1e4, held = null;
    const K = 26, DAMP = 6.5, REPEL_R = 170, REPEL = 5200, GRAV = 2200;
    function reset() {
      sinking = false; held = null;
      bodies = junkItems.filter((n) => !n.hidden).map((n, i) => {
        const prev = bodies.find((b) => b.el === n);
        return {
          el: n, rx: n.offsetLeft, ry: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight,
          x: prev ? prev.x : 0, y: prev ? prev.y : 0, vx: 0, vy: 0, rot: (i % 5) - 2, vr: 0, base: (i % 5) - 2,
          s: 1, phase: i * 1.7, op: 1,
        };
      });
      bodies.forEach((b) => { b.el.style.opacity = ""; draw(b); });
      if (!reduced) start();
    }
    const draw = (b) => { b.el.style.transform = `translate3d(${b.x.toFixed(2)}px,${b.y.toFixed(2)}px,0) rotate(${b.rot.toFixed(2)}deg) scale(${b.s.toFixed(3)})`; };
    function step(now) {
      const dt = Math.min(1 / 30, (now - last) / 1000 || 0); last = now; t += dt;
      const box = surface.getBoundingClientRect(), mx = px - box.left, my = py - box.top;
      for (const b of bodies) {
        const cx = b.rx + b.x + b.w / 2, cy = b.ry + b.y + b.h / 2;
        let ax = 0, ay = 0;
        if (sinking) {
          ay = GRAV * (0.6 + (b.phase % 1)); ax = -b.vx * 0.6; b.vr += (b.phase % 2 > 1 ? 120 : -120) * dt;
          b.op = Math.max(0, b.op - dt * 0.9); b.el.style.opacity = b.op.toFixed(3);
        } else if (b === held) {
          const tx = mx - b.gx - b.rx, ty = my - b.gy - b.ry;
          b.vx = (tx - b.x) / Math.max(dt, 0.001); b.vy = (ty - b.y) / Math.max(dt, 0.001);
          b.x = tx; b.y = ty;
        } else {
          // spring home to a slowly bobbing anchor
          const hx = Math.sin(t * 0.7 + b.phase) * 9, hy = Math.cos(t * 0.55 + b.phase) * 7;
          ax = -K * (b.x - hx) - DAMP * b.vx;
          ay = -K * (b.y - hy) - DAMP * b.vy;
          // the cursor pushes pieces away
          const dx = cx - mx, dy = cy - my, d = Math.hypot(dx, dy) || 1;
          if (d < REPEL_R) { const f = REPEL * (1 - d / REPEL_R) ** 2; ax += (dx / d) * f; ay += (dy / d) * f; }
        }
        if (b !== held) { b.vx += ax * dt; b.vy += ay * dt; b.x += b.vx * dt; b.y += b.vy * dt; }
        // lean into the motion, settle back to a resting tilt
        if (!sinking) b.vr += (-(b.rot - (b.base + b.vx * 0.02)) * 30 - b.vr * 7) * dt;
        b.rot += b.vr * dt;
        const over = mx > b.rx + b.x && mx < b.rx + b.x + b.w && my > b.ry + b.y && my < b.ry + b.y + b.h;
        b.s += (((over || b === held) && !sinking ? 1.08 : 1) - b.s) * Math.min(1, dt * 12);
      }
      // pieces shove each other apart (soft circles)
      if (!sinking) for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], c = bodies[j];
        const dx = (c.rx + c.x + c.w / 2) - (a.rx + a.x + a.w / 2), dy = (c.ry + c.y + c.h / 2) - (a.ry + a.y + a.h / 2);
        const min = (Math.max(a.w, a.h) + Math.max(c.w, c.h)) * 0.38, d = Math.hypot(dx, dy) || 1;
        if (d < min) {
          const push = (min - d) * 0.5, ux = dx / d, uy = dy / d;
          if (a !== held) { a.x -= ux * push; a.y -= uy * push; a.vx -= ux * push * 8; a.vy -= uy * push * 8; }
          if (c !== held) { c.x += ux * push; c.y += uy * push; c.vx += ux * push * 8; c.vy += uy * push * 8; }
        }
      }
      bodies.forEach(draw);
      if (sinking && bodies.every((b) => b.op <= 0)) running = false;
      if (running) requestAnimationFrame(step);
    }
    function start() { if (!running && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(step); } }
    addEventListener("pointermove", (e) => { px = e.clientX; py = e.clientY; }, { passive: true });
    document.addEventListener("pointerleave", () => { px = py = -1e4; });
    junk.addEventListener("pointerdown", (e) => {
      const b = bodies.find((k) => k.el.contains(e.target));
      if (!b || reduced || sinking) return;
      const box = surface.getBoundingClientRect();
      held = b; b.gx = e.clientX - box.left - b.rx - b.x; b.gy = e.clientY - box.top - b.ry - b.y;
      px = e.clientX; py = e.clientY;
      b.el.setPointerCapture(e.pointerId); b.el.classList.add("is-held");
      e.preventDefault();
    });
    const release = () => { if (held) { held.el.classList.remove("is-held"); held = null; } };
    addEventListener("pointerup", release); addEventListener("pointercancel", release);
    if (!reduced) {
      new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else running = sinking ? running : false; }).observe(surface);
      document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
    }
    return {
      reset,
      sink() {
        if (reduced) { junk.classList.add("is-sinking"); return; }
        sinking = true; held = null;
        bodies.forEach((b) => { b.vx = (Math.random() - 0.5) * 300; b.vy = -120 - Math.random() * 160; });
        start();
      },
      surface() { junk.classList.remove("is-sinking"); reset(); },
    };
  })();

  layoutJunk();
  document.fonts?.ready.then(layoutJunk);
  let junkTimer;
  addEventListener("resize", () => { clearTimeout(junkTimer); junkTimer = setTimeout(layoutJunk, 150); });

  let dropping = false;
  async function drop() {
    if (dropping) return;
    dropping = true;
    if (!reduced) {
      plunge.style.opacity = "1";
      plunge.animate(
        [{ transform: "translate(-50%, 0) rotate(-6deg)" }, { transform: `translate(-50%, ${innerHeight * 1.6}px) rotate(4deg)` }],
        { duration: 1150, easing: "cubic-bezier(.55,0,.75,.2)", fill: "forwards" }
      );
      surface.animate([{ transform: "translateY(0)" }, { transform: "translateY(5px)" }, { transform: "translateY(0)" }], { duration: 300, delay: 420 });
    }
    physics.sink();
    surface.classList.add("is-calm");
    await sleep(reduced ? 0 : 1100);
    plunge.style.opacity = "0";
    scrollToEl($("#drag"));
    dropping = false;
  }
  async function replayDrop() {
    physics.surface();
    surface.classList.remove("is-calm");
    plunge.getAnimations().forEach((a) => a.cancel());
    if (lenis) lenis.scrollTo(0, { immediate: true }); else scrollTo(0, 0);
    await sleep(reduced ? 0 : 1300);
    drop();
  }
  $("[data-drop]").addEventListener("click", drop);

  /* ---------------- 100 m: bloat simulator ---------------- */
  const sim = C.drag, simState = Object.fromEntries(sim.items.map((i) => [i.id, i.on]));
  const totals = () => sim.items.reduce((t, i) => simState[i.id] ? { boot: t.boot + i.boot, ram: t.ram + i.ram, cpu: t.cpu + i.cpu } : t, { ...sim.base });
  const maxBoot = sim.items.reduce((s, i) => s + i.boot, sim.base.boot);
  const simEls = Object.fromEntries($$("[data-sim]").map((n) => [n.dataset.sim, n]));
  $(".sim__items").append(...sim.items.map((i) => {
    const sw = el("button", { className: "switch", type: "button", role: "switch", ariaLabel: i.name });
    sw.setAttribute("aria-checked", String(i.on));
    sw.addEventListener("click", () => {
      simState[i.id] = !simState[i.id];
      sw.setAttribute("aria-checked", String(simState[i.id]));
      renderSim();
    });
    return el("li", { className: "toggle-row" }, el("div", {}, el("b", { textContent: i.name }), el("span", { textContent: i.detail })), sw);
  }));
  const shown = { boot: 0, ram: 0, cpu: 0 };
  function tweenNumber(key, to, decimals) {
    const from = shown[key], start = performance.now(), dur = reduced ? 0 : 500;
    const step = (t) => {
      const k = dur ? Math.min(1, (t - start) / dur) : 1;
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      simEls[key].textContent = v.toFixed(decimals);
      if (k < 1) requestAnimationFrame(step); else shown[key] = to;
    };
    requestAnimationFrame(step);
  }
  function renderSim() {
    const t = totals();
    tweenNumber("boot", t.boot, 0);
    tweenNumber("ram", t.ram, 1);
    tweenNumber("cpu", t.cpu, 0);
    simEls.bootbar.style.setProperty("--w", (t.boot / maxBoot).toFixed(3));
    simEls.rambar.style.setProperty("--w", Math.min(1, t.ram / 8).toFixed(3));
  }
  renderSim();
  simEls.replay.addEventListener("click", async () => {
    const t = totals(), bar = simEls.bootbar, btn = simEls.replay;
    btn.disabled = true;
    bar.style.transition = "none";
    bar.style.setProperty("--w", 0);
    await sleep(30);
    const dur = reduced ? 0 : t.boot * 55;
    bar.style.transition = `transform ${dur}ms linear`;
    bar.style.setProperty("--w", (t.boot / maxBoot).toFixed(3));
    const start = performance.now();
    const count = () => {
      const k = dur ? Math.min(1, (performance.now() - start) / dur) : 1;
      simEls.boot.textContent = Math.round(t.boot * k);
      if (k < 1) requestAnimationFrame(count); else { bar.style.transition = ""; btn.disabled = false; }
    };
    requestAnimationFrame(count);
  });
  // CPU trace: only drawn while the simulator is on screen
  (() => {
    const cv = simEls.graph, ctx = cv.getContext("2d"), pts = [];
    let running = false, last = 0;
    const draw = (ts) => {
      if (!running) return;
      if (ts - last > 90) {
        last = ts;
        const target = totals().cpu;
        const prev = pts.length ? pts[pts.length - 1] : target;
        pts.push(Math.max(1, Math.min(100, prev + (target - prev) * 0.3 + (Math.random() - 0.5) * target * 0.5)));
        if (pts.length > 80) pts.shift();
        const w = (cv.width = cv.clientWidth * devicePixelRatio), h = (cv.height = 72 * devicePixelRatio);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(169,180,198,.15)"; ctx.lineWidth = 1;
        for (let g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(0, (h * g) / 4); ctx.lineTo(w, (h * g) / 4); ctx.stroke(); }
        ctx.beginPath();
        pts.forEach((v, i2) => { const x = (i2 / 79) * w, y = h - (v / 60) * h; i2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.strokeStyle = "#FF5A1F"; ctx.lineWidth = 2 * devicePixelRatio; ctx.stroke();
        ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
        ctx.fillStyle = "rgba(255,90,31,.12)"; ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    new IntersectionObserver(([e]) => {
      running = e.isIntersecting && !reduced;
      if (running) requestAnimationFrame(draw);
      else if (reduced && e.isIntersecting) { pts.length = 0; for (let i = 0; i < 80; i++) pts.push(totals().cpu); running = true; draw(1e9); running = false; }
    }).observe(cv);
  })();

  /* ---------------- 300 m: instrument modules ---------------- */
  $(".modules").append(...C.cut.modules.map((m) => {
    const sw = el("button", { className: "switch", type: "button", role: "switch", ariaLabel: `Show ${m.name} after Anchor` });
    sw.setAttribute("aria-checked", "false");
    const from = el("span", { className: "from", textContent: m.before });
    const to = el("span", { className: "to", textContent: m.before });
    const card = el("article", { className: "module" },
      el("div", { className: "module__head" }, el("h3", { textContent: m.name }), sw),
      el("div", { className: "module__dial" },
        el("div", { className: "module__value", ariaLive: "polite" }, from, to),
        el("div", { className: "module__unit", textContent: m.unit }),
        el("div", { className: "module__ticks", style: "--fill:35%" })),
      el("p", { textContent: m.what }),
      el("code", { textContent: m.path }));
    sw.addEventListener("click", () => {
      const on = sw.getAttribute("aria-checked") !== "true";
      sw.setAttribute("aria-checked", String(on));
      card.classList.toggle("is-on", on);
      countTo(to, on ? m.after : m.before);
      $(".module__ticks", card).style.setProperty("--fill", on ? "88%" : "35%");
    });
    return card;
  }));
  $(".safety__lines").append(...C.cut.safety.lines.map((l) => {
    const li = el("li");
    l.split(/(app\/main\/services\/)/).forEach((part) => li.append(part === "app/main/services/" ? el("code", { textContent: part }) : part));
    return li;
  }));

  /* ---------------- 500 m: demo window ---------------- */
  const D = C.demo, win = $(".win"), page = $(".win__page"), log = $(".win__log"), nav = $(".win__nav");
  const demoState = {
    cleanup: D.cleanup.map((i) => ({ ...i })), performance: D.performance.map((i) => ({ ...i })),
    startup: D.startup.map((i) => ({ ...i })), debloat: D.debloat.map((i) => ({ ...i })),
  };
  let logBusy = Promise.resolve();
  function say(lines) {
    logBusy = logBusy.then(async () => {
      for (const line of lines) {
        const row = el("div");
        log.append(row);
        const [text, done] = line.split("|");
        row.textContent = text;
        log.scrollTop = log.scrollHeight;
        await sleep(reduced ? 0 : 260 + Math.random() * 380);
        if (done !== undefined) row.append(" ", el("span", { className: "ok", textContent: done || "done" }));
      }
    });
    return logBusy;
  }
  const appBtn = (label, onClick, primary) => {
    const b = el("button", { className: `app-btn${primary ? " app-btn--primary" : ""}`, type: "button", textContent: label });
    b.addEventListener("click", onClick);
    return b;
  };
  const switchRow = (item, sub, list) => {
    const sw = el("button", { className: "switch", type: "button", role: "switch", ariaLabel: item.name });
    sw.setAttribute("aria-checked", String(item.on));
    sw.addEventListener("click", () => { item.on = !item.on; sw.setAttribute("aria-checked", String(item.on)); });
    return el("div", { className: "app-row" }, el("div", {}, item.name, sub ? el("small", { textContent: sub }) : ""), sw);
  };
  const ring = (v, label) => { const r = el("div", { className: "ring", style: `--v:${v}` }); r.dataset.label = label; return r; };
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const pages = {
    home: () => [
      el("h4", { textContent: `${greeting}! Welcome to Anchor.` }),
      el("p", { className: "muted", textContent: "Run a Health Check to see how your PC is doing." }),
      el("div", { className: "app-btns" },
        appBtn("Boost now", () => say(["Creating restore point…|", "Clearing temporary files…|", "Clearing Windows Update downloads…|", "Clearing crash dumps and error reports…|", "Boost finished. 26.4 GB cleared (demo).|"]), true),
        appBtn("Health Check", () => say(["Running 7 checks in parallel…", "Windows build…|ok", "Pending updates…|none", "Drive health…|healthy", "Disk space…|ok", "Device Manager faults…|none", "CPU, memory and disk pressure…|normal"]))),
      el("p", { className: "app-h", textContent: "Game Releases" }),
      el("div", { className: "rail" }, D.releases.map((r) => el("div", { className: "cover", style: `--h:${r.hue}` }, el("b", { textContent: r.title }), el("span", { innerHTML: `${r.day}<small>${r.mon}</small>` })))),
    ],
    spotlight: () => [
      el("h4", { textContent: "Tech Spotlight" }),
      el("p", { className: "muted", textContent: "Latest tech news and videos via public feeds, no accounts, no tracking." }),
      el("div", { className: "app-list" }, ["Example headline from a public RSS feed", "Another story, opened in your browser", "Videos from YouTube channels, in their own tab"].map((t) => el("div", { className: "app-row" }, el("div", {}, t, el("small", { textContent: "Example · 2h ago" })), ""))),
    ],
    update: () => [
      el("h4", { textContent: "Windows Update" }),
      el("p", { className: "muted", textContent: "Windows 11 24H2 · example build" }),
      el("div", { className: "app-btns" }, appBtn("Check for updates", () => say(["Asking Windows Update…|", "No updates pending.|"]), true)),
    ],
    cleanup: () => [
      el("h4", { textContent: "Cleanup" }),
      el("p", { className: "muted", textContent: "Choose what to clear. Nothing in Documents, Desktop or Downloads is touched." }),
      el("div", { className: "app-list" }, demoState.cleanup.map((i) => switchRow(i, i.size))),
      el("div", { className: "app-foot" }, appBtn("Apply", () => {
        const on = demoState.cleanup.filter((i) => i.on);
        say(on.length ? ["Creating restore point…|", ...on.map((i) => `Clearing ${i.name.toLowerCase()} (${i.size})…|`)] : ["Nothing selected."]);
      }, true)),
    ],
    performance: () => [
      el("h4", { textContent: "Performance" }),
      el("p", { className: "muted", textContent: "Game & App Boost. Each tweak names the value it changes, and switches back." }),
      el("div", { className: "app-list" }, demoState.performance.map((i) => switchRow(i, i.value))),
      el("div", { className: "app-foot" }, appBtn("Apply", () => {
        const on = demoState.performance.filter((i) => i.on);
        say(on.length ? ["Creating restore point…|", ...on.map((i) => `Setting ${i.value}…|`)] : ["No tweaks switched on."]);
      }, true)),
    ],
    startup: () => [
      el("h4", { textContent: "Startup" }),
      el("p", { className: "muted", textContent: "Everything that starts with Windows. Switch off what you don’t need." }),
      el("div", { className: "app-list" }, demoState.startup.map((i) => switchRow(i, `Startup impact: ${i.impact}`))),
      el("div", { className: "app-foot" }, appBtn("Apply", () => {
        const off = demoState.startup.filter((i) => !i.on);
        say(off.length ? [`Disabling ${off.length} startup item${off.length === 1 ? "" : "s"}…|`, ...off.map((i) => `  ${i.name}|off`)] : ["Every startup item is still on."]);
      }, true)),
    ],
    debloat: () => [
      el("h4", { textContent: "Debloat" }),
      el("p", { className: "muted", textContent: "Privacy and telemetry. Every toggle shows the registry value it sets." }),
      el("div", { className: "app-list" }, demoState.debloat.map((i) => switchRow(i, i.value))),
      el("div", { className: "app-foot" }, appBtn("Apply", () => {
        const on = demoState.debloat.filter((i) => i.on);
        say(on.length ? ["Creating restore point…|", ...on.map((i) => `Setting ${i.value}…|`)] : ["No privacy toggles switched on."]);
      }, true)),
    ],
    system: () => [
      el("h4", { textContent: "System" }),
      el("p", { className: "muted", textContent: "Drive health from S.M.A.R.T. data (example drives)." }),
      el("div", { className: "drives" },
        ring(68, "C: 68%"),
        ring(31, "D: 31%"),
        el("div", { className: "app-list", style: "flex:1;min-width:200px" },
          el("div", { className: "app-row" }, el("div", {}, "Samsung SSD (example)", el("small", { textContent: "Healthy · 41 °C · wear 3%" })), ""),
          el("div", { className: "app-row" }, el("div", {}, "Seagate HDD (example)", el("small", { textContent: "Healthy · 36 °C" })), ""))),
    ],
  };
  // pages slide over (out fast, in with a soft landing); the tab marker glides to the new tab
  let pageToken = 0;
  const ind = el("span", { className: "win__ind", ariaHidden: "true" });
  function moveIndicator() {
    const b = $('button[aria-current="page"]', nav);
    if (!b) return;
    const row = getComputedStyle(nav).display === "flex";
    ind.style.cssText = row
      ? `width:${b.offsetWidth}px;height:${b.offsetHeight}px;transform:translate(${b.offsetLeft}px,${b.offsetTop}px)`
      : `width:calc(100% - 16px);height:${b.offsetHeight}px;transform:translate(8px,${b.offsetTop}px)`;
  }
  function showPage(id, focus) {
    const tok = ++pageToken, swap = () => { if (tok === pageToken) page.replaceChildren(...pages[id]()); };
    $$("button", nav).forEach((b) => (b.dataset.page === id ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    moveIndicator();
    if (reduced || !page.childElementCount) swap();
    else page.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-10px)" }], { duration: 130, easing: "cubic-bezier(.4,0,1,1)" }).finished.then(() => {
      swap();
      if (tok === pageToken) page.animate([{ opacity: 0, transform: "translateX(14px)" }, { opacity: 1, transform: "none" }], { duration: 340, easing: "cubic-bezier(.16,1,.3,1)" });
    });
    if (focus) page.focus({ preventScroll: true });
  }
  D.nav.forEach((n) => {
    if (n.group) { nav.append(el("div", { className: "grp", textContent: n.group })); return; }
    const b = el("button", { type: "button", textContent: n.label });
    b.dataset.page = n.id;
    b.addEventListener("click", () => showPage(n.id, false));
    nav.append(b);
  });
  nav.prepend(ind);
  showPage("home");
  addEventListener("resize", moveIndicator);
  say(["Anchor demo ready. Nothing here touches your PC."]);

  // window controls
  const reopen = $('[data-win="open"]');
  $('[data-win="min"]').addEventListener("click", () => win.classList.toggle("is-min"));
  $('[data-win="close"]').addEventListener("click", () => { win.hidden = true; reopen.hidden = false; reopen.focus(); });
  reopen.addEventListener("click", () => { win.hidden = false; win.classList.remove("is-min"); reopen.hidden = true; win.style.setProperty("--wx", "0px"); win.style.setProperty("--wy", "0px"); });
  // drag by the title bar (desktop widths only)
  (() => {
    const bar = $("[data-drag-handle]");
    let sx, sy, ox = 0, oy = 0, active = false;
    bar.addEventListener("pointerdown", (e) => {
      if (innerWidth <= 720 || e.target.closest("button")) return;
      active = true; sx = e.clientX - ox; sy = e.clientY - oy;
      bar.setPointerCapture(e.pointerId); win.classList.add("is-dragging");
    });
    bar.addEventListener("pointermove", (e) => {
      if (!active) return;
      const dock = $(".dock").getBoundingClientRect(), w = win.offsetWidth;
      const limX = Math.max(0, (dock.width - w) / 2) + 120;
      ox = Math.max(-limX, Math.min(limX, e.clientX - sx));
      oy = Math.max(-80, Math.min(140, e.clientY - sy));
      win.style.setProperty("--wx", `${ox}px`); win.style.setProperty("--wy", `${oy}px`);
    });
    const end = () => { active = false; win.classList.remove("is-dragging"); };
    bar.addEventListener("pointerup", end); bar.addEventListener("pointercancel", end);
  })();

  /* ---------------- 700 m: the radar ---------------- */
  // A live sonar scope. The beam sweeps clockwise and leaves a fading phosphor
  // trail; faint background contacts drift; contributors light up and are
  // identified as the beam passes, then fade.
  const radar = (() => {
    const fig = $(".radar"), cv = $(".radar__scope", fig), list = $(".radar__contacts", fig);
    const brgEl = $("[data-brg]", fig), countEl = $("[data-contacts]", fig);
    const g = cv.getContext("2d"), still = document.createElement("canvas"), trail = document.createElement("canvas");
    const sg = still.getContext("2d"), tg = trail.getContext("2d");
    const PERIOD = 5200, TAU = Math.PI * 2;
    let S = 0, dpr = 1, contacts = [], running = false, lastBrg = -1;
    const t0 = performance.now();
    const ghosts = Array.from({ length: 8 }, () => ({ b: Math.random() * TAU, r: 0.2 + Math.random() * 0.7, v: (Math.random() - 0.5) * 0.0006 }));
    const pos = (b, r) => [S / 2 + Math.sin(b) * r * S * 0.42, S / 2 - Math.cos(b) * r * S * 0.42];

    function drawStill() {
      const c = S / 2, R = S * 0.42;
      sg.clearRect(0, 0, S, S);
      const bg = sg.createRadialGradient(c, c, 0, c, c, S / 2);
      bg.addColorStop(0, "#0d1d2a"); bg.addColorStop(0.75, "#081420"); bg.addColorStop(1, "#050b14");
      sg.fillStyle = bg; sg.beginPath(); sg.arc(c, c, S / 2, 0, TAU); sg.fill();
      sg.strokeStyle = "rgba(169,180,198,.16)"; sg.lineWidth = dpr;
      [0.25, 0.5, 0.75, 1].forEach((k) => { sg.beginPath(); sg.arc(c, c, R * k, 0, TAU); sg.stroke(); });
      sg.beginPath(); sg.moveTo(c - R, c); sg.lineTo(c + R, c); sg.moveTo(c, c - R); sg.lineTo(c, c + R); sg.stroke();
      sg.fillStyle = "rgba(169,180,198,.55)"; sg.font = `${11 * dpr}px "JetBrains Mono", monospace`;
      sg.textAlign = "left"; sg.textBaseline = "alphabetic";
      [250, 500, 750].forEach((m, i) => sg.fillText(`${m} m`, c + 4 * dpr, c - R * (i + 1) * 0.25 - 4 * dpr));
      // bearing ring: a tick every 5°, numbered every 30°
      for (let d = 0; d < 360; d += 5) {
        const a = (d * Math.PI) / 180, long = d % 30 === 0;
        const r0 = R + 4 * dpr, r1 = R + (long ? 12 : 7) * dpr;
        sg.strokeStyle = long ? "rgba(169,180,198,.5)" : "rgba(169,180,198,.22)";
        sg.beginPath(); sg.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0); sg.lineTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1); sg.stroke();
        if (long) {
          const rt = R + 22 * dpr;
          sg.fillStyle = "rgba(169,180,198,.6)"; sg.textAlign = "center"; sg.textBaseline = "middle";
          sg.fillText(String(d).padStart(3, "0"), c + Math.sin(a) * rt, c - Math.cos(a) * rt);
        }
      }
    }
    function size() {
      dpr = Math.min(2, devicePixelRatio || 1);
      S = Math.max(1, Math.round(fig.clientWidth * dpr));
      [cv, still, trail].forEach((k) => { k.width = k.height = S; });
      drawStill();
      if (!running) frame(performance.now());
    }
    function place() {
      list.replaceChildren(...contacts.map((c, i) => {
        // the maintainer sits north-east at mid range; others spiral out by the golden angle
        c.b = i === 0 ? 0.9 : (0.9 + i * 2.39996) % TAU;
        c.r = i === 0 ? 0.55 : 0.3 + ((i * 0.37) % 0.55);
        const li = el("li", { style: `--x:${50 + Math.sin(c.b) * c.r * 42}%;--y:${50 - Math.cos(c.b) * c.r * 42}%` },
          el("a", { href: c.url, target: "_blank", rel: "noopener", ariaLabel: `${c.login}, ${c.role}` },
            el("img", { src: c.avatar, alt: "", width: 38, height: 38, loading: "lazy" })),
          el("span", { className: "radar__label", ariaHidden: "true" }, c.login, el("small", { textContent: c.role })));
        c.el = li; c.lit = -1;
        return li;
      }));
      countEl.textContent = `${contacts.length} CONTACT${contacts.length === 1 ? "" : "S"}`;
      if (reduced) contacts.forEach((c) => c.el.style.setProperty("--lit", 1));
    }
    function frame(now) {
      if (!S) return;
      const beam = (((now - t0) % PERIOD) / PERIOD) * TAU, c = S / 2, R = S * 0.42;
      // phosphor: fade the trail a little each frame, then paint the beam's leading edge
      tg.globalCompositeOperation = "destination-out";
      tg.fillStyle = "rgba(0,0,0,0.045)"; tg.fillRect(0, 0, S, S);
      tg.globalCompositeOperation = "lighter";
      tg.fillStyle = "rgba(255,90,31,0.10)";
      tg.beginPath(); tg.moveTo(c, c); tg.arc(c, c, R, beam - Math.PI / 2 - 0.06, beam - Math.PI / 2); tg.closePath(); tg.fill();
      for (const gst of ghosts) {
        gst.b = (gst.b + gst.v + TAU) % TAU;
        const diff = (beam - gst.b + TAU) % TAU;
        if (diff < 0.07) {
          const [x, y] = pos(gst.b, gst.r);
          tg.fillStyle = "rgba(255,150,90,0.55)"; tg.beginPath(); tg.arc(x, y, 2.4 * dpr, 0, TAU); tg.fill();
        }
      }
      g.clearRect(0, 0, S, S);
      g.drawImage(still, 0, 0);
      g.save(); g.beginPath(); g.arc(c, c, R, 0, TAU); g.clip(); g.drawImage(trail, 0, 0); g.restore();
      const [bx, by] = pos(beam, 1);
      const lg = g.createLinearGradient(c, c, bx, by);
      lg.addColorStop(0, "rgba(255,122,51,0.1)"); lg.addColorStop(1, "rgba(255,122,51,0.95)");
      g.strokeStyle = lg; g.lineWidth = 1.6 * dpr; g.beginPath(); g.moveTo(c, c); g.lineTo(bx, by); g.stroke();
      g.fillStyle = "#FF5A1F"; g.beginPath(); g.arc(c, c, 3 * dpr, 0, TAU); g.fill();
      if (!reduced) {
        // contacts brighten as the beam crosses them, then decay over most of a turn
        for (const k of contacts) {
          const since = ((beam - k.b + TAU) % TAU) / TAU;
          const lit = Math.exp(-since * 3.2);
          if (Math.abs(lit - k.lit) > 0.015) { k.lit = lit; k.el.style.setProperty("--lit", lit.toFixed(3)); }
        }
        const brg = Math.floor((beam / TAU) * 360);
        if (brg !== lastBrg && brg % 3 === 0) { lastBrg = brg; brgEl.textContent = `BRG ${String(brg).padStart(3, "0")}°`; }
      }
      if (running) requestAnimationFrame(frame);
    }
    const start = () => { if (!running && !document.hidden) { running = true; requestAnimationFrame(frame); } };
    size();
    addEventListener("resize", size);
    if (!reduced) {
      new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else running = false; }).observe(fig);
      document.addEventListener("visibilitychange", () => { if (document.hidden) running = false; else if (fig.getBoundingClientRect().top < innerHeight) start(); });
    }
    return { setContacts(next) { contacts = next; place(); } };
  })();

  /* ---------------- 700 m: GitHub (live, cached, quiet on failure) ---------------- */
  // GitHub allows 60 unauthenticated requests an hour per visitor. Answers are kept for
  // an hour across tabs, and if GitHub refuses, the last good answer is used instead.
  async function gh(path, ttl = 60 * 60 * 1000) {
    const key = `anchor-gh:${path}`;
    let hit = null;
    try { hit = JSON.parse(localStorage.getItem(key) || "null"); } catch { /* storage unavailable */ }
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    try {
      const res = await fetch(`${repoApi}${path}`, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) throw new Error(`GitHub ${res.status}`);
      const data = await res.json();
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* full or unavailable */ }
      return data;
    } catch (e) {
      if (hit) return hit.data;
      throw e;
    }
  }
  const fmtDate = (s) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const setStat = (k, v) => {
    const n = $(`[data-stat="${k}"]`);
    if (!n) return;
    if (n.closest(".in") || reduced) countTo(n, v, !["stars", "forks", "contributors"].includes(k));
    else { n.dataset.pending = v; n.dataset.plain = String(!["stars", "forks", "contributors"].includes(k)); }
  };

  gh("").then((r) => {
    setStat("stars", r.stargazers_count.toLocaleString("en"));
    setStat("forks", r.forks_count.toLocaleString("en"));
    setStat("commit", fmtDate(r.pushed_at));
    $$("[data-stars]").forEach((s) => { s.textContent = r.stargazers_count.toLocaleString("en"); s.hidden = false; });
  }).catch(() => { $("[data-stats]").hidden = true; });

  const owner = C.maintainer;
  const ownerContact = { login: owner.login, url: owner.url, avatar: owner.avatar, role: owner.role };
  radar.setContacts([ownerContact]);
  gh("/contributors?per_page=12").then((list) => {
    setStat("contributors", list.length.toLocaleString("en"));
    const rest = list.filter((c) => c.login.toLowerCase() !== owner.login.toLowerCase())
      .map((c) => ({ login: c.login, url: c.html_url, avatar: `${c.avatar_url}&s=80`, role: "contributor" }));
    radar.setContacts([ownerContact, ...rest]);
  }).catch(() => { setStat("contributors", "1"); });

  /* ---------------- download: always the latest installer ---------------- */
  const ua = navigator.userAgent;
  const isWindows = (navigator.userAgentData?.platform || ua).toLowerCase().includes("win") && !/android|iphone|ipad/i.test(ua);
  const dlButtons = $$("[data-download]");
  dlButtons.forEach((a) => { a.href = C.links.latest; a.target = "_blank"; a.rel = "noopener"; });
  if (!isWindows) {
    dlButtons.forEach((a) => { a.href = C.links.github; $(".dl-label", a).textContent = "Anchor is for Windows — view the source on GitHub"; });
  }
  const mb = (b) => `${(b / 1048576).toFixed(1)} MB`;
  gh("/releases/latest", 5 * 60 * 1000).then(async (rel) => {
    const version = String(rel.tag_name || "").replace(/^v\.?/i, "");
    setStat("release", version ? `v${version}` : "—");
    const find = (re) => (rel.assets || []).find((a) => re.test(a.name));
    const setup = find(C.assets.installer);
    if (isWindows) {
      dlButtons.forEach((a) => {
        if (setup) a.href = setup.browser_download_url;
        $(".dl-label", a).textContent = setup ? `Download Anchor ${version}` : "Download from GitHub";
      });
      // portable zip: ARM64 build for ARM PCs where the browser can tell us
      let arm = false;
      try { arm = (await navigator.userAgentData?.getHighEntropyValues(["architecture"]))?.architecture === "arm"; } catch { /* not supported */ }
      const zip = find(arm ? C.assets.zipArm64 : C.assets.zipX64);
      if (zip) { const z = $("[data-zip]"); z.href = zip.browser_download_url; z.textContent = `Portable .zip${arm ? " for ARM" : ""} (no install) · ${mb(zip.size)}`; z.hidden = false; }
    }
    if (setup) {
      $('[data-dl="version"]').textContent = version;
      $('[data-dl="size"]').textContent = mb(setup.size);
      const sha = (setup.digest || "").startsWith("sha256:") ? setup.digest.slice(7) : "";
      if (sha) $('[data-dl="sha"]').textContent = sha; else $("[data-dl-sha]").hidden = true;
      $("[data-dl-meta]").hidden = false;
    }
  }).catch(() => { setStat("release", "—"); });

  /* ---------------- terminal + manifesto + FAQ ---------------- */
  $(".term__body").append(...C.open.terminal.flatMap((l) => [el("span", { className: "ps", textContent: "> " }), l, "\n"]));
  $("[data-copy]").addEventListener("click", async (e) => {
    const btn = e.currentTarget, text = C.open.terminal.join("\n");
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
    catch { getSelection().selectAllChildren($(".term__body")); btn.textContent = "Press Ctrl+C"; }
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  });
  $(".manifesto").append(...C.open.manifesto.map((m) => el("li", { textContent: m })));
  $(".faq").append(...C.faq.map((f) => el("details", {}, el("summary", { textContent: f.q }), el("p", { textContent: f.a }))));

  /* ---------------- 1,000 m: the anchor settles ---------------- */
  new IntersectionObserver(([e], obs) => {
    if (e.isIntersecting) { $("#seabed").classList.add("is-settled"); obs.disconnect(); }
  }, { threshold: 0.35 }).observe($("#seabed"));

  /* ---------------- cursor + magnetic buttons ---------------- */
  if (finePointer && !reduced) {
    root.classList.add("has-cursor");
    const cur = $(".cursor");
    addEventListener("pointermove", (e) => {
      cur.style.setProperty("--cx", `${e.clientX}px`); cur.style.setProperty("--cy", `${e.clientY}px`);
      cur.classList.toggle("is-hot", !!e.target.closest("a, button, summary, [role=switch]"));
    }, { passive: true });
    addEventListener("pointerdown", (e) => {
      const p = el("span", { className: "cursor-ping" });
      p.style.cssText = `--px:${e.clientX}px;--py:${e.clientY}px`;
      document.body.append(p);
      p.addEventListener("animationend", () => p.remove());
    });
    $$(".btn--primary, .btn--drop").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        b.style.setProperty("--mx", `${((e.clientX - r.left) / r.width - 0.5) * 10}px`);
        b.style.setProperty("--my", `${((e.clientY - r.top) / r.height - 0.5) * 8}px`);
      });
      b.addEventListener("pointerleave", () => { b.style.setProperty("--mx", "0px"); b.style.setProperty("--my", "0px"); });
    });
  }

  /* ---------------- ambient sound (off by default) ---------------- */
  // An underwater soundscape generated in the browser: a deep current, slow swells,
  // a low hum and the odd stream of bubbles. Deeper = quieter and more muffled.
  // If content.js lists audio files in music.src, the first one the browser can play is used instead.
  var sound = (() => {
    const M = C.music, btn = $(".sound");
    let ctx, master, muffle, bus, file = false, on = false, depthT = 0, bubbleTimer, sleepTimer;
    const vol = () => M.volume.surface + (M.volume.seabed - M.volume.surface) * depthT;

    function noise(kind) {
      const len = ctx.sampleRate * 6, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9; }
      }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start();
      return src;
    }
    const lfo = (rate, depth, target) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = rate; g.gain.value = depth; o.connect(g).connect(target); o.start();
    };
    function build() {
      ctx = new AudioContext();
      master = ctx.createGain(); master.gain.value = 0;
      muffle = ctx.createBiquadFilter(); muffle.type = "lowpass"; muffle.frequency.value = 1400;
      muffle.connect(master).connect(ctx.destination);
      const probe = document.createElement("audio");
      const src = [].concat(M.src || []).find((f) => probe.canPlayType(f.endsWith(".webm") ? "audio/webm; codecs=opus" : f.endsWith(".m4a") ? "audio/mp4" : "audio/mpeg"));
      if (src) {
        // decoded into the graph so the loop repeats with no gap; generated sound if it fails
        file = true;
        fetch(src).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
          const node = ctx.createBufferSource();
          node.buffer = buf; node.loop = true; node.connect(muffle); node.start();
        }).catch(() => { file = false; buildGenerated(); if (on) bubbles(); });
        return;
      }
      buildGenerated();
    }
    function buildGenerated() {
      // a little space: a dark feedback echo
      bus = ctx.createGain(); bus.gain.value = 0.5;   // level-matched to the audio file
      const delay = ctx.createDelay(1), fb = ctx.createGain(), dark = ctx.createBiquadFilter(), wet = ctx.createGain();
      delay.delayTime.value = 0.27; fb.gain.value = 0.38; dark.type = "lowpass"; dark.frequency.value = 900; wet.gain.value = 0.35;
      bus.connect(muffle); bus.connect(delay); delay.connect(dark).connect(fb).connect(delay); delay.connect(wet).connect(muffle);
      // deep current
      const current = ctx.createBiquadFilter(), cg = ctx.createGain();
      current.type = "lowpass"; current.frequency.value = 320; current.Q.value = 0.5; cg.gain.value = 0.9;
      noise("brown").connect(current).connect(cg).connect(bus);
      lfo(0.05, 120, current.frequency);
      // slow swells
      const swell = ctx.createBiquadFilter(), sg = ctx.createGain();
      swell.type = "bandpass"; swell.frequency.value = 450; swell.Q.value = 0.8; sg.gain.value = 0.12;
      noise("pink").connect(swell).connect(sg).connect(bus);
      lfo(0.07, 0.1, sg.gain);
      lfo(0.031, 180, swell.frequency);
      // low hum
      const hum = ctx.createGain(), humLp = ctx.createBiquadFilter();
      hum.gain.value = 0.05; humLp.type = "lowpass"; humLp.frequency.value = 200;
      [49, 73.5].forEach((f) => { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(humLp); o.start(); });
      humLp.connect(hum).connect(bus);
      lfo(0.13, 0.02, hum.gain);
    }
    function bubbles() {
      if (!on || !bus) return;
      const t = ctx.currentTime, n = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const at = t + i * (0.05 + Math.random() * 0.12), f0 = 300 + Math.random() * 500;
        const o = ctx.createOscillator(), g = ctx.createGain(), pan = ctx.createStereoPanner();
        o.frequency.setValueAtTime(f0, at);
        o.frequency.exponentialRampToValueAtTime(f0 * (2 + Math.random()), at + 0.07);
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.05, at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
        pan.pan.value = Math.random() * 1.6 - 0.8;
        o.connect(g).connect(pan).connect(bus);
        o.start(at); o.stop(at + 0.15);
      }
      bubbleTimer = setTimeout(bubbles, 900 + Math.random() * 3500);
    }
    function apply() {
      const now = ctx.currentTime;
      master.gain.setTargetAtTime(on ? vol() : 0, now, 0.6);
      muffle.frequency.setTargetAtTime(1400 - 1000 * depthT, now, 0.8);
    }
    btn.addEventListener("click", async () => {
      on = !on;
      btn.setAttribute("aria-pressed", String(on));
      if (!ctx) build();
      await ctx.resume();
      clearTimeout(bubbleTimer); clearTimeout(sleepTimer);
      if (on && !file) bubbles();
      apply();
      // after the fade-out, let the audio engine rest
      if (!on) sleepTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 3000);
    });
    return { depth(t) { depthT = t; if (ctx) apply(); } };
  })();

  /* ---------------- motion: count-ups, reveals, pointer light ---------------- */
  const EASE = (k) => 1 - Math.pow(1 - k, 4);
  // Numbers roll from their current value to the new one; words cross-fade.
  function countTo(node, text, plain) {
    text = String(text);
    const m = !plain && text.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
    if (!m || reduced) {
      node.textContent = text;
      if (!reduced) node.animate([{ opacity: 0, transform: "translateY(0.3em)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.16,1,.3,1)" });
      return;
    }
    const [, pre, num, post] = m, dec = (num.split(".")[1] || "").length, commas = num.includes(",");
    const target = parseFloat(num.replace(/,/g, ""));
    const from = parseFloat((node.textContent.match(/[\d,]*\.?\d+/) || ["0"])[0].replace(/,/g, "")) || 0;
    const start = performance.now(), dur = 750;
    const fmt = (v) => (commas ? v.toLocaleString("en", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      node.textContent = k < 1 ? pre + fmt(from + (target - from) * EASE(k)) + post : text;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Sections surface as you reach them. Content is visible unless JS opts in (html.motion).
  if (!reduced && "IntersectionObserver" in window) {
    root.classList.add("motion");
    const groups = [
      [".layer__head"], [".sim__items .toggle-row", true], [".sim__readout"], [".module", true], [".safety"],
      [".dock"], [".stats"], [".radar"], [".term"], [".manifesto li", true], [".faq details", true], [".seabed__inner > *", true],
    ];
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      io.unobserve(e.target);
      $$("[data-pending]", e.target).forEach((n) => { countTo(n, n.dataset.pending, n.dataset.plain === "true"); delete n.dataset.pending; });
    }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    groups.forEach(([sel, stagger]) => $$(sel).forEach((n, i) => {
      n.classList.add("reveal");
      if (stagger) n.style.setProperty("--i", i);
      io.observe(n);
    }));
  } else {
    $$("[data-pending]").forEach((n) => { n.textContent = n.dataset.pending; });
  }

  // a soft light follows the pointer across instrument panels
  if (finePointer && !reduced) {
    $$(".module, .sim__readout, .safety").forEach((p) => p.addEventListener("pointermove", (e) => {
      const r = p.getBoundingClientRect();
      p.style.setProperty("--px", `${e.clientX - r.left}px`);
      p.style.setProperty("--py", `${e.clientY - r.top}px`);
    }));
  }

  /* ---------------- motion switch ---------------- */
  (() => {
    const btn = $(".motion-toggle");
    btn.setAttribute("aria-pressed", String(reduced));
    btn.title = reduced ? "Turn animation back on" : "Reduce motion";
    btn.addEventListener("click", () => {
      try { reduced ? localStorage.removeItem("anchor-site:reduce-motion") : localStorage.setItem("anchor-site:reduce-motion", "1"); } catch { /* storage unavailable */ }
      location.reload();
    });
  })();

  /* ---------------- easter eggs ---------------- */
  // type "drop" anywhere: replay the anchor drop. Konami code: Windows 95.
  const konami = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
  let typed = "", keys = [];
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea, [contenteditable]")) return;
    const k = e.key.toLowerCase();
    keys = [...keys, k].slice(-konami.length);
    if (keys.join() === konami.join()) { root.classList.toggle("win95"); keys = []; }
    if (k.length === 1) {
      typed = (typed + k).slice(-4);
      if (typed === "drop") { typed = ""; replayDrop(); }
    }
  });

  /* ---------------- start ---------------- */
  function startSmooth() {
    if (reduced || !window.Lenis) return;
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", onScroll);
    if (window.gsap && window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => { measure(); onScroll(); });
  addEventListener("load", () => { measure(); onScroll(); startSmooth(); });
  measure(); onScroll();
})();
