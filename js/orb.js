let canvas, ctx, W, H, cx, cy;
let orbState = 'idle';
let targetLvl = 0;
let audioLvl = 0;
let time = 0;
let animFrame = null;

// Neural network nodes
const NODES = 80;
const CONNECTIONS = 120;
let nodes = [];
let connections = [];

// Waveform data
let waveData = new Array(64).fill(0);
let waveTarget = new Array(64).fill(0);

function initCanvas() {
  canvas = document.getElementById('novaCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  initNodes();
  draw();
}

function resize() {
  const size = canvas.clientWidth * window.devicePixelRatio;
  canvas.width = size;
  canvas.height = size;
  W = canvas.width;
  H = canvas.height;
  cx = W / 2;
  cy = H / 2;
  initNodes();
}

function initNodes() {
  nodes = [];
  connections = [];
  const R = W * 0.42;

  for (let i = 0; i < NODES; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = R * (0.1 + Math.pow(Math.random(), 0.6) * 0.9);

    nodes.push({
      x: cx + r * Math.sin(phi) * Math.cos(theta),
      y: cy + r * Math.sin(phi) * Math.sin(theta),
      bx: cx + r * Math.sin(phi) * Math.cos(theta),
      by: cy + r * Math.sin(phi) * Math.sin(theta),
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: r,
      theta: theta,
      phi: phi,
      size: 0.8 + Math.random() * 2,
      pulse: Math.random() * Math.PI * 2,
      pulseSpd: 0.01 + Math.random() * 0.03,
      active: Math.random() > 0.6,
      layer: Math.floor(Math.random() * 3),
      signal: 0,
      signalSpd: 0,
    });
  }

  for (let i = 0; i < CONNECTIONS; i++) {
    const a = Math.floor(Math.random() * NODES);
    let b = Math.floor(Math.random() * NODES);
    while (b === a) b = Math.floor(Math.random() * NODES);
    const dist = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
    if (dist < W * 0.35) {
      connections.push({ a, b, strength: Math.random(), signal: 0, signalPos: 0, active: false, cooldown: 0 });
    }
  }
}

function getColors() {
  switch (orbState) {
    case 'listening': return { node: [232, 112, 112], conn: [232, 112, 112], wave: [232, 112, 112], center: [255, 140, 140] };
    case 'thinking':  return { node: [200, 168, 130], conn: [200, 168, 130], wave: [200, 168, 130], center: [220, 190, 150] };
    case 'speaking':  return { node: [168, 216, 176], conn: [168, 216, 176], wave: [168, 216, 176], center: [190, 230, 200] };
    default:          return { node: [126, 184, 255], conn: [126, 184, 255], wave: [126, 184, 255], center: [160, 200, 255] };
  }
}

function rgba(c, a) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function draw() {
  animFrame = requestAnimationFrame(draw);
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);
  time += 0.008;
  audioLvl += (targetLvl - audioLvl) * 0.05;
  const e = audioLvl;
  const C = getColors();
  const R = W * 0.42;

  // Update waveform
  for (let i = 0; i < 64; i++) {
    waveTarget[i] = (Math.sin(time * 2 + i * 0.3) * 0.3 + Math.random() * 0.2) * (0.3 + e * 0.7);
    waveData[i] += (waveTarget[i] - waveData[i]) * 0.15;
  }

  // ── DEEP AURA ──
  const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4);
  aura.addColorStop(0, rgba(C.center, 0.04 + e * 0.06));
  aura.addColorStop(0.5, rgba(C.node, 0.02 + e * 0.03));
  aura.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2);
  ctx.fillStyle = aura;
  ctx.fill();

  // ── BREATHING BOUNDARY ──
  const breathe = 1 + Math.sin(time * 0.7) * 0.02;
  for (let ring = 3; ring >= 0; ring--) {
    const rr = R * breathe * (0.85 + ring * 0.05);
    const alpha = (0.03 - ring * 0.006) + e * 0.02;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const a = (i / 100) * Math.PI * 2;
      const noise = Math.sin(a * 5 + time + ring) * R * 0.018 * (1 + e * 2)
                  + Math.sin(a * 11 - time * 1.3 + ring) * R * 0.008;
      const px = cx + Math.cos(a) * (rr + noise);
      const py = cy + Math.sin(a) * (rr + noise);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(C.node, alpha);
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // ── WAVEFORM RING ──
  if (orbState !== 'idle' || e > 0.05) {
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2 - Math.PI / 2;
      const wIdx = i % 64;
      const wave = waveData[wIdx] * R * 0.18;
      const rr2 = R * 0.88 * breathe;
      const px = cx + Math.cos(a) * (rr2 + wave);
      const py = cy + Math.sin(a) * (rr2 + wave);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = rgba(C.wave, 0.2 + e * 0.3);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ── UPDATE NODES ──
  nodes.forEach((n, i) => {
    n.pulse += n.pulseSpd * (1 + e);
    // Slow organic drift
    n.theta += 0.001 * (i % 2 === 0 ? 1 : -1) * (1 + e * 0.5);
    n.phi += 0.0008 * Math.sin(time + i) * (1 + e * 0.3);
    const r = n.r * (1 + Math.sin(time * 0.5 + i) * 0.02 + e * 0.08);
    n.x = cx + r * Math.sin(n.phi) * Math.cos(n.theta);
    n.y = cy + r * Math.sin(n.phi) * Math.sin(n.theta);

    // Signal propagation
    if (n.signal > 0) {
      n.signal -= 0.03;
      if (n.signal < 0) n.signal = 0;
    }

    // Random activations
    if (Math.random() < 0.001 * (1 + e * 5)) {
      n.signal = 1;
    }
  });

  // ── CONNECTIONS ──
  connections.forEach(conn => {
    const na = nodes[conn.a];
    const nb = nodes[conn.b];
    const dist = Math.hypot(na.x - nb.x, na.y - nb.y);

    if (dist > W * 0.38) return;

    const baseAlpha = (1 - dist / (W * 0.38)) * 0.06 * conn.strength;
    const signalBoost = (na.signal + nb.signal) * 0.15;

    // Base connection line
    ctx.beginPath();
    ctx.moveTo(na.x, na.y);
    ctx.lineTo(nb.x, nb.y);
    ctx.strokeStyle = rgba(C.conn, baseAlpha + signalBoost + e * 0.05);
    ctx.lineWidth = 0.5 + signalBoost * 2;
    ctx.stroke();

    // Signal pulse traveling along connection
    if (conn.active) {
      conn.signalPos += 0.04 * (1 + e);
      if (conn.signalPos >= 1) {
        conn.active = false;
        conn.signalPos = 0;
        conn.cooldown = 30 + Math.random() * 60;
        nodes[conn.b].signal = Math.min(1, nodes[conn.b].signal + 0.5);
      }
      const px = na.x + (nb.x - na.x) * conn.signalPos;
      const py = na.y + (nb.y - na.y) * conn.signalPos;
      ctx.beginPath();
      ctx.arc(px, py, 2 + e * 2, 0, Math.PI * 2);
      ctx.fillStyle = rgba(C.center, 0.7 + e * 0.3);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 5 + e * 4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(C.center, 0.15);
      ctx.fill();
    } else {
      if (conn.cooldown > 0) conn.cooldown--;
      else if (na.signal > 0.3 && Math.random() < 0.02 * (1 + e * 3)) {
        conn.active = true;
        conn.signalPos = 0;
      }
    }
  });

  // ── NODES ──
  nodes.forEach((n, i) => {
    const pulseFactor = 0.5 + Math.sin(n.pulse) * 0.5;
    const isActive = n.signal > 0.1;
    const alpha = (0.15 + pulseFactor * 0.2 + n.signal * 0.5 + e * 0.2) * (n.layer === 0 ? 0.6 : n.layer === 1 ? 0.85 : 1);
    const size = n.size * (1 + n.signal * 0.8 + e * 0.3) * (n.layer === 2 ? 1.3 : 1);

    if (isActive) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, size * 4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(C.node, n.signal * 0.08);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
    ctx.fillStyle = rgba(C.node, alpha);
    ctx.fill();
  });

  // ── CENTER CORE ──
  const coreR = W * 0.06 * breathe * (1 + e * 0.15);
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3);
  coreGrad.addColorStop(0, rgba(C.center, 0.12 + e * 0.1));
  coreGrad.addColorStop(0.5, rgba(C.node, 0.04 + e * 0.04));
  coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, coreR * 3, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  // Center point
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5 + e * 2, 0, Math.PI * 2);
  ctx.fillStyle = rgba(C.center, 0.6 + e * 0.4);
  ctx.fill();
}

export function setOrb(s) {
  orbState = s;
  const labels = { idle: 'EN ESPERA', listening: 'ESCUCHANDO', thinking: 'PROCESANDO', speaking: 'RESPONDIENDO' };
  const el = document.getElementById('orbLbl');
  if (el) el.textContent = labels[s] || 'EN ESPERA';
  if (s !== 'idle') targetLvl = Math.max(targetLvl, 0.4);
  else { setTimeout(() => { if (orbState === 'idle') targetLvl = 0; }, 1000); }
}

export function setTargetLevel(v) {
  targetLvl = Math.max(0, Math.min(1, v));
}

export function initOrb() {
  initCanvas();
}