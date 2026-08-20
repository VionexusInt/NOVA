// ── TARJETAS DE TAREAS VOLADORAS ──
// Panel lateral izquierdo (simétrico al mapa de noticias en el derecho).
// Cada tarea pendiente aparece como una tarjeta que "vuela" hacia su posición
// mientras NOVA resume las tareas en voz.

let panelEl = null;
let stackEl = null;

const COLORES_PRIORIDAD = {
  u: { color: 'rgba(232,112,112,0.85)', glow: 'rgba(232,112,112,0.5)', label: 'urgente' },
  h: { color: 'rgba(200,150,90,0.85)', glow: 'rgba(200,150,90,0.4)', label: 'alta' },
  n: { color: 'rgba(74,158,255,0.75)', glow: 'rgba(74,158,255,0.35)', label: 'normal' },
};

function crearPanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'tarjetas-tareas-panel';
  panelEl.innerHTML = `
    <div class="tta-header">
      <div class="tta-title">
        <span class="tta-dot"></span>
        tareas · pendientes
      </div>
      <div class="tta-sub" id="tta-count">cargando</div>
    </div>
    <div class="tta-stack" id="tta-stack"></div>
    <div class="tta-scan"></div>
  `;
  document.body.appendChild(panelEl);
  stackEl = panelEl.querySelector('#tta-stack');
  return panelEl;
}

function crearTarjeta(texto, prioridad) {
  const p = COLORES_PRIORIDAD[prioridad] || COLORES_PRIORIDAD.n;

  const card = document.createElement('div');
  card.className = 'tta-card';
  card.style.setProperty('--tta-color', p.color);
  card.style.setProperty('--tta-glow', p.glow);
  card.innerHTML = `
    <div class="tta-card-bar"></div>
    <div class="tta-card-body">
      <div class="tta-card-text">${escaparHtml(texto)}</div>
      <div class="tta-card-priority">${p.label}</div>
    </div>
  `;
  return card;
}

function escaparHtml(txt) {
  if (!txt) return '';
  return String(txt)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .substring(0, 120);
}

// ── API PÚBLICA ──

export async function mostrarTarjetasTareas(total) {
  initTarjetasStyles();
  crearPanel();

  const countEl = panelEl.querySelector('#tta-count');
  if (countEl) countEl.textContent = `${total} pendiente${total !== 1 ? 's' : ''}`;

  stackEl.innerHTML = '';

  requestAnimationFrame(() => {
    panelEl.classList.add('open');
  });

  await new Promise(r => setTimeout(r, 400));
}

// Se llama una vez por cada tarea real, con un pequeño respiro entre cada una
export function anadirTarjetaTarea(texto, prioridad) {
  if (!stackEl) return;

  const card = crearTarjeta(texto, prioridad);
  card.style.opacity = '0';
  card.style.transform = 'translateX(-40px) scale(0.9)';
  stackEl.appendChild(card);

  requestAnimationFrame(() => {
    card.style.transition = 'opacity 0.5s cubic-bezier(0.16,1,0.3,1), transform 0.5s cubic-bezier(0.16,1,0.3,1)';
    card.style.opacity = '1';
    card.style.transform = 'translateX(0) scale(1)';
  });
}

export function ocultarTarjetasTareas() {
  if (!panelEl) return;
  panelEl.classList.remove('open');
  setTimeout(() => {
    if (stackEl) stackEl.innerHTML = '';
  }, 600);
}

export function initTarjetasStyles() {
  if (document.getElementById('tta-styles')) return;
  const s = document.createElement('style');
  s.id = 'tta-styles';
  s.textContent = `
    #tarjetas-tareas-panel {
      position: fixed;
      top: 50%; left: 32px;
      transform: translateY(-50%) translateX(-24px) scale(0.96);
      width: 320px; max-height: 420px;
      background: linear-gradient(165deg, rgba(5,10,24,0.97) 0%, rgba(2,5,15,0.99) 100%);
      border: 1px solid rgba(74,158,255,0.18);
      border-radius: 6px;
      z-index: 40;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1);
      overflow: hidden;
      display: flex; flex-direction: column;
      box-shadow:
        0 30px 90px rgba(0,0,0,0.7),
        0 0 0 1px rgba(74,158,255,0.06),
        0 0 60px rgba(74,158,255,0.06);
    }
    #tarjetas-tareas-panel.open {
      opacity: 1;
      transform: translateY(-50%) translateX(0) scale(1);
      pointer-events: auto;
    }

    .tta-header {
      padding: 16px 20px 12px;
      border-bottom: 1px solid rgba(74,158,255,0.1);
      display: flex; flex-direction: column; gap: 3px;
      position: relative; z-index: 2;
      background: linear-gradient(180deg, rgba(74,158,255,0.03) 0%, transparent 100%);
      flex-shrink: 0;
    }
    .tta-title {
      font-family: 'DM Mono', monospace;
      font-size: 9px; letter-spacing: 0.35em; text-transform: uppercase;
      color: rgba(74,158,255,0.6);
      display: flex; align-items: center; gap: 8px;
    }
    .tta-dot {
      width: 4px; height: 4px; border-radius: 50%;
      background: #c8965a;
      box-shadow: 0 0 6px #c8965a;
      animation: ttaPulse 2s ease-in-out infinite;
    }
    @keyframes ttaPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .tta-sub {
      font-family: 'DM Mono', monospace;
      font-size: 8px; letter-spacing: 0.2em;
      color: rgba(140,175,220,0.3);
    }

    .tta-stack {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
      display: flex; flex-direction: column; gap: 8px;
      scrollbar-width: thin;
      scrollbar-color: rgba(74,158,255,0.15) transparent;
    }
    .tta-stack::-webkit-scrollbar { width: 2px; }
    .tta-stack::-webkit-scrollbar-thumb { background: rgba(74,158,255,0.15); }

    .tta-card {
      display: flex;
      background: rgba(74,158,255,0.03);
      border: 1px solid rgba(74,158,255,0.08);
      border-radius: 3px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    }
    .tta-card-bar {
      width: 3px; flex-shrink: 0;
      background: var(--tta-color);
      box-shadow: 0 0 10px var(--tta-glow);
    }
    .tta-card-body {
      flex: 1;
      padding: 10px 12px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .tta-card-text {
      font-family: 'Fraunces', serif;
      font-size: 12.5px; font-weight: 400; line-height: 1.4;
      color: rgba(225,235,250,0.9);
    }
    .tta-card-priority {
      font-family: 'DM Mono', monospace;
      font-size: 7px; letter-spacing: 0.2em; text-transform: uppercase;
      color: var(--tta-color);
      opacity: 0.8;
    }

    .tta-scan {
      position: absolute; top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(200,150,90,0.5), transparent);
      animation: ttaScan 4s linear infinite;
      z-index: 3; pointer-events: none;
    }
    @keyframes ttaScan {
      0% { top: 58px; opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }

    @media(max-width: 900px) {
      #tarjetas-tareas-panel { display: none; }
    }
  `;
  document.head.appendChild(s);
}