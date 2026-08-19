let canvas, ctx, W, H, cx, cy;
let orbState = 'idle';
let targetLvl = 0;
let audioLvl = 0;
let time = 0;

const LAYERS = 5;
const NODES_PER_LAYER = [6, 10, 14, 10, 6];
let layers = [];
let synapses = [];
let ambientParticles = [];

let heartbeatPhase = 0;
let heartbeatStrength = 0;
let nextBeat = 60;

let rotationY = 0;
let rotationX = 0.15;

function initCanvas() {
  canvas = document.getElementById('novaCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  buildNetwork();
  requestAnimationFrame(draw);
}

function resize() {
  const s = Math.min(window.innerWidth * 0.44, window.innerHeight * 0.65, 480);
  canvas.style.width = s + 'px';
  canvas.style.height = s + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = s * dpr;
  canvas.height = s * dpr;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  cx = W / 2;
  cy = H / 2;
  buildNetwork();
}

function buildNetwork() {
  layers = [];
  synapses = [];
  ambientParticles = [];

  const R = W * 0.36;
  const depth = R * 1.3;

  LAYERS && NODES_PER_LAYER.forEach((count, li) => {
    const nodes = [];
    const layerZ = (li / (LAYERS - 1) - 0.5) * depth;
    const layerR = R * (0.35 + 0.65 * Math.sin((li / (LAYERS - 1)) * Math.PI));

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + li * 0.4;
      const ringVariance = 0.7 + Math.random() * 0.3;
      nodes.push({
        baseAngle: a,
        baseR: layerR * ringVariance,
        z: layerZ + (Math.random() - 0.5) * depth * 0.06,
        y3d: 0, x3d: 0, z3d: 0,
        sx: 0, sy: 0, scale: 1,
        size: 1.4 + Math.random() * 1.8,
        pulse: Math.random() * Math.PI * 2,
        pulseSpd: 0.02 + Math.random() * 0.03,
        signal: 0,
        signalDecay: 0.02 + Math.random() * 0.015,
        layer: li,
        wobble: Math.random() * Math.PI * 2,
      });
    }
    layers.push(nodes);
  });

  for (let li = 0; li < layers.length - 1; li++) {
    const a = layers[li], b = layers[li + 1];
    a.forEach((na, i) => {
      const connCount = 2 + Math.floor(Math.random() * 2);
      const targets = new Set();
      while (targets.size < Math.min(connCount, b.length)) {
        targets.add(Math.floor(Math.random() * b.length));
      }
      targets.forEach(j => {
        synapses.push({
          a: na, b: b[j],
          strength: 0.3 + Math.random() * 0.7,
          active: false,
          pos: 0,
          speed: 0.03 + Math.random() * 0.04,
          cooldown: Math.random() * 100,
        });
      });
    });
  }

  const PARTICLES = 60;
  for (let i = 0; i < PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const el = Math.acos(2 * Math.random() - 1);
    const r = R * 1.15 * (0.85 + Math.random() * 0.3);
    ambientParticles.push({
      baseAngle: a, elevation: el, r,
      driftSpd: (Math.random() - 0.5) * 0.0015,
      size: 0.4 + Math.random() * 0.8,
      alpha: 0.05 + Math.random() * 0.15,
      pulse: Math.random() * Math.PI * 2,
    });
  }
}

function project(x, y, z) {
  const cosY = Math.cos(rotationY), sinY = Math.sin(rotationY);
  const cosX = Math.cos(rotationX), sinX = Math.sin(rotationX);

  let x1 = x * cosY - z * sinY;
  let z1 = x * sinY + z * cosY;
  let y1 = y * cosX - z1 * sinX;
  let z2 = y * sinX + z1 * cosX;

  const perspective = 700;
  const scale = perspective / (perspective + z2);

  return { x: cx + x1 * scale, y: cy + y1 * scale, scale, z: z2 };
}

function getC() {
  switch (orbState) {
    case 'listening': return { core: [255,120,120], mid: [232,90,90], dim: [160,60,60] };
    case 'thinking':  return { core: [230,190,120], mid: [200,160,90], dim: [140,110,60] };
    case 'speaking':  return { core: [140,230,180], mid: [80,200,140], dim: [50,140,95] };
    default:          return { core: [150,195,255], mid: [74,158,255], dim: [40,90,160] };
  }
}
function rgb(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

function draw() {
  requestAnimationFrame(draw);
  if (!ctx || !W) return;

  ctx.clearRect(0, 0, W, H);
  time += 0.006;
  audioLvl += (targetLvl - audioLvl) * 0.05;
  const e = audioLvl;
  const C = getC();

  nextBeat--;
  if (nextBeat <= 0) {
    heartbeatStrength = 0.5 + e * 0.4;
    heartbeatPhase = 0;
    nextBeat = 65 + Math.random() * 35;
  }
  heartbeatPhase += 0.045;
  const beat = heartbeatStrength * Math.max(0, Math.exp(-heartbeatPhase * 0.9) * Math.sin(heartbeatPhase * 5));
  heartbeatStrength = Math.max(0, heartbeatStrength - 0.008);

  rotationY += 0.0022 + e * 0.003;
  rotationX = 0.15 + Math.sin(time * 0.3) * 0.06;

  const R = W * 0.36;

  // ── Ambient depth glow ──
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
  glow.addColorStop(0, rgb(C.mid, 0.025 + beat * 0.03 + e * 0.02));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Ambient particles (background field) ──
  ambientParticles.forEach(p => {
    p.baseAngle += p.driftSpd;
    p.pulse += 0.01;
    const x = Math.sin(p.elevation) * Math.cos(p.baseAngle) * p.r;
    const y = Math.cos(p.elevation) * p.r;
    const z = Math.sin(p.elevation) * Math.sin(p.baseAngle) * p.r;
    const pr = project(x, y, z);
    if (pr.scale <= 0) return;
    const a = p.alpha * (0.5 + Math.sin(p.pulse) * 0.5) * pr.scale;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, p.size * pr.scale, 0, Math.PI * 2);
    ctx.fillStyle = rgb(C.dim, a);
    ctx.fill();
  });

  // ── Project all nodes ──
  layers.forEach(nodes => {
    nodes.forEach(n => {
      n.wobble += 0.008;
      const angle = n.baseAngle + time * 0.15;
      const rOsc = n.baseR * (1 + Math.sin(n.wobble) * 0.04 + beat * 0.05);
      const x = Math.cos(angle) * rOsc;
      const y = Math.sin(angle) * rOsc * 0.55;
      const z = n.z + Math.sin(time * 0.4 + n.wobble) * R * 0.03;
      const pr = project(x, y, z);
      n.sx = pr.x; n.sy = pr.y; n.scale = pr.scale; n.zDepth = pr.z;
    });
  });

  // ── Sort synapses by depth for proper layering ──
  const allNodesFlat = layers.flat();
  const avgZ = n => n.zDepth || 0;

  // ── Draw synapses (behind nodes when z is further) ──
  synapses.forEach(s => {
    const na = s.a, nb = s.b;
    if (na.scale <= 0 || nb.scale <= 0) return;

    const depthFade = Math.min(na.scale, nb.scale);
    const baseAlpha = s.strength * 0.06 * depthFade;

    ctx.beginPath();
    ctx.moveTo(na.sx, na.sy);
    const midX = (na.sx + nb.sx) / 2 + Math.sin(time * 2 + s.pos * 10) * 3;
    const midY = (na.sy + nb.sy) / 2 + Math.cos(time * 2 + s.pos * 10) * 3;
    ctx.quadraticCurveTo(midX, midY, nb.sx, nb.sy);
    ctx.strokeStyle = rgb(C.mid, baseAlpha + na.signal * 0.15 + e * 0.03);
    ctx.lineWidth = (0.4 + na.signal * 1.2) * depthFade;
    ctx.stroke();

    if (s.active) {
      s.pos += s.speed * (1 + e * 0.8);
      if (s.pos >= 1) {
        s.active = false;
        s.pos = 0;
        s.cooldown = 20 + Math.random() * 60;
        nb.signal = Math.min(1, nb.signal + 0.6);
      }
      const t = s.pos;
      const px = na.sx * (1-t)*(1-t) + midX * 2*(1-t)*t + nb.sx * t*t;
      const py = na.sy * (1-t)*(1-t) + midY * 2*(1-t)*t + nb.sy * t*t;
      const pulseSize = (2 + e * 2) * depthFade;

      ctx.beginPath();
      ctx.arc(px, py, pulseSize * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = rgb(C.core, 0.15 * depthFade);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, pulseSize, 0, Math.PI * 2);
      ctx.fillStyle = rgb(C.core, 0.9 * depthFade);
      ctx.fill();
    } else {
      if (s.cooldown > 0) s.cooldown--;
      else if (na.signal > 0.25 && Math.random() < 0.025 * (1 + e * 4 + beat * 3)) {
        s.active = true;
        s.pos = 0;
      }
    }
  });

  // ── Draw nodes sorted by depth (back to front) ──
  const sortedNodes = allNodesFlat.slice().sort((a,b) => a.zDepth - b.zDepth);
  sortedNodes.forEach(n => {
    if (n.scale <= 0) return;
    n.pulse += n.pulseSpd * (1 + e);
    n.signal = Math.max(0, n.signal - n.signalDecay);
    if (Math.random() < 0.0006 * (1 + e * 5 + beat * 4) && n.layer === 2) n.signal = 1;

    const pulseFactor = 0.4 + Math.sin(n.pulse) * 0.35;
    const nodeAlpha = (0.35 + pulseFactor * 0.3 + n.signal * 0.5 + e * 0.15) * n.scale;
    const nodeSize = n.size * n.scale * (1 + n.signal * 0.7 + beat * 0.25 + e * 0.2);

    if (n.signal > 0.15) {
      const g = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, nodeSize * 5);
      g.addColorStop(0, rgb(C.core, n.signal * 0.12 * n.scale));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, nodeSize * 5, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(n.sx, n.sy, nodeSize, 0, Math.PI * 2);
    ctx.fillStyle = n.signal > 0.6 ? rgb([255,255,255], nodeAlpha) : rgb(C.mid, nodeAlpha);
    ctx.fill();

    if (n.scale > 0.85) {
      ctx.beginPath();
      ctx.arc(n.sx, n.sy, nodeSize * 1.8, 0, Math.PI * 2);
      ctx.strokeStyle = rgb(C.core, (0.08 + n.signal * 0.2) * n.scale);
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  });

  // ── Central core — the "consciousness" ──
  const coreR = W * 0.032 * (1 + beat * 0.2 + e * 0.1);
  for (let l = 3; l >= 0; l--) {
    const lr = coreR * (1 + l * 0.9);
    const la = l === 0 ? 1 : (0.1 - l * 0.02 + e * 0.06 + beat * 0.05);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, lr);
    if (l === 0) {
      cg.addColorStop(0, 'rgba(255,255,255,1)');
      cg.addColorStop(0.4, rgb(C.core, 0.95));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      cg.addColorStop(0, rgb(C.core, la));
      cg.addColorStop(0.6, rgb(C.mid, la * 0.4));
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.beginPath();
    ctx.arc(cx, cy, lr, 0, Math.PI * 2);
    ctx.fillStyle = cg;
    ctx.fill();
  }

  // ── Outer field boundary — subtle breathing sphere ──
  ctx.beginPath();
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const wobble = Math.sin(a * 4 + time * 1.5) * R * 0.015 * (1 + e * 2 + beat);
    const rr = R * 1.22 + wobble;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr * 0.85;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = rgb(C.mid, 0.05 + beat * 0.04 + e * 0.03);
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

export function setOrb(s) {
  orbState = s;
  const labels = { idle: 'en espera', listening: 'escuchando', thinking: 'procesando', speaking: 'respondiendo' };
  const el = document.getElementById('orbLbl');
  if (el) {
    el.textContent = labels[s] || 'en espera';
    el.className = 'entity-state' + (s !== 'idle' ? ' active' : '');
  }
  if (s !== 'idle') targetLvl = Math.max(targetLvl, 0.5);
  else setTimeout(() => { if (orbState === 'idle') targetLvl = 0; }, 1500);
}

export function setTargetLevel(v) {
  targetLvl = Math.max(0, Math.min(1, v));
}

export function initOrb() {
  initCanvas();
}