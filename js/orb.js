let canvas, ctx, W, H, cx, cy, R;
let orbState = 'idle';
let targetLvl = 0;
let audioLvl = 0;
let time = 0;

// Plasma particles
const PARTICLES = 180;
let particles = [];

// Neural filaments
const FILAMENTS = 24;
let filaments = [];

// Heartbeat data
let heartbeatPhase = 0;
let heartbeatStrength = 0;
let nextBeat = 60;
let beatCount = 0;

function initCanvas() {
  canvas = document.getElementById('novaCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  initParticles();
  initFilaments();
  requestAnimationFrame(draw);
}

function resize() {
  const s = Math.min(window.innerWidth * 0.44, window.innerHeight * 0.65, 480);
  canvas.style.width = s + 'px';
  canvas.style.height = s + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = s * dpr;
  canvas.height = s * dpr;
  W = canvas.width; H = canvas.height;
  cx = W / 2; cy = H / 2;
  R = W * 0.38;
  ctx.scale(dpr, dpr);
  initParticles();
  initFilaments();
}

function initParticles() {
  particles = [];
  const sw = canvas.clientWidth;
  const sh = canvas.clientHeight;
  const r = sw * 0.38;
  const c2 = sw / 2;

  for (let i = 0; i < PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.pow(Math.random(), 0.5) * r * 0.92;
    particles.push({
      x: c2 + Math.cos(angle) * dist,
      y: sh / 2 + Math.sin(angle) * dist,
      bx: c2 + Math.cos(angle) * dist,
      by: sh / 2 + Math.sin(angle) * dist,
      angle, dist,
      orbitSpd: (0.001 + Math.random() * 0.004) * (Math.random() > 0.5 ? 1 : -1),
      size: 0.6 + Math.random() * 2.2,
      bright: 0.1 + Math.random() * 0.6,
      pulse: Math.random() * Math.PI * 2,
      pulseSpd: 0.008 + Math.random() * 0.025,
      layer: Math.floor(Math.random() * 3),
      signal: 0,
      trail: [],
      trailLen: Math.floor(Math.random() * 8),
    });
  }
}

function initFilaments() {
  filaments = [];
  for (let i = 0; i < FILAMENTS; i++) {
    filaments.push(createFilament(i));
  }
}

function createFilament(i) {
  const startAngle = (i / FILAMENTS) * Math.PI * 2 + Math.random() * 0.5;
  const sw = canvas.clientWidth;
  const r = sw * 0.38;
  const c2 = sw / 2;
  const ch = canvas.clientHeight / 2;

  const pts = [];
  const steps = 12 + Math.floor(Math.random() * 10);
  const endR = r * (0.05 + Math.random() * 0.85);
  const endAngle = startAngle + (Math.random() - 0.5) * Math.PI * 1.2;

  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const cr = endR * t;
    const ca = startAngle + (endAngle - startAngle) * t;
    const jitter = (1 - Math.pow(t - 0.5, 2) * 4) * r * 0.08;
    pts.push({
      x: c2 + Math.cos(ca) * cr + (Math.random() - 0.5) * jitter,
      y: ch + Math.sin(ca) * cr + (Math.random() - 0.5) * jitter,
    });
  }

  return {
    pts,
    life: Math.random(),
    maxLife: 0.6 + Math.random() * 0.8,
    spd: 0.003 + Math.random() * 0.008,
    bright: 0.2 + Math.random() * 0.5,
    signal: 0,
    signalPos: Math.random() > 0.7 ? 0 : -1,
    signalActive: Math.random() > 0.7,
  };
}

function getC() {
  switch (orbState) {
    case 'listening': return { r: [232, 100, 100], g: [255, 140, 120], a: [255, 80, 80] };
    case 'thinking':  return { r: [200, 160, 90], g: [220, 185, 120], a: [180, 130, 60] };
    case 'speaking':  return { r: [80, 200, 140], g: [120, 220, 170], a: [60, 180, 110] };
    default:          return { r: [74, 158, 255], g: [120, 185, 255], a: [45, 120, 220] };
  }
}

function rgb(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

function draw() {
  requestAnimationFrame(draw);
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

  time += 0.007;
  audioLvl += (targetLvl - audioLvl) * 0.04;
  const e = audioLvl;
  const C = getC();
  const sw = canvas.clientWidth;
  const sh = canvas.clientHeight;
  const r = sw * 0.38;
  const c2 = sw / 2;
  const ch = sh / 2;

  // Heartbeat - smooth, no jolts
  nextBeat--;
  if (nextBeat <= 0) {
    heartbeatStrength = 0.4 + e * 0.2;
    heartbeatPhase = 0;
    beatCount++;
    nextBeat = 70 + Math.random() * 40;
  }
  heartbeatPhase += 0.04;
  const rawBeat = heartbeatStrength * Math.max(0, Math.exp(-heartbeatPhase * 0.8) * Math.sin(heartbeatPhase * 5));
  const beat = rawBeat * 0.5;
  heartbeatStrength = Math.max(0, heartbeatStrength - 0.008);

  const breathe = 1 + Math.sin(time * 0.5) * 0.015 + beat * 0.02 + e * 0.05;

  // ── CORONA EXTERIOR ──
  const corona = ctx.createRadialGradient(c2, ch, 0, c2, ch, r * 1.8);
  corona.addColorStop(0, rgb(C.r, 0.02 + beat * 0.03 + e * 0.02));
  corona.addColorStop(0.5, rgb(C.a, 0.01 + e * 0.01));
  corona.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(c2, ch, r * 1.8, 0, Math.PI * 2);
  ctx.fillStyle = corona;
  ctx.fill();

  // ── ONDAS ORGÁNICAS ──
  const waveCount = orbState === 'speaking' ? 6 : orbState === 'listening' ? 5 : 4;
  for (let w = 0; w < waveCount; w++) {
    const wr = r * breathe * (0.88 + w * 0.04);
    const wAlpha = (0.06 - w * 0.008) + beat * 0.06 + e * 0.05;

    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const n1 = Math.sin(a * 3 + time * 1.8 + w * 0.7) * r * (0.015 + e * 0.04 + beat * 0.02);
      const n2 = Math.sin(a * 7 - time * 2.5 + w * 1.2) * r * (0.01 + e * 0.025);
      const n3 = Math.sin(a * 13 + time * 3.8 + w) * r * (0.006 + e * 0.015);
      const rr = wr + n1 + n2 + n3;
      const px = c2 + Math.cos(a) * rr;
      const py = ch + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = w === 0 ? rgb(C.g, wAlpha * 1.5) : rgb(C.r, wAlpha);
    ctx.lineWidth = w === 0 ? 1.2 : 0.6;
    ctx.stroke();
  }

  // ── FILAMENTOS ──
  filaments.forEach((f, fi) => {
    f.life += f.spd * (1 + e * 0.5);
    if (f.life > f.maxLife) {
      filaments[fi] = createFilament(fi);
      return;
    }

    const la = Math.sin((f.life / f.maxLife) * Math.PI) * f.bright;

    if (f.pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(f.pts[0].x, f.pts[0].y);
    for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);

    ctx.strokeStyle = rgb(C.r, la * 0.06);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(f.pts[0].x, f.pts[0].y);
    for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i].x, f.pts[i].y);
    ctx.strokeStyle = rgb(C.g, la * 0.2);
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Signal traveling the filament
    if (f.signalActive) {
      f.signalPos += 0.035 * (1 + e);
      if (f.signalPos > 1) {
        f.signalPos = -1;
        f.signalActive = Math.random() > 0.4;
      }
      if (f.signalPos >= 0) {
        const idx = Math.floor(f.signalPos * (f.pts.length - 1));
        const pt = f.pts[Math.min(idx, f.pts.length - 1)];
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2 + e * 2, 0, Math.PI * 2);
        ctx.fillStyle = rgb(C.g, 0.7 + beat * 0.3);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5 + e * 4, 0, Math.PI * 2);
        ctx.fillStyle = rgb(C.g, 0.1);
        ctx.fill();
      }
    } else if (Math.random() < 0.003 * (1 + e * 4 + beat * 3)) {
      f.signalActive = true;
      f.signalPos = 0;
    }
  });

  // ── CLIP — interior de la esfera ──
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const n = Math.sin(a * 4 + time * 2) * r * 0.012 * (1 + e * 2 + beat);
    const rr = r * breathe + n;
    const px = c2 + Math.cos(a) * rr;
    const py = ch + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();

  // Fondo interior
  const innerBg = ctx.createRadialGradient(c2, ch, 0, c2, ch, r);
  innerBg.addColorStop(0, `rgba(0,1,4,1)`);
  innerBg.addColorStop(0.7, `rgba(0,2,8,1)`);
  innerBg.addColorStop(1, rgb(C.a, 0.08 + beat * 0.05));
  ctx.fillStyle = innerBg;
  ctx.fillRect(0, 0, sw, sh);

  // ── PARTÍCULAS DE PLASMA ──
  particles.forEach(p => {
    p.angle += p.orbitSpd * (1 + e * 0.6 + beat * 0.3);
    p.pulse += p.pulseSpd;

    const distMod = p.dist * (1 + Math.sin(time * 0.4 + p.angle * 2) * 0.04 + beat * 0.03);
    p.x = c2 + Math.cos(p.angle) * distMod;
    p.y = ch + Math.sin(p.angle) * distMod;

    p.trail.unshift({ x: p.x, y: p.y });
    if (p.trail.length > p.trailLen) p.trail.pop();

    const pAlpha = (0.08 + Math.sin(p.pulse) * 0.5 * p.bright + p.signal * 0.4 + e * 0.15) * (p.layer === 2 ? 1 : p.layer === 1 ? 0.7 : 0.4);
    const pSize = p.size * (1 + p.signal * 0.6 + beat * 0.3 + e * 0.2);

    // Trail
    p.trail.forEach((tp, ti) => {
      const ta = pAlpha * (1 - ti / p.trail.length) * 0.35;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, pSize * (1 - ti / p.trail.length) * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = rgb(C.r, ta);
      ctx.fill();
    });

    // Particle
    if (p.signal > 0.3 || p.layer === 2) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, pSize * 3, 0, Math.PI * 2);
      ctx.fillStyle = rgb(C.g, pAlpha * 0.08);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, pSize, 0, Math.PI * 2);
    ctx.fillStyle = p.signal > 0.5 ? rgb([255, 255, 255], pAlpha * 0.9) : rgb(C.g, pAlpha);
    ctx.fill();

    p.signal = Math.max(0, p.signal - 0.025);
    if (Math.random() < 0.001 * (1 + e * 4 + beat * 5)) p.signal = 1;
  });

  // ── GRADIENTE DE PROFUNDIDAD ──
  const depth = ctx.createRadialGradient(c2, ch, 0, c2, ch, r);
  depth.addColorStop(0, rgb(C.a, 0));
  depth.addColorStop(0.6, rgb(C.r, 0.02 + e * 0.02));
  depth.addColorStop(0.88, rgb(C.r, 0.06 + beat * 0.04 + e * 0.04));
  depth.addColorStop(1, rgb(C.a, 0.18 + beat * 0.08 + e * 0.08));
  ctx.fillStyle = depth;
  ctx.fillRect(0, 0, sw, sh);

  ctx.restore();

  // ── ANILLO EXTERIOR BRILLANTE ──
  ctx.save();
  for (let ring = 0; ring < 3; ring++) {
    const rr = r * breathe * (1 + ring * 0.01);
    const ra = (0.08 - ring * 0.02) + beat * 0.06 + e * 0.04;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const n = Math.sin(a * 4 + time * 2) * r * 0.012 * (1 + e * 2 + beat);
      const px = c2 + Math.cos(a) * (rr + n);
      const py = ch + Math.sin(a) * (rr + n);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === 0 ? rgb([255, 255, 255], ra * 0.5) : rgb(C.g, ra);
    ctx.lineWidth = ring === 0 ? 1.2 : 0.5;
    ctx.stroke();
  }
  ctx.restore();

  // ── NÚCLEO ── 
  const coreR = sw * 0.055 * (1 + beat * 0.15 + e * 0.08) * breathe;
  for (let l = 4; l >= 0; l--) {
    const lr = coreR * (1 + l * 0.7);
    const la = l === 0 ? 0.9 : (0.08 - l * 0.012 + e * 0.05 + beat * 0.04);
    const cg = ctx.createRadialGradient(c2, ch, 0, c2, ch, lr);
    if (l === 0) {
      cg.addColorStop(0, `rgba(255,255,255,1)`);
      cg.addColorStop(0.3, rgb(C.g, 0.95));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      cg.addColorStop(0, rgb(C.g, la));
      cg.addColorStop(0.5, rgb(C.r, la * 0.5));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.beginPath();
    ctx.arc(c2, ch, lr, 0, Math.PI * 2);
    ctx.fillStyle = cg;
    ctx.fill();
  }

  // ── REFLEJO ESPECULAR ──
  const spec = ctx.createRadialGradient(
    c2 - r * 0.25, ch - r * 0.3, 0,
    c2 - r * 0.08, ch - r * 0.08, r * 0.55
  );
  spec.addColorStop(0, 'rgba(255,255,255,0.18)');
  spec.addColorStop(0.4, 'rgba(255,255,255,0.04)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const n = Math.sin(a * 4 + time * 2) * r * 0.012;
    const rr = r * breathe + n;
    const px = c2 + Math.cos(a) * rr, py = ch + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = spec;
  ctx.fill();
}

export function setOrb(s) {
  orbState = s;
  const labels = { idle: 'en espera', listening: 'escuchando', thinking: 'procesando', speaking: 'respondiendo' };
  const el = document.getElementById('orbLbl');
  if (el) {
    el.textContent = labels[s] || 'en espera';
    el.className = 'entity-state' + (s !== 'idle' ? ' active' : '');
  }
  if (s !== 'idle') targetLvl = Math.max(targetLvl, 0.45);
  else setTimeout(() => { if (orbState === 'idle') targetLvl = 0; }, 1500);
}

export function setTargetLevel(v) {
  targetLvl = Math.max(0, Math.min(1, v));
}

export function initOrb() {
  initCanvas();
}