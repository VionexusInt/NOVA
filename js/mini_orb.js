let miniCanvas, miniCtx, miniW, miniH;
let miniState = 'idle';
let miniAudio = 0;
let miniTarget = 0;
let miniTime = 0;

const MINI_COLORS = {
  idle:    { core: [150, 195, 255], glow: 'rgba(74,158,255,0.15)' },
  listening:{ core: [255, 120, 120], glow: 'rgba(255,120,120,0.2)' },
  thinking:{ core: [230, 190, 120], glow: 'rgba(230,190,120,0.2)' },
  speaking:{ core: [140, 230, 180], glow: 'rgba(140,230,180,0.2)' },
  cinematic:{ core: [100, 200, 255], glow: 'rgba(100,200,255,0.25)' }
};

function initMiniOrb() {
  const container = document.getElementById('miniOrb');
  if (!container) return;
  miniCanvas = document.getElementById('miniCanvas');
  if (!miniCanvas) return;
  miniCtx = miniCanvas.getContext('2d');
  resizeMini();
  window.addEventListener('resize', resizeMini);
  requestAnimationFrame(drawMini);
}

function resizeMini() {
  if (!miniCanvas) return;
  const size = 120;
  miniCanvas.width = size * 2;
  miniCanvas.height = size * 2;
  miniCanvas.style.width = size + 'px';
  miniCanvas.style.height = size + 'px';
  miniCtx.setTransform(1, 0, 0, 1, 0, 0);
  miniCtx.scale(2, 2);
  miniW = size;
  miniH = size;
}

function drawMini() {
  requestAnimationFrame(drawMini);
  if (!miniCtx || !miniW) return;
  miniTime += 0.05;
  miniAudio += (miniTarget - miniAudio) * 0.08;

  const cx = miniW / 2;
  const cy = miniH / 2;
  const C = MINI_COLORS[miniState] || MINI_COLORS.idle;
  const e = miniAudio;

  miniCtx.clearRect(0, 0, miniW, miniH);

  // Glow exterior
  const glow = miniCtx.createRadialGradient(cx, cy, 0, cx, cy, miniW * 0.6);
  glow.addColorStop(0, C.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  miniCtx.fillStyle = glow;
  miniCtx.fillRect(0, 0, miniW, miniH);

  // Anillos rotativos
  miniCtx.strokeStyle = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${0.1 + e * 0.15})`;
  miniCtx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const r = 20 + i * 14 + Math.sin(miniTime * 0.5 + i) * 3;
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, r, 0 + miniTime * (0.02 + i * 0.01), Math.PI * 2 + miniTime * (0.02 + i * 0.01));
    miniCtx.stroke();
  }

  // Puntos orbitando
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + miniTime * (0.03 + i * 0.01);
    const r = 32 + Math.sin(miniTime * 0.7 + i * 1.5) * 8;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r * 0.6;
    const pulse = 0.5 + Math.sin(miniTime * 2 + i) * 0.5;
    miniCtx.beginPath();
    miniCtx.arc(x, y, (1.5 + e * 1.5) * pulse, 0, Math.PI * 2);
    miniCtx.fillStyle = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${0.4 + e * 0.4})`;
    miniCtx.fill();
  }

  // Núcleo central
  const coreR = 8 + e * 6 + Math.sin(miniTime * 3) * 1.5;
  for (let l = 2; l >= 0; l--) {
    const lr = coreR * (1 + l * 0.8);
    const la = l === 0 ? 0.9 : (0.15 + e * 0.1);
    const cg = miniCtx.createRadialGradient(cx, cy, 0, cx, cy, lr);
    if (l === 0) {
      cg.addColorStop(0, 'rgba(255,255,255,0.9)');
      cg.addColorStop(0.5, `rgba(${C.core[0]},${C.core[1]},${C.core[2]},0.8)`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      cg.addColorStop(0, `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${la})`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    }
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, lr, 0, Math.PI * 2);
    miniCtx.fillStyle = cg;
    miniCtx.fill();
  }

  // Label de estado
  const label = document.getElementById('miniOrbLabel');
  if (label) {
    const labels = {
      idle: 'en espera',
      listening: 'escuchando',
      thinking: 'procesando',
      speaking: 'respondiendo',
      cinematic: 'sistemas'
    };
    label.textContent = labels[miniState] || '';
    label.style.color = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},0.9)`;
  }
}

export function setMiniOrbState(s) {
  miniState = s;
  const container = document.getElementById('miniOrb');
  if (container) {
    container.classList.toggle('active', s !== 'idle');
  }
  if (s !== 'idle') miniTarget = Math.max(miniTarget, 0.6);
  else setTimeout(() => { if (miniState === 'idle') miniTarget = 0; }, 1200);
}

export function setMiniOrbAudio(v) {
  miniTarget = Math.max(0, Math.min(1, v));
}

export function initMiniOrbSystem() {
  initMiniOrb();
}