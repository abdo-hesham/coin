/* Still Unspent — scroll choreography
   One coin travels between "anchor" boxes placed in the page. Between two anchors it
   interpolates their positions, so when a segment finishes the coin sits exactly on its
   anchor and scrolls with it. The coin is drawn by Three.js (coin3d.js) when WebGL is
   available, otherwise by the CSS 3D coin in the markup. */
gsap.registerPlugin(ScrollTrigger);

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = gsap.parseEase('sine.inOut');
const segEase = (a, b, t) => easeIO(t);
const introEase = gsap.parseEase('expo.inOut');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.body.classList.add('is-loading');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

/* ---------------- CSS fallback coin ---------------- */
const cssCoin = $('#coin');
const cssSpin = $('.coin-spin', cssCoin);
const COIN_BOX = 200;
const DISC = 0.82; // visible disc diameter relative to the CSS coin's image box
{
  const THICK = 14;
  const edge = $('.coin-edge', cssCoin);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('i');
    const k = Math.sin((i / (n - 1)) * Math.PI);
    el.style.transform = `translateZ(${lerp(-THICK / 2 + 1, THICK / 2 - 1, i / (n - 1)).toFixed(2)}px)`;
    el.style.background = `radial-gradient(circle at 40% 35%, hsl(38 48% ${28 + 16 * k}%), hsl(34 55% ${13 + 8 * k}%) 72%)`;
    edge.appendChild(el);
  }
  $('.coin-face--front', cssCoin).style.transform = `translateZ(${THICK / 2}px)`;
  $('.coin-face--back', cssCoin).style.transform = `rotateY(180deg) translateZ(${THICK / 2}px)`;
}

// one interface for both renderers
const coinView = {
  gl: null,
  el: cssCoin,
  z: null,
  set(x, y, d, rx, ry, rz, o, z) {
    if (this.gl) {
      this.gl.set(x, y, d, rx, ry, rz);
    } else {
      const s = d / (COIN_BOX * DISC);
      cssCoin.style.transform = `translate3d(${(x - COIN_BOX / 2).toFixed(2)}px, ${(y - COIN_BOX / 2).toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
      cssSpin.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
    }
    this.el.style.opacity = o.toFixed(3);
    if (this.z !== z) { this.el.style.zIndex = z; this.z = z; }
  },
};
gsap.set([cssCoin, '#coinGL'], { opacity: 0 });

/* ---------------- smooth scroll ---------------- */
let lenis = null;
if (!reduceMotion && window.Lenis) {
  lenis = new Lenis({ lerp: 0.08, smoothWheel: true, wheelMultiplier: 0.9, touchMultiplier: 1.3 });
  lenis.stop();
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
$$('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 2.2 });
    else target.scrollIntoView({ behavior: 'smooth' });
  })
);

/* ---------------- story text: fixed lines that part around the coin ---------------- */
const storyText = $('#storyText');
// a token is one unbreakable word, made of parts that may switch font ("Sibiu" + ",")
const tokens = [];
let glue = false;
storyText.childNodes.forEach((node) => {
  const script = node.nodeType === 1;
  const text = node.textContent;
  const words = text.split(/\s+/).filter(Boolean);
  words.forEach((w, i) => {
    if (i === 0 && glue && !/^\s/.test(text) && tokens.length) tokens[tokens.length - 1].push({ w, script });
    else tokens.push([{ w, script }]);
  });
  glue = !/\s$/.test(text);
});
let lines = [];

const wordHTML = (tok) => tok.map((p) => (p.script ? `<span class="sw--s">${p.w}</span>` : p.w)).join('');

function buildLines() {
  // 1. lay out every word in normal flow to discover the natural line breaks
  storyText.innerHTML = tokens.map((t) => `<span class="sw">${wordHTML(t)}</span>`).join(' ');
  const spans = $$('.sw', storyText);
  const lh = parseFloat(getComputedStyle(storyText).lineHeight) || 40;
  const rows = [];
  let rowY = null;
  spans.forEach((s, i) => {
    const r = s.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    if (rowY === null || Math.abs(cy - rowY) > lh * 0.5) { rows.push([]); rowY = cy; }
    rows[rows.length - 1].push({ tok: tokens[i], width: r.width });
  });
  const space = parseFloat(getComputedStyle(storyText).fontSize) * 0.26;

  // 2. rebuild as rows, each split in two halves near its middle
  storyText.innerHTML = rows
    .map((row) => {
      const total = row.reduce((a, t) => a + t.width, 0) + space * (row.length - 1);
      let acc = 0;
      let k = row.length;
      let best = Infinity;
      for (let i = 1; i < row.length; i++) {
        acc += row[i - 1].width + (i > 1 ? space : 0);
        const d = Math.abs(acc - (total - acc - space));
        if (d < best) { best = d; k = i; }
      }
      const left = row.slice(0, k).map((t) => wordHTML(t.tok)).join(' ');
      const right = row.slice(k).map((t) => wordHTML(t.tok)).join(' ');
      return `<span class="story-line"><span class="sl-l">${left}</span><span class="sl-r">${right}</span></span>`;
    })
    .join('');
  measureLines();
}

function measureLines() {
  const sy = window.scrollY;
  lines = $$('.story-line', storyText).map((el) => {
    const l = $('.sl-l', el);
    const r = $('.sl-r', el);
    gsap.set([l, r], { x: 0 });
    const rb = el.getBoundingClientRect();
    return {
      l, r,
      cy: rb.top + sy + rb.height / 2,
      h: rb.height,
      lLeft: l.getBoundingClientRect().left,
      lRight: l.getBoundingClientRect().right,
      rLeft: r.textContent ? r.getBoundingClientRect().left : Infinity,
      rRight: r.textContent ? r.getBoundingClientRect().right : 0,
      sl: 0, sr: 0,
    };
  });
}

function updateLines(c, dt = 1 / 60) {
  const k = 1 - Math.exp(-22 * dt);
  if (!lines.length) return;
  const sy = window.scrollY;
  const vh = innerHeight;
  const first = lines[0].cy - sy;
  const last = lines[lines.length - 1].cy - sy;
  if (last < -200 || first > vh + 200) return;
  for (const ln of lines) {
    const y = ln.cy - sy;
    let tl = 0, tr = 0;
    if (c.visible && y > -ln.h && y < vh + ln.h) {
      const R = c.r + ln.h * 0.34;
      const d = Math.max(0, Math.abs(y - c.y) - ln.h * 0.42);
      if (d < R) {
        const half = Math.sqrt(R * R - d * d);
        tl = Math.min(0, c.x - half - ln.lRight);
        tr = ln.rLeft === Infinity ? 0 : Math.max(0, c.x + half - ln.rLeft);
        // never push words off screen (matters on phones)
        const m = 8;
        tl = Math.max(tl, m - ln.lLeft);
        tr = Math.min(tr, Math.max(0, innerWidth - m - ln.rRight));
      }
    }
    ln.sl += (tl - ln.sl) * k;
    ln.sr += (tr - ln.sr) * k;
    if (Math.abs(ln.sl) < 0.05) ln.sl = 0;
    if (Math.abs(ln.sr) < 0.05) ln.sr = 0;
    ln.l.style.transform = `translate3d(${ln.sl.toFixed(2)}px,0,0)`;
    ln.r.style.transform = `translate3d(${ln.sr.toFixed(2)}px,0,0)`;
  }
}

/* ---------------- touch stage sizing ---------------- */
const IMG_A = 1672 / 941;
const art = $('.touch-art');
function sizeArt() {
  const W = innerWidth, H = innerHeight;
  // landscape: cover the screen; portrait: a wide band so both hands stay in view
  const aw = W / H >= 1 ? Math.max(W, H * IMG_A) : W * 1.32;
  art.style.setProperty('--art-w', `${aw.toFixed(1)}px`);
  art.style.setProperty('--art-h', `${(aw / IMG_A).toFixed(1)}px`);
}
sizeArt();

/* ---------------- scroll scenes ---------------- */
let touchST;
const TL_LEN = 10; // touch timeline length in "seconds"
const TOUCH = { splitIn: 4.2, coinIn: 5.4, finalAt: 7.6 };

function buildScenes() {
  const vh = () => innerHeight;
  const portrait = () => innerWidth / innerHeight < 1;

  // HERO parallax
  gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } })
    .to('.hero-title', { yPercent: -38, ease: 'none' }, 0)
    .to('.h-column', { y: () => -vh() * 0.22, x: () => -innerWidth * 0.05, ease: 'none' }, 0)
    .to('.h-carpet', { y: () => -vh() * 0.12, x: () => -innerWidth * 0.08, rotation: -6, ease: 'none' }, 0)
    .to('.h-noble', { y: () => vh() * 0.18, opacity: 0.35, ease: 'none' }, 0)
    .to('.h-stone', { y: () => -vh() * 0.2, x: () => innerWidth * 0.05, ease: 'none' }, 0);

  // TURNED title
  gsap.from('.turned-title .line-inner', {
    yPercent: 110, duration: 1.4, ease: 'expo.out', stagger: 0.12,
    scrollTrigger: { trigger: '.turned-title', start: 'top 85%', toggleActions: 'play none none reverse' },
  });

  // CHAPTERS
  $$('.chapter').forEach((ch) => {
    gsap.from($('.ch-title .line-inner', ch), {
      yPercent: 110, duration: 1.5, ease: 'expo.out',
      scrollTrigger: { trigger: ch, start: 'top 70%', toggleActions: 'play none none reverse' },
    });
    gsap.to($('.ch-title', ch), {
      y: () => Math.min(innerWidth * 0.08, innerHeight * 0.15), ease: 'none',
      scrollTrigger: { trigger: ch, start: 'top 40%', end: 'bottom top', scrub: true },
    });
    gsap.fromTo($('.arch-inner img', ch), { scale: 1.28 }, {
      scale: 1.04, ease: 'none',
      scrollTrigger: { trigger: $('.arch', ch), start: 'top bottom', end: 'bottom top', scrub: true },
    });
    const copy = $('.ch-copy', ch);
    gsap.timeline({ scrollTrigger: { trigger: copy, start: 'top 90%', end: 'top 50%', scrub: true } })
      .fromTo($('.ch-lead', copy), { opacity: 0.08, y: 30 }, { opacity: 1, y: 0, ease: 'none' }, 0)
      .fromTo($('.ch-meta', copy), { opacity: 0 }, { opacity: 1, ease: 'none' }, 0.35)
      .fromTo($('.ch-sig', copy), { opacity: 0, y: 12 }, { opacity: 1, y: 0, ease: 'none' }, 0.5);
  });

  // TOUCH / FINALE (pinned)
  const insetStr = (t, r, b, l) => `inset(${t}% ${r}% ${b}% ${l}%)`;
  const clip = { t: 0, s: 0, b: 0, gap: 0 };
  const cl = $('.touch-copy--l');
  const cr = $('.touch-copy--r');
  const applyClip = () => {
    cl.style.clipPath = insetStr(clip.t, 50 + clip.gap - 0.02, clip.b, clip.s);
    cr.style.clipPath = insetStr(clip.t, clip.s, clip.b, 50 + clip.gap - 0.02);
  };
  applyClip();
  gsap.set('.finale-title .line-inner', { yPercent: 35, opacity: 0 });
  gsap.set('.finale-foot', { opacity: 0 });

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: '.touch', start: 'top top', end: () => `+=${innerHeight * 3.4}`,
      pin: true, scrub: true, invalidateOnRefresh: true,
    },
  });
  // the frame closes in around the painting; the hands (separate layers) stay whole and spill past it
  tl.to(clip, { t: () => (portrait() ? 8 : 12), s: () => (portrait() ? 4 : 7), b: () => (portrait() ? 8 : 6), duration: 3.2, ease: 'power2.inOut', onUpdate: applyClip }, 0)
    .to('.touch-art', { scale: 0.9, y: () => innerHeight * 0.03, duration: 3.2, ease: 'power2.inOut' }, 0)
    // split
    .to(clip, { gap: 3.5, duration: 2.3, ease: 'power2.inOut', onUpdate: applyClip }, TOUCH.splitIn)
    .to(cl, { x: () => -innerWidth * 0.025, duration: 2.3, ease: 'power2.inOut' }, TOUCH.splitIn)
    .to(cr, { x: () => innerWidth * 0.025, duration: 2.3, ease: 'power2.inOut' }, TOUCH.splitIn)
    .to('.touch-blur', { opacity: 1, duration: 1.6, ease: 'power1.inOut' }, TOUCH.splitIn)
    .to('.touch-hand--l', { xPercent: -70, duration: 3.6, ease: 'power2.inOut' }, TOUCH.splitIn)
    .to('.touch-hand--r', { xPercent: 70, duration: 3.6, ease: 'power2.inOut' }, TOUCH.splitIn)
    .to('.touch-hand', { opacity: 0, duration: 1.4, ease: 'power1.in' }, TOUCH.splitIn + 2.2)
    .to([cl, cr], { opacity: 0, duration: 1.5, ease: 'power1.inOut' }, TOUCH.splitIn + 1.2)
    // finale
    .to('.finale-title .line-inner', { yPercent: 0, opacity: 1, duration: 1.6, stagger: 0.3, ease: 'power2.out' }, 6.0)
    .to('.finale-foot', { opacity: 1, duration: 1 }, 7.6)
    .set({}, {}, TL_LEN);
  touchST = tl.scrollTrigger;
}

/* ---------------- coin stops ---------------- */
// anchors that only move with the page are measured once per refresh (no layout reads per frame);
// anchors inside transformed / pinned elements are read live
const staticAnchors = [];
function staticStop(el) {
  const a = { el, x: 0, y: 0, d: 0 };
  staticAnchors.push(a);
  const get = () => ({ x: a.x, y: a.y - window.scrollY, d: a.d });
  get.docY = () => a.y;
  return get;
}
function liveStop(el) {
  const get = () => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width };
  };
  get.docY = () => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 + window.scrollY; };
  return get;
}
function measureAnchors() {
  const sy = window.scrollY;
  staticAnchors.forEach((a) => {
    const r = a.el.getBoundingClientRect();
    a.x = r.left + r.width / 2; a.y = r.top + r.height / 2 + sy; a.d = r.width;
  });
}

const G = {
  hero: staticStop($('#a-hero')),
  hero2: staticStop($('#a-hero2')),
  turned: staticStop($('#a-turned')),
  struck: staticStop($('#a-struck')),
  refTitle: liveStop($('#a-refused-title')),
  refused: staticStop($('#a-refused')),
  disc: liveStop($('#a-disc')),
  final: liveStop($('#a-final')),
};

let stops = [];
function computeStops() {
  measureAnchors();
  const vh = innerHeight;
  const vw = innerWidth;
  const small = vw < 760;
  const storyLH = parseFloat(getComputedStyle(storyText).lineHeight) || 40;
  const storyTop = storyText.getBoundingClientRect().top + window.scrollY;
  const storyBottom = storyTop + storyText.offsetHeight;
  const tStart = touchST.start;
  const tLen = touchST.end - touchST.start;
  const tAt = (time) => tStart + (time / TL_LEN) * tLen;
  const when = (get, f) => get.docY() - f * vh;

  const s = [
    { get: G.hero, at: 0, leave: 0, rx: 8, ry: -16, rz: -4, idle: 1 },
    // the flight into "Turned by time" curves through a big coin low in the hero
    { get: G.turned, at: when(G.turned, 0.4), hold: vh * 0.05, ry: 360, rz: 0, via: G.hero2, viaRy: 150 },
    {
      get: () => ({ x: vw / 2, y: vh * 0.47, d: storyLH * (small ? 2.6 : 3.1) }),
      at: storyTop - vh * 0.58,
      leave: storyBottom - vh * 0.5,
      ry: 360, rz: 0, rzOut: 40,
    },
    { get: G.struck, at: when(G.struck, 0.68), leave: when(G.struck, 0.44), rx: 6, ry: 720, rz: 28 },
    // forged -> carried curves past the "Carried" title, edge-on as it goes by
    { get: G.refused, at: when(G.refused, 0.5), leave: when(G.refused, 0.3), rx: 8, ry: 1080, rz: 10, via: G.refTitle, viaRy: 810 },
    {
      get: () => ({ x: vw / 2, y: vh * 0.46, d: Math.min(vw * (small ? 0.24 : 0.105), vh * 0.22) }),
      at: tStart - vh * 0.72, leave: tStart - vh * 0.5, ry: 1440, rz: 0,
    },
    { get: G.disc, at: tStart - vh * 0.02, leave: tAt(TOUCH.splitIn), ry: 1440 + 160, o: 0 },
    { get: G.disc, at: tAt(TOUCH.coinIn), hold: tLen * 0.02, ry: 1800, o: 1, z: 30 },
    { get: G.final, at: tAt(TOUCH.finalAt), leave: Infinity, ry: 1800 + 360, rx: 4, z: 30, spin: true },
  ];
  // defaults + strictly increasing scroll positions (every segment gets real length)
  const minSeg = vh * 0.22; // a coin flight never gets squeezed into a few pixels of scroll
  let prev = -Infinity;
  s.forEach((st) => {
    st.rx ??= 0; st.ry ??= 0; st.rz ??= 0; st.o ??= 1; st.z ??= 5;
    st.at = Math.max(st.at, prev + minSeg);
    st.leave = Math.max(st.leave ?? st.at + (st.hold || 0), st.at);
    prev = st.leave;
  });
  stops = s;
}

/* ---------------- per-frame coin update ---------------- */
// intro: the coin flies from the preloader into the hero
const intro = { p: 1, active: false, from: null };
const coinState = { x: 0, y: 0, r: 0, visible: false };
// rotation / opacity / idle are damped so no value can jump between frames;
// position stays locked to the (Lenis-smoothed) scroll so the coin never lags its anchor
const rot = { rx: 0, ry: 0, rz: 0, o: 0, idle: 1, spin: 0 };
let synced = false;
let lastT = performance.now();
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

function resolve(y) {
  for (let i = 0; i < stops.length; i++) {
    const st = stops[i];
    if (y < st.at) {
      if (i === 0) return { a: st, b: null, t: 0, hold: st, hp: 0 };
      const a = stops[i - 1];
      return { a, b: st, t: segEase(a, st, clamp((y - a.leave) / (st.at - a.leave), 0, 1)), hold: null };
    }
    if (y <= st.leave) {
      const span = st.leave - st.at;
      return { a: st, b: null, t: 0, hold: st, hp: span > 0 && span !== Infinity ? (y - st.at) / span : 0 };
    }
  }
  const last = stops[stops.length - 1];
  return { a: last, b: null, t: 0, hold: last, hp: 1 };
}

function updateCoin() {
  if (!stops.length) return;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const y = window.scrollY;
  const { a, b, t, hold, hp } = resolve(y);

  const ra = a.get();
  const rb = b ? b.get() : null;
  let x, cy, d, rx, ry, rz, o, z;
  const aRzOut = a.rzOut ?? a.rz;
  if (b && b.via) {
    // quadratic Bézier whose control point makes the curve pass exactly through the via point at t = .5
    const v = b.via();
    const u = 1 - t;
    const q = (p0, pv, p2) => u * u * p0 + 2 * u * t * (2 * pv - (p0 + p2) / 2) + t * t * p2;
    x = q(ra.x, v.x, rb.x); cy = q(ra.y, v.y, rb.y); d = Math.max(1, q(ra.d, v.d, rb.d));
    rx = lerp(a.rx, b.rx, t); rz = lerp(aRzOut, b.rz, t);
    ry = t < 0.5 ? lerp(a.ry, b.viaRy, t * 2) : lerp(b.viaRy, b.ry, (t - 0.5) * 2);
    o = lerp(a.o, b.o, t); z = t < 0.5 ? a.z : b.z;
  } else if (b) {
    x = lerp(ra.x, rb.x, t); cy = lerp(ra.y, rb.y, t); d = lerp(ra.d, rb.d, t);
    rx = lerp(a.rx, b.rx, t); ry = lerp(a.ry, b.ry, t); rz = lerp(aRzOut, b.rz, t);
    o = lerp(a.o, b.o, t); z = t < 0.5 ? a.z : b.z;
  } else {
    x = ra.x; cy = ra.y; d = ra.d; rx = a.rx; ry = a.ry; rz = lerp(a.rz, aRzOut, hp); o = a.o; z = a.z;
  }

  // hero idle float fades in/out instead of switching off at the first pixel of scroll
  rot.idle = damp(rot.idle, hold && hold.idle && y < 4 ? 1 : 0, 3, dt);
  const time = now / 1000;
  ry += rot.idle * Math.sin(time * 0.9) * 14;
  rx += rot.idle * Math.sin(time * 0.7) * 4;
  cy += rot.idle * Math.sin(time * 1.1) * 5;

  // the last coin keeps turning; leaving it settles back to the nearest full turn
  if (hold && hold.spin) rot.spin += dt * 60;
  else rot.spin = damp(rot.spin, Math.round(rot.spin / 360) * 360, 4, dt);
  ry += rot.spin;

  // preloader hand-off
  if (intro.active || intro.p < 1) {
    const f = intro.from;
    const e = introEase(intro.p);
    x = lerp(f.x, x, e); cy = lerp(f.y, cy, e); d = lerp(f.d, d, e);
    ry = lerp(f.ry - 720, ry, e); rx = lerp(0, rx, e); rz = lerp(0, rz, e);
    if (intro.p < 0.5) z = 210;
  }
  if (!intro.from) o = 0;

  if (!synced && intro.from) { Object.assign(rot, { rx, ry, rz, o }); synced = true; }
  rot.rx = damp(rot.rx, rx, 14, dt);
  rot.ry = intro.p < 1 ? ry : damp(rot.ry, ry, 14, dt);
  rot.rz = damp(rot.rz, rz, 14, dt);
  rot.o = intro.p < 1 ? o : damp(rot.o, o, 14, dt);

  coinView.set(x, cy, d, rot.rx, rot.ry, rot.rz, rot.o, z);
  coinState.x = x; coinState.y = cy; coinState.r = d / 2; coinState.visible = rot.o > 0.2;
  updateLines(coinState, dt);
}

/* ---------------- hero mouse parallax ---------------- */
const layers = $$('.h-layer').map((w) => ({ el: w.querySelector('img'), depth: parseFloat(w.dataset.depth) || 0.3, x: 0, y: 0 }));
const mouse = { x: 0, y: 0 };
if (!reduceMotion && matchMedia('(pointer: fine)').matches) {
  addEventListener('pointermove', (e) => {
    mouse.x = e.clientX / innerWidth - 0.5;
    mouse.y = e.clientY / innerHeight - 0.5;
  });
}
function updateLayers() {
  if (window.scrollY > innerHeight * 1.2) return;
  for (const l of layers) {
    const tx = mouse.x * -36 * l.depth, ty = mouse.y * -22 * l.depth;
    if (Math.abs(tx - l.x) < 0.05 && Math.abs(ty - l.y) < 0.05) continue; // settled: no style write
    l.x += (tx - l.x) * 0.05;
    l.y += (ty - l.y) * 0.05;
    l.el.style.translate = `${l.x.toFixed(2)}px ${l.y.toFixed(2)}px`;
  }
}

/* ---------------- preloader ---------------- */
const loaderEl = $('.loader');
const loaderCoin = $('.loader-coin');
const loaderNum = $('.loader-num');
const load = { real: 0, shown: 0, t0: performance.now() };
const MIN_LOADER = reduceMotion ? 0.2 : 0.9; // seconds

const loaderSpin = gsap.to(loaderCoin, { rotationY: '+=360', duration: 2.6, ease: 'none', repeat: -1 });
gsap.fromTo(loaderCoin, { y: -4 }, { y: 4, duration: 1.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
gsap.from(['.loader-stage', '.loader-word', '.loader-pct'], { opacity: 0, y: 14, duration: 1.1, ease: 'power3.out', stagger: 0.08 });

function tickLoader() {
  const elapsed = (performance.now() - load.t0) / 1000;
  const target = Math.min(load.real, elapsed / MIN_LOADER);
  load.shown += (target - load.shown) * 0.18;
  if (target >= 1 && load.shown > 0.985) load.shown = 1;
  loaderNum.textContent = Math.round(load.shown * 100);
  return load.shown >= 1;
}

function loadAssets() {
  // only what the first screen needs; everything below the fold is lazy and warmed up after the intro
  const imgs = $$('img[src]').filter((img) => img.loading !== 'lazy');
  const tasks = imgs.length + 2;
  let done = 0;
  const tick = () => { done++; load.real = done / tasks; };
  const imgPromises = imgs.map((img) =>
    (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; }))
      .then(() => (img.decode ? img.decode().catch(() => {}) : null))
      .then(tick)
  );
  const fonts = (document.fonts ? document.fonts.ready : Promise.resolve()).then(tick);
  const useCssCoin = () => {
    $('#coinGL').style.display = 'none';
    $$('img[data-src]', cssCoin).forEach((img) => { img.src = img.dataset.src; });
  };
  // never let a slow CDN hold the page hostage: fall back to the CSS coin after 4s
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('WebGL coin timed out')), 4000));
  const gl = Promise.race([
    import('./coin3d.js').then((m) => m.createCoin3D($('#coinGL'), { front: 'assets/coin-tex-front.webp', back: 'assets/coin-tex-back.webp' })),
    timeout,
  ])
    .then((c) => { coinView.gl = c; coinView.el = c.canvas; cssCoin.style.display = 'none'; })
    .catch((err) => { console.warn('WebGL coin unavailable, using CSS coin.', err); useCssCoin(); })
    .then(tick);
  return Promise.all([...imgPromises, fonts, gl]);
}

function startIntro() {
  const d = reduceMotion ? 0.01 : 1;
  // freeze the preloader coin and start the real coin in exactly the same place and pose
  loaderSpin.pause();
  const r = loaderCoin.getBoundingClientRect();
  const spinY = ((gsap.getProperty(loaderCoin, 'rotationY') % 360) + 360) % 360;
  intro.from = { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width * DISC_LOADER, ry: spinY };
  intro.p = 0;
  intro.active = true;
  gsap.set(coinView.el, { opacity: 1 });
  gsap.set(loaderCoin, { opacity: 0 });

  const tl = gsap.timeline({
    onComplete: () => { intro.active = false; loaderEl.style.display = 'none'; warmLazyImages(); },
  });
  tl.to(['.loader-word', '.loader-pct'], { opacity: 0, y: -10, duration: 0.4 * d, ease: 'power2.in', stagger: 0.04 }, 0)
    .to(loaderEl, { backgroundColor: 'rgba(0,0,0,0)', duration: 0.7 * d, ease: 'power2.inOut' }, 0.1 * d)
    .to(intro, { p: 1, duration: 1.5 * d, ease: 'none' }, 0.05 * d)
    .fromTo('.h-layer img', { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 2 * d, ease: 'expo.out', stagger: 0.08 * d }, 0.25 * d)
    .from('.hero-title .line-inner', { yPercent: 110, duration: 1.4 * d, ease: 'expo.out', stagger: 0.12 * d }, 0.5 * d)
    .from('.nav', { opacity: 0, y: -14, duration: 1 * d, ease: 'power3.out' }, 0.7 * d);
  gsap.delayedCall(0.9 * d, () => { document.body.classList.remove('is-loading'); lenis && lenis.start(); });
}
// fetch below-the-fold images while the visitor is still reading the hero
function warmLazyImages() {
  const go = () => $$('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 600);
}
// loader coin artwork sits inside its image box the same way as the CSS coin
const DISC_LOADER = DISC;

/* ---------------- boot ---------------- */
gsap.ticker.add(() => { updateCoin(); updateLayers(); });

loadAssets().then(() => {
  window.scrollTo(0, 0);
  buildLines();
  buildScenes();
  ScrollTrigger.addEventListener('refreshInit', () => lines.forEach((ln) => gsap.set([ln.l, ln.r], { x: 0 })));
  ScrollTrigger.addEventListener('refresh', () => { measureLines(); computeStops(); });
  ScrollTrigger.refresh();
  const wait = () => (load.shown >= 1 ? startIntro() : requestAnimationFrame(wait));
  wait();
});
(function loaderLoop() {
  if (intro.from) return;
  tickLoader();
  requestAnimationFrame(loaderLoop);
})();

let resizeTimer;
let lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    sizeArt();
    coinView.gl && coinView.gl.resize();
    if (innerWidth !== lastW) { lastW = innerWidth; buildLines(); }
    ScrollTrigger.refresh();
  }, 180);
});
