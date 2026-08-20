/* ============================================================
   MINI ORB — Ventana flotante Picture-in-Picture
   Se activa al minimizar el navegador. Renderiza un canvas
   que se captura como MediaStream y se muestra en PiP.
   ============================================================ */

let pipVideo = null;
let pipCanvas = null;
let pipCtx = null;
let pipStream = null;
let pipActive = false;
let pipTime = 0;
let pipState = 'idle';
let pipAudio = 0;
let pipTarget = 0;
let pipW = 320;
let pipH = 180;
let pipRAF = null;

const PIP_COLORS = {
  idle:     { core: [150, 195, 255], glow: 'rgba(74,158,255,0.12)', ring: 'rgba(74,158,255,0.08)' },
  listening:{ core: [255, 120, 120], glow: 'rgba(255,120,120,0.15)', ring: 'rgba(255,120,120,0.1)' },
  thinking: { core: [230, 190, 120], glow: 'rgba(230,190,120,0.15)', ring: 'rgba(230,190,120,0.1)' },
  speaking: { core: [140, 230, 180], glow: 'rgba(140,230,180,0.15)', ring: 'rgba(140,230,180,0.1)' },
  cinematic:{ core: [100, 200, 255], glow: 'rgba(100,200,255,0.2)',  ring: 'rgba(100,200,255,0.15)' }
};

const PIP_LABELS = {
  idle: 'en espera',
  listening: 'escuchando',
  thinking: 'procesando',
  speaking: 'respondiendo',
  cinematic: 'sistemas activos'
};

/* ── Inicialización ── */
export function initMiniOrbSystem() {
  pipCanvas = document.createElement('canvas');
  pipCanvas.width = pipW;
  pipCanvas.height = pipH;
  pipCanvas.style.position = 'fixed';
  pipCanvas.style.left = '-9999px';
  pipCanvas.style.top = '-9999px';
  document.body.appendChild(pipCanvas);
  pipCtx = pipCanvas.getContext('2d');

  pipVideo = document.createElement('video');
  pipVideo.style.position = 'fixed';
  pipVideo.style.left = '-9999px';
  pipVideo.style.top = '-9999px';
  pipVideo.autoplay = true;
  pipVideo.muted = true;
  pipVideo.playsInline = true;
  document.body.appendChild(pipVideo);

  pipStream = pipCanvas.captureStream(30);
  pipVideo.srcObject = pipStream;

  document.addEventListener('visibilitychange', onVisibilityChange);
  pipRAF = requestAnimationFrame(drawPipLoop);
}

/* ── Visibilidad del documento ── */
function onVisibilityChange() {
  if (document.hidden && pipState !== 'idle') {
    enterPip();
  } else if (!document.hidden && pipActive) {
    exitPip();
  }
}

/* ── Entrar en Picture-in-Picture ── */
async function enterPip() {
  if (pipActive) return;
  if (!document.pictureInPictureEnabled) {
    console.warn('[MiniOrb] PiP no soportado');
    return;
  }
  try {
    await pipVideo.requestPictureInPicture();
    pipActive = true;
  } catch (err) {
    console.warn('[MiniOrb] Error PiP:', err);
  }
}

/* ── Salir de Picture-in-Picture ── */
async function exitPip() {
  if (!pipActive) return;
  try {
    if (document.pictureInPictureElement === pipVideo) {
      await document.exitPictureInPicture();
    }
    pipActive = false;
  } catch (err) {
    console.warn('[MiniOrb] Error saliendo PiP:', err);
  }
}

/* ── Loop de renderizado ── */
function drawPipLoop() {
  pipRAF = requestAnimationFrame(drawPipLoop);
  if (!pipCtx) return;

  pipTime += 0.04;
  pipAudio += (pipTarget - pipAudio) * 0.06;
  const e = pipAudio;
  const C = PIP_COLORS[pipState] || PIP_COLORS.idle;
  const cx = pipW / 2;
  const cy = pipH / 2;

  pipCtx.fillStyle = '#01020a';
  pipCtx.fillRect(0, 0, pipW, pipH);

  const glow = pipCtx.createRadialGradient(cx, cy, 0, cx, cy, pipW * 0.45);
  glow.addColorStop(0, C.glow);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  pipCtx.fillStyle = glow;
  pipCtx.fillRect(0, 0, pipW, pipH);

  pipCtx.strokeStyle = C.ring;
  pipCtx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const r = 28 + i * 16 + Math.sin(pipTime * 0.4 + i * 1.3) * 4;
    const alpha = 0.06 + e * 0.08 + Math.sin(pipTime * 0.6 + i) * 0.03;
    pipCtx.strokeStyle = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${alpha})`;
    pipCtx.beginPath();
    const startAngle = pipTime * (0.015 + i * 0.008);
    const endAngle = startAngle + Math.PI * 1.6;
    pipCtx.arc(cx, cy, r, startAngle, endAngle);
    pipCtx.stroke();
  }

  const nodeCount = 8;
  for (let i = 0; i < nodeCount; i++) {
    const angle = (i / nodeCount) * Math.PI * 2 + pipTime * (0.025 + i * 0.005);
    const r = 42 + Math.sin(pipTime * 0.5 + i * 2.1) * 12;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r * 0.55;
    const pulse = 0.4 + Math.sin(pipTime * 2.5 + i) * 0.4;
    const size = (2 + e * 2.5) * pulse;
    const alpha = 0.35 + e * 0.35 + Math.sin(pipTime * 3 + i) * 0.15;

    const ng = pipCtx.createRadialGradient(x, y, 0, x, y, size * 4);
    ng.addColorStop(0, `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${alpha * 0.3})`);
    ng.addColorStop(1, 'rgba(0,0,0,0)');
    pipCtx.fillStyle = ng;
    pipCtx.beginPath();
    pipCtx.arc(x, y, size * 4, 0, Math.PI * 2);
    pipCtx.fill();

    pipCtx.beginPath();
    pipCtx.arc(x, y, size, 0, Math.PI * 2);
    pipCtx.fillStyle = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${alpha})`;
    pipCtx.fill();
  }

  if (e > 0.1) {
    pipCtx.strokeStyle = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${0.04 + e * 0.06})`;
    pipCtx.lineWidth = 0.5;
    for (let i = 0; i < nodeCount; i++) {
      const a1 = (i / nodeCount) * Math.PI * 2 + pipTime * (0.025 + i * 0.005);
      const r1 = 42 + Math.sin(pipTime * 0.5 + i * 2.1) * 12;
      const x1 = cx + Math.cos(a1) * r1;
      const y1 = cy + Math.sin(a1) * r1 * 0.55;
      for (let j = i + 2; j < nodeCount; j += 3) {
        const a2 = (j / nodeCount) * Math.PI * 2 + pipTime * (0.025 + j * 0.005);
        const r2 = 42 + Math.sin(pipTime * 0.5 + j * 2.1) * 12;
        const x2 = cx + Math.cos(a2) * r2;
        const y2 = cy + Math.sin(a2) * r2 * 0.55;
        pipCtx.beginPath();
        pipCtx.moveTo(x1, y1);
        pipCtx.lineTo(x2, y2);
        pipCtx.stroke();
      }
    }
  }

  const beat = Math.sin(pipTime * 4) * 0.5 + 0.5;
  const coreR = 10 + e * 8 + beat * 2;
  for (let l = 2; l >= 0; l--) {
    const lr = coreR * (1 + l * 0.9);
    const la = l === 0 ? 0.95 : (0.12 + e * 0.1 + beat * 0.05);
    const cg = pipCtx.createRadialGradient(cx, cy, 0, cx, cy, lr);
    if (l === 0) {
      cg.addColorStop(0, 'rgba(255,255,255,0.95)');
      cg.addColorStop(0.4, `rgba(${C.core[0]},${C.core[1]},${C.core[2]},0.85)`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      cg.addColorStop(0, `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${la})`);
      cg.addColorStop(0.7, `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${la * 0.3})`);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
    }
    pipCtx.beginPath();
    pipCtx.arc(cx, cy, lr, 0, Math.PI * 2);
    pipCtx.fillStyle = cg;
    pipCtx.fill();
  }

  pipCtx.font = '11px "DM Mono", monospace';
  pipCtx.textAlign = 'center';
  pipCtx.textBaseline = 'middle';
  const label = PIP_LABELS[pipState] || '';
  const labelY = pipH - 18;
  pipCtx.fillStyle = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},0.7)`;
  pipCtx.fillText(label.toUpperCase(), cx, labelY);

  const lineW = 60 + e * 40;
  pipCtx.strokeStyle = `rgba(${C.core[0]},${C.core[1]},${C.core[2]},${0.15 + e * 0.15})`;
  pipCtx.lineWidth = 1;
  pipCtx.beginPath();
  pipCtx.moveTo(cx - lineW / 2, labelY + 12);
  pipCtx.lineTo(cx + lineW / 2, labelY + 12);
  pipCtx.stroke();
}

/* ── API pública ── */
export function setMiniOrbState(s) {
  pipState = s;
  if (s !== 'idle') {
    pipTarget = Math.max(pipTarget, 0.5);
    if (document.hidden && !pipActive) enterPip();
  } else {
    setTimeout(() => {
      if (pipState === 'idle') {
        pipTarget = 0;
        if (pipActive) exitPip();
      }
    }, 1500);
  }
}

export function setMiniOrbAudio(v) {
  pipTarget = Math.max(0, Math.min(1, v));
}

export async function toggleMiniOrbPip() {
  if (pipActive) await exitPip();
  else { pipTarget = 0.6; await enterPip(); }
}