// ── MAPA DE NOTICIAS — Elche ──
// Mapa real (Leaflet + teselas oscuras) con la estética visual de NOVA.
// Se monta dinámicamente, sin tocar index.html.

let leafletCargado = false;
let mapaInstance = null;
let panelEl = null;
let pinesActivos = [];

// Puntos de referencia reales de Elche para distribuir los pines de noticias
const LANDMARKS_ELCHE = [
  { nombre: 'Palmeral de Elche', lat: 38.2669, lng: -0.6997 },
  { nombre: 'Ayuntamiento', lat: 38.2655, lng: -0.6985 },
  { nombre: 'Parque Municipal', lat: 38.2648, lng: -0.6926 },
  { nombre: 'Basílica Santa María', lat: 38.2661, lng: -0.6982 },
  { nombre: 'Estación de tren', lat: 38.2707, lng: -0.7027 },
  { nombre: 'Universidad Miguel Hernández', lat: 38.2789, lng: -0.6866 },
  { nombre: 'Huerto del Cura', lat: 38.2626, lng: -0.6980 },
  { nombre: 'Centro ciudad', lat: 38.2622, lng: -0.6987 },
];

const ELCHE_CENTER = [38.2622, -0.6987];

async function cargarLeaflet() {
  if (leafletCargado) return;
  if (window.L) { leafletCargado = true; return; }

  const cargaConTimeout = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Leaflet (red o CDN bloqueado)'));
    document.head.appendChild(script);
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout cargando Leaflet (6s) — probablemente CDN bloqueado o sin red')), 6000)
  );

  await Promise.race([cargaConTimeout, timeout]);

  leafletCargado = true;
}

function crearPanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'mapa-noticias-panel';
  panelEl.innerHTML = `
    <div class="mne-header">
      <div class="mne-title">
        <span class="mne-dot"></span>
        noticias · elche
      </div>
      <div class="mne-sub">rastreando ubicaciones</div>
    </div>
    <div id="mne-map"></div>
    <div class="mne-scan"></div>
  `;
  document.body.appendChild(panelEl);
  return panelEl;
}

function inicializarMapaLeaflet() {
  if (mapaInstance) {
    mapaInstance.remove();
    mapaInstance = null;
  }

  mapaInstance = window.L.map('mne-map', {
    center: ELCHE_CENTER,
    zoom: 13,
    zoomControl: false,
    attributionControl: false,
    dragging: true,
    scrollWheelZoom: false,
    doubleClickZoom: false,
  });

  // Teselas oscuras estilo "carto dark matter" — gratis, sin API key
  window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    className: 'mne-tiles',
  }).addTo(mapaInstance);

  // Marcador central pulsante — el "corazón" del mapa
  const centroIcon = window.L.divIcon({
    className: 'mne-center-icon',
    html: `<div class="mne-center-pulse"></div><div class="mne-center-dot"></div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
  window.L.marker(ELCHE_CENTER, { icon: centroIcon }).addTo(mapaInstance);
}

function crearPinIcon() {
  return window.L.divIcon({
    className: 'mne-pin-icon',
    html: `<div class="mne-pin"><div class="mne-pin-ring"></div><div class="mne-pin-core"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function limpiarPines() {
  pinesActivos.forEach(({ marker, line }) => {
    if (marker) mapaInstance.removeLayer(marker);
    if (line) mapaInstance.removeLayer(line);
  });
  pinesActivos = [];
}

// Añade un pin con una pequeña animación de aparición + línea conectora al centro
function anadirPin(titulo, index) {
  if (!mapaInstance) return;

  const landmark = LANDMARKS_ELCHE[index % LANDMARKS_ELCHE.length];
  const pos = [landmark.lat, landmark.lng];

  const line = window.L.polyline([ELCHE_CENTER, pos], {
    color: '#4a9eff',
    weight: 1,
    opacity: 0,
    dashArray: '2,4',
  }).addTo(mapaInstance);

  const marker = window.L.marker(pos, { icon: crearPinIcon() }).addTo(mapaInstance);

  const tooltip = window.L.tooltip({
    permanent: true,
    direction: 'top',
    offset: [0, -10],
    className: 'mne-tooltip',
  }).setContent(truncarTitulo(titulo));
  marker.bindTooltip(tooltip);

  // Animación de entrada
  const el = marker.getElement();
  if (el) {
    el.style.opacity = '0';
    el.style.transform += ' scale(0.3)';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.16,1,0.3,1)';
      el.style.opacity = '1';
      el.style.transform = el.style.transform.replace('scale(0.3)', 'scale(1)');
    });
  }

  setTimeout(() => { line.setStyle({ opacity: 0.35 }); }, 100);

  pinesActivos.push({ marker, line });

  // Encuadrar el mapa para que quepan todos los pines
  if (pinesActivos.length > 1) {
    const bounds = window.L.latLngBounds(pinesActivos.map(p => p.marker.getLatLng()).concat([ELCHE_CENTER]));
    mapaInstance.flyToBounds(bounds, { padding: [40, 40], duration: 0.8, maxZoom: 14 });
  }
}

function truncarTitulo(t) {
  if (!t) return '';
  return t.length > 45 ? t.substring(0, 45) + '…' : t;
}

// ── API PÚBLICA ──

export async function mostrarMapaNoticias() {
  try {
    initMapaElcheStyles();
    await cargarLeaflet();
    crearPanel();

    requestAnimationFrame(() => {
      panelEl.classList.add('open');
      setTimeout(() => {
        inicializarMapaLeaflet();
      }, 300);
    });
  } catch (e) {
    console.warn('No se pudo mostrar el mapa de noticias:', e);
  }
}

// Llamar una vez por cada titular que NOVA vaya narrando
export function marcarNoticiaEnMapa(titulo) {
  if (!mapaInstance) return;
  anadirPin(titulo, pinesActivos.length);
}

export function ocultarMapaNoticias() {
  if (!panelEl) return;
  panelEl.classList.remove('open');
  setTimeout(() => {
    limpiarPines();
    if (mapaInstance) { mapaInstance.remove(); mapaInstance = null; }
  }, 600);
}

export function initMapaElcheStyles() {
  if (document.getElementById('mne-styles')) return;
  const s = document.createElement('style');
  s.id = 'mne-styles';
  s.textContent = `
    #mapa-noticias-panel {
      position: fixed;
      top: 50%; right: 32px;
      transform: translateY(-50%) translateX(24px) scale(0.96);
      width: 380px; height: 420px;
      background: linear-gradient(165deg, rgba(5,10,24,0.97) 0%, rgba(2,5,15,0.99) 100%);
      border: 1px solid rgba(74,158,255,0.18);
      border-radius: 6px;
      z-index: 40;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1);
      overflow: hidden;
      box-shadow:
        0 30px 90px rgba(0,0,0,0.7),
        0 0 0 1px rgba(74,158,255,0.06),
        0 0 60px rgba(74,158,255,0.06);
    }
    #mapa-noticias-panel.open {
      opacity: 1;
      transform: translateY(-50%) translateX(0) scale(1);
      pointer-events: auto;
    }

    .mne-header {
      padding: 16px 20px 12px;
      border-bottom: 1px solid rgba(74,158,255,0.1);
      display: flex; flex-direction: column; gap: 3px;
      position: relative; z-index: 2;
      background: linear-gradient(180deg, rgba(74,158,255,0.03) 0%, transparent 100%);
    }
    .mne-title {
      font-family: 'DM Mono', monospace;
      font-size: 9px; letter-spacing: 0.35em; text-transform: uppercase;
      color: rgba(74,158,255,0.6);
      display: flex; align-items: center; gap: 8px;
    }
    .mne-dot {
      width: 4px; height: 4px; border-radius: 50%;
      background: #52d68a;
      box-shadow: 0 0 6px #52d68a;
      animation: mnePulse 2s ease-in-out infinite;
    }
    @keyframes mnePulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .mne-sub {
      font-family: 'DM Mono', monospace;
      font-size: 8px; letter-spacing: 0.2em;
      color: rgba(140,175,220,0.3);
    }

    #mne-map {
      width: 100%; height: calc(100% - 58px);
      filter: saturate(0.7) brightness(0.9);
    }

    .mne-scan {
      position: absolute; top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(74,158,255,0.6), transparent);
      animation: mneScan 4s linear infinite;
      z-index: 3; pointer-events: none;
    }
    @keyframes mneScan {
      0% { top: 58px; opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }

    /* Leaflet overrides — despintar la marca de agua y controles por defecto */
    .leaflet-control-attribution { display: none !important; }
    .leaflet-tile-pane { opacity: 0.85; }

    .mne-center-icon { }
    .mne-center-dot {
      position: absolute; top: 50%; left: 50%;
      width: 8px; height: 8px; margin: -4px 0 0 -4px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 0 10px #4a9eff, 0 0 20px rgba(74,158,255,0.6);
    }
    .mne-center-pulse {
      position: absolute; top: 50%; left: 50%;
      width: 40px; height: 40px; margin: -20px 0 0 -20px;
      border-radius: 50%;
      border: 1px solid rgba(74,158,255,0.5);
      animation: mneCenterPulse 2.5s ease-out infinite;
    }
    @keyframes mneCenterPulse {
      0% { transform: scale(0.3); opacity: 0.8; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    .mne-pin {
      position: relative;
      width: 24px; height: 24px;
    }
    .mne-pin-core {
      position: absolute; top: 50%; left: 50%;
      width: 6px; height: 6px; margin: -3px 0 0 -3px;
      border-radius: 50%;
      background: #7bbfff;
      box-shadow: 0 0 8px #4a9eff;
    }
    .mne-pin-ring {
      position: absolute; top: 50%; left: 50%;
      width: 20px; height: 20px; margin: -10px 0 0 -10px;
      border-radius: 50%;
      border: 1px solid rgba(123,191,255,0.4);
      animation: mnePinRing 2s ease-out infinite;
    }
    @keyframes mnePinRing {
      0% { transform: scale(0.4); opacity: 0.9; }
      100% { transform: scale(1.8); opacity: 0; }
    }

    .mne-tooltip {
      background: rgba(3,6,16,0.95) !important;
      border: 1px solid rgba(74,158,255,0.25) !important;
      border-radius: 3px !important;
      color: rgba(225,235,250,0.9) !important;
      font-family: 'DM Mono', monospace !important;
      font-size: 9px !important;
      letter-spacing: 0.02em !important;
      padding: 5px 9px !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important;
    }
    .mne-tooltip::before { display: none !important; }

    @media(max-width: 900px) {
      #mapa-noticias-panel { display: none; }
    }
  `;
  document.head.appendChild(s);
}