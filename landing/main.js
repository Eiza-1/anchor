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
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  function onScroll() {
    const y = scrollY, p = Math.min(1, y / docMax);
    // depth interpolates between section tops (measured at 40% of the viewport)
    const probe = y + innerHeight * 0.4;
    let i = 0;
    while (i < tops.length - 1 && probe >= tops[i + 1]) i++;
    const next = Math.min(i + 1, tops.length - 1);
    const span = tops[next] - tops[i] || 1;
    const k = i === next ? 0 : Math.min(1, Math.max(0, (probe - tops[i]) / span));
    depthM = p > 0.995 ? 1000 : Math.round(stops[i].m + (stops[next].m - stops[i].m) * k);
    const t = depthM / 1000;
    root.style.setProperty("--bg", mix(t));
    root.style.setProperty("--depth", t.toFixed(3));
    root.style.setProperty("--p", p.toFixed(4));
    gauge.style.setProperty("--gauge-p", t);
    now.value = `${depthM.toLocaleString("en")} m`;
    markLinks.forEach((a, j) => a.setAttribute("aria-current", j === i ? "true" : "false"));
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
  // Junk is placed by measuring: never over the headline, copy, buttons, header
  // or depth gauge, and never over another piece. A piece that doesn't fit is hidden.
  const junkItems = C.hero.junk.map((j) => {
    const n = el("div", { className: `junk__item junk__${j.kind}` });
    if (j.kind === "toast") n.append(el("b", { textContent: j.text }), j.detail);
    else if (j.kind === "scare") n.append(j.text, el("small", { textContent: j.detail }));
    else n.textContent = j.text;
    junk.append(n);
    return n;
  });
  function layoutJunk() {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const box = surface.getBoundingClientRect(), W = box.width, H = box.height;
    const DRIFT = 22;   // drift animation reach, kept as clearance
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
      n.style.cssText = `--x:${spot.x.toFixed(0)}px;--y:${spot.y.toFixed(0)}px;--r:${(rnd() * 6 - 3).toFixed(1)}deg;--dx:${(rnd() * 30 - 15).toFixed(0)}px;--dy:${(rnd() * 24 - 12).toFixed(0)}px;--dur:${(5 + rnd() * 5).toFixed(1)}s;--delay:-${(rnd() * 5).toFixed(1)}s;--sx:${(rnd() * 200 - 100).toFixed(0)}px;--sr:${(rnd() * 90 - 45).toFixed(0)}deg;--h:${Math.round(rnd() * 360)};transition-delay:${(rnd() * 0.25).toFixed(2)}s`;
    });
  }
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
    junk.classList.add("is-sinking");
    surface.classList.add("is-calm");
    await sleep(reduced ? 0 : 1100);
    plunge.style.opacity = "0";
    scrollToEl($("#drag"));
    dropping = false;
  }
  async function replayDrop() {
    junk.classList.remove("is-sinking");
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
      to.textContent = on ? m.after : m.before;
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
  function showPage(id, focus) {
    page.replaceChildren(...pages[id]());
    $$("button", nav).forEach((b) => (b.dataset.page === id ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    if (focus) page.focus({ preventScroll: true });
  }
  D.nav.forEach((n) => {
    if (n.group) { nav.append(el("div", { className: "grp", textContent: n.group })); return; }
    const b = el("button", { type: "button", textContent: n.label });
    b.dataset.page = n.id;
    b.addEventListener("click", () => showPage(n.id, false));
    nav.append(b);
  });
  showPage("home");
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

  /* ---------------- 700 m: GitHub (live, cached, quiet on failure) ---------------- */
  async function gh(path, ttl = 10 * 60 * 1000) {
    const key = `anchor-gh:${path}`;
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || "null");
      if (hit && Date.now() - hit.at < ttl) return hit.data;
    } catch { /* storage unavailable */ }
    const res = await fetch(`${repoApi}${path}`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const data = await res.json();
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* full or unavailable */ }
    return data;
  }
  const fmtDate = (s) => new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const setStat = (k, v) => { const n = $(`[data-stat="${k}"]`); if (n) n.textContent = v; };

  gh("").then((r) => {
    setStat("stars", r.stargazers_count.toLocaleString("en"));
    setStat("forks", r.forks_count.toLocaleString("en"));
    setStat("commit", fmtDate(r.pushed_at));
    $$("[data-stars]").forEach((s) => { s.textContent = r.stargazers_count.toLocaleString("en"); s.hidden = false; });
  }).catch(() => { $("[data-stats]").hidden = true; });

  gh("/contributors?per_page=12").then((list) => {
    setStat("contributors", list.length.toLocaleString("en"));
    const blips = $(".sonar__blips");
    list.forEach((c, i) => {
      const a = (i * 137.5 * Math.PI) / 180, r = 18 + ((i * 23) % 26);   // golden-angle spiral
      const li = el("li", { style: `--x:${50 + r * Math.cos(a)}%;--y:${50 + r * Math.sin(a)}%;--d:${(i * 0.3).toFixed(1)}s` },
        el("a", { href: c.html_url, target: "_blank", rel: "noopener", ariaLabel: c.login }, el("img", { src: `${c.avatar_url}&s=68`, alt: "", loading: "lazy", width: 34, height: 34 })),
        el("span", { className: "tip", textContent: c.login }));
      blips.append(li);
    });
  }).catch(() => { setStat("contributors", "—"); });

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
  // If content.js sets music.src, that audio file plays instead.
  var sound = (() => {
    const M = C.music, btn = $(".sound");
    let ctx, master, muffle, bus, file = null, on = false, depthT = 0, bubbleTimer;
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
      if (M.src) {
        file = new Audio(M.src); file.loop = true;
        ctx.createMediaElementSource(file).connect(muffle);
        return;
      }
      // a little space: a dark feedback echo
      bus = ctx.createGain();
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
      if (file) on ? file.play().catch(() => {}) : file.pause();
      clearTimeout(bubbleTimer);
      if (on) bubbles();
      apply();
    });
    return { depth(t) { depthT = t; if (ctx) apply(); } };
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
      // gentle parallax: headings drift slower than the page
      $$(".layer__head").forEach((h) => gsap.to(h, { yPercent: -12, ease: "none", scrollTrigger: { trigger: h.closest(".layer"), scrub: true } }));
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
