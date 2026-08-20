let contador = 0;
let indicadorEl = null;

function crearIndicador() {
  if (indicadorEl) return indicadorEl;
  indicadorEl = document.createElement('div');
  indicadorEl.id = 'nova-actividad';
  indicadorEl.innerHTML = `<span class="na-dot"></span><span class="na-texto">procesando</span>`;
  document.body.appendChild(indicadorEl);
  return indicadorEl;
}

export function iniciarActividad() {
  initActividadStyles();
  contador++;
  const el = crearIndicador();
  el.classList.add('activo');
}

export function terminarActividad() {
  contador = Math.max(0, contador - 1);
  if (contador === 0 && indicadorEl) {
    indicadorEl.classList.remove('activo');
  }
}

export function initActividadStyles() {
  if (document.getElementById('na-styles')) return;
  const s = document.createElement('style');
  s.id = 'na-styles';
  s.textContent = `
    #nova-actividad {
      position: fixed;
      top: 18px; left: 50%;
      transform: translateX(-50%) translateY(-12px);
      display: flex; align-items: center; gap: 8px;
      padding: 6px 16px;
      background: rgba(3,6,16,0.92);
      border: 1px solid rgba(74,158,255,0.2);
      border-radius: 20px;
      z-index: 200;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.35s ease, transform 0.35s ease;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    #nova-actividad.activo {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .na-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: rgba(74,158,255,0.9);
      box-shadow: 0 0 8px rgba(74,158,255,0.8);
      animation: naPulse 1s ease-in-out infinite;
    }
    @keyframes naPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.75)} }
    .na-texto {
      font-family: 'DM Mono', monospace;
      font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(200,220,245,0.75);
    }
    @media(max-width: 900px) {
      #nova-actividad { top: 12px; }
    }
  `;
  document.head.appendChild(s);
}