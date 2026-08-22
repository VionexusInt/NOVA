import { state } from './state.js';

let updateInterval = null;
let panelEl = null;

const CLIMA_URL = 'https://wttr.in/Elche?format=j1';

async function fetchClima() {
  try {
    const r = await fetch(CLIMA_URL, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    const cur = d.current_condition[0];
    return { temp: cur.temp_C, desc: cur.weatherDesc[0].value, icon: getClimaIcon(cur.weatherDesc[0].value) };
  } catch(e) { return null; }
}

function getClimaIcon(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('sun') || d.includes('clear')) return '☀';
  if (d.includes('overcast')) return '☁';
  if (d.includes('cloud')) return '⛅';
  if (d.includes('rain') || d.includes('drizzle')) return '🌧';
  if (d.includes('thunder')) return '⛈';
  if (d.includes('snow')) return '❄';
  if (d.includes('fog') || d.includes('mist')) return '🌫';
  return '🌤';
}

async function fetchDatos() {
  const datos = {
    hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    fecha: new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
    clima: null,
    ig_seguidores: '—',
    pipeline_total: '—',
    pipeline_firmados: '—',
    tareas_urgentes: 0,
    tareas_total: 0,
    emails_sin_leer: '—',
    proxima_reunion: null,
    comentarios_ig: '—',
    agente_activo: false,
  };

  try {
    const r = await fetch('http://localhost:4000/api/ping', { signal: AbortSignal.timeout(1500) });
    datos.agente_activo = r.ok;
  } catch(e) {}

  datos.clima = await fetchClima();

  const tareas = state.tasks || [];
  datos.tareas_urgentes = tareas.filter(t => !t.done && t.p === 'u').length;
  datos.tareas_total = tareas.filter(t => !t.done).length;

  if (state.pipelineConn) {
    try {
      const { obtenerPipeline } = await import('./pipeline.js');
      const pipeline = await obtenerPipeline();
      datos.pipeline_total = pipeline.length;
      datos.pipeline_firmados = pipeline.filter(p => p.estado?.toLowerCase().includes('firmado')).length;
    } catch(e) {}
  }

  try {
    const { getInsights, getComentariosSinResponder } = await import('./instagram.js');
    const [ig, com] = await Promise.allSettled([getInsights(), getComentariosSinResponder()]);
    if (ig.status === 'fulfilled' && ig.value?.followers_count) datos.ig_seguidores = ig.value.followers_count;
    if (com.status === 'fulfilled') datos.comentarios_ig = com.value.reduce((a, p) => a + p.comentarios.length, 0);
  } catch(e) {}

  if (state.gmailConn) {
    try {
      const { getEmailsNoLeidos } = await import('./gmail.js');
      const emails = await getEmailsNoLeidos(20);
      datos.emails_sin_leer = emails.length;
    } catch(e) {}
  }

  if (state.calConn) {
    try {
      const { getEventosHoy } = await import('./calendar.js');
      const eventos = await getEventosHoy();
      if (eventos.length > 0) {
        const ev = eventos[0];
        const t = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
        datos.proxima_reunion = { hora: t, nombre: ev.summary };
      }
    } catch(e) {}
  }

  return datos;
}

function renderDatos(datos) {
  if (!panelEl) return;

  // Actualizar hora siempre (sin refetch)
  const horaEl = panelEl.querySelector('#cc-hora');
  const fechaEl = panelEl.querySelector('#cc-fecha');
  if (horaEl) horaEl.textContent = datos.hora;
  if (fechaEl) fechaEl.textContent = datos.fecha;

  const set = (id, val) => {
    const el = panelEl.querySelector(id);
    if (el) el.textContent = val ?? '—';
  };
  const setClass = (id, cls) => {
    const el = panelEl.querySelector(id);
    if (el) { el.className = el.className.replace(/cc-ok|cc-warn|cc-err|cc-ig/g, '').trim() + ' ' + cls; }
  };

  if (datos.clima) {
    set('#cc-clima-val', `${datos.clima.icon} ${datos.clima.temp}°C`);
    set('#cc-clima-sub', datos.clima.desc);
  }

  set('#cc-ig', datos.ig_seguidores);
  set('#cc-pipe', `${datos.pipeline_firmados}/${datos.pipeline_total}`);
  set('#cc-tareas', datos.tareas_total > 0 ? `${datos.tareas_urgentes} urgentes / ${datos.tareas_total} total` : 'sin tareas');
  set('#cc-emails', datos.emails_sin_leer);
  set('#cc-reunion', datos.proxima_reunion ? `${datos.proxima_reunion.hora} ${datos.proxima_reunion.nombre}` : 'Sin eventos hoy');
  set('#cc-comentarios', datos.comentarios_ig);
  set('#cc-agente', datos.agente_activo ? '● activo' : '● offline');

  setClass('#cc-agente', datos.agente_activo ? 'cc-val cc-ok' : 'cc-val cc-err');
  setClass('#cc-tareas', datos.tareas_urgentes > 0 ? 'cc-val cc-warn' : 'cc-val');
  setClass('#cc-emails', (parseInt(datos.emails_sin_leer) > 0) ? 'cc-val cc-warn' : 'cc-val');
  setClass('#cc-comentarios', (parseInt(datos.comentarios_ig) > 0) ? 'cc-val cc-warn' : 'cc-val cc-ok');

  const ts = panelEl.querySelector('#cc-ts');
  if (ts) ts.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function crearPanelIntegrado() {
  panelEl = document.createElement('div');
  panelEl.id = 'nova-cc-integrado';
  panelEl.className = 'dashboard-col';
  panelEl.innerHTML = `
    <div class="cc-top-bar">
      <div class="cc-titulo-top">
        <span class="cc-dot-live"></span>
        command center
      </div>
      <div class="cc-ts-wrap">actualizado <span id="cc-ts">—</span></div>
    </div>

    <div class="cc-scroll">
      <div class="cc-seccion">
        <div class="cc-card cc-card-hora">
          <div class="cc-lbl">hora · elche</div>
          <div class="cc-hora-val" id="cc-hora">--:--:--</div>
          <div class="cc-sub" id="cc-fecha">—</div>
        </div>
        <div class="cc-card">
          <div class="cc-lbl">clima</div>
          <div class="cc-val" id="cc-clima-val">—</div>
          <div class="cc-sub" id="cc-clima-sub">cargando</div>
        </div>
        <div class="cc-card">
          <div class="cc-lbl">agente</div>
          <div class="cc-val" id="cc-agente">—</div>
        </div>
      </div>

      <div class="cc-divider-line"></div>

      <div class="cc-seccion-label">bajateapp</div>
      <div class="cc-seccion">
        <div class="cc-card">
          <div class="cc-lbl">seguidores instagram</div>
          <div class="cc-val cc-ig" id="cc-ig">—</div>
          <div class="cc-sub">@bajateapp</div>
        </div>
        <div class="cc-card">
          <div class="cc-lbl">comentarios ig</div>
          <div class="cc-val" id="cc-comentarios">—</div>
          <div class="cc-sub">sin responder</div>
        </div>
      </div>
      <div class="cc-seccion">
        <div class="cc-card">
          <div class="cc-lbl">pipeline negocios</div>
          <div class="cc-val" id="cc-pipe">—</div>
          <div class="cc-sub">firmados / total</div>
        </div>
        <div class="cc-card">
          <div class="cc-lbl">emails</div>
          <div class="cc-val" id="cc-emails">—</div>
          <div class="cc-sub">sin leer</div>
        </div>
      </div>

      <div class="cc-divider-line"></div>

      <div class="cc-seccion-label">hoy</div>
      <div class="cc-card cc-card-full">
        <div class="cc-lbl">próxima reunión</div>
        <div class="cc-val cc-small" id="cc-reunion">cargando...</div>
      </div>
      <div class="cc-card cc-card-full">
        <div class="cc-lbl">tareas</div>
        <div class="cc-val cc-small" id="cc-tareas">cargando...</div>
      </div>
    </div>
  `;

  // Insertar en el DOM dentro del .app, entre entity-col y chat-col
  const app = document.querySelector('.app');
  const chatCol = document.querySelector('.chat-col');
  if (app && chatCol) {
    app.insertBefore(panelEl, chatCol);
  } else {
    document.body.appendChild(panelEl);
  }
}

export async function initCommandCenter() {
  initCommandStyles();
  crearPanelIntegrado();

  // Actualizar hora cada segundo sin hacer fetch
  setInterval(() => {
    const horaEl = panelEl?.querySelector('#cc-hora');
    if (horaEl) horaEl.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);

  // Fetch de datos cada 30 segundos
  const actualizar = async () => {
    const datos = await fetchDatos();
    renderDatos(datos);
  };
  await actualizar();
  updateInterval = setInterval(actualizar, 30000);
}

// Mantener toggleCommandCenter para compatibilidad con el comando de voz
export function toggleCommandCenter() {
  if (panelEl) panelEl.scrollIntoView({ behavior: 'smooth' });
}

export function initCommandStyles() {
  if (document.getElementById('cc-styles')) return;
  const s = document.createElement('style');
  s.id = 'cc-styles';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@800&family=DM+Mono:wght@300;400&family=Fraunces:ital,opsz,wght@0,9..144,300;1,9..144,300&display=swap');

    #nova-cc-integrado {
      display: flex; flex-direction: column;
      overflow: hidden;
      border-left: 1px solid rgba(74,158,255,0.08);
      border-right: 1px solid rgba(74,158,255,0.08);
    }

    .cc-top-bar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 14px 10px;
      border-bottom: 1px solid rgba(74,158,255,0.08);
      flex-shrink: 0;
      background: linear-gradient(180deg, rgba(74,158,255,0.025) 0%, transparent 100%);
    }
    .cc-titulo-top {
      font-family: 'DM Mono', monospace;
      font-size: 8px; letter-spacing: 0.3em; text-transform: uppercase;
      color: rgba(74,158,255,0.55);
      display: flex; align-items: center; gap: 8px;
    }
    .cc-dot-live {
      width: 5px; height: 5px; border-radius: 50%;
      background: #52d68a; box-shadow: 0 0 8px #52d68a;
      animation: ccLive 2s ease-in-out infinite;
    }
    @keyframes ccLive { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .cc-ts-wrap {
      font-family: 'DM Mono', monospace;
      font-size: 7px; letter-spacing: 0.1em;
      color: rgba(140,175,220,0.25);
    }

    .cc-scroll {
      flex: 1; overflow-y: auto; padding: 12px 10px;
      display: flex; flex-direction: column; gap: 6px;
      scrollbar-width: none;
    }
    .cc-scroll::-webkit-scrollbar { display: none; }

    .cc-seccion {
      display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
    }
    .cc-seccion-label {
      font-family: 'DM Mono', monospace;
      font-size: 7px; letter-spacing: 0.25em; text-transform: uppercase;
      color: rgba(74,158,255,0.3);
      padding: 2px 2px 0;
    }
    .cc-divider-line {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(74,158,255,0.1), transparent);
      margin: 2px 0;
    }

    .cc-card {
      background: rgba(74,158,255,0.02);
      border: 1px solid rgba(74,158,255,0.07);
      border-radius: 3px;
      padding: 8px 10px;
      display: flex; flex-direction: column; gap: 3px;
      position: relative; overflow: hidden;
    }
    .cc-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(74,158,255,0.15), transparent);
    }
    .cc-card-full { grid-column: 1 / -1; }
    .cc-card-hora { grid-column: 1 / -1; }

    .cc-lbl {
      font-family: 'DM Mono', monospace;
      font-size: 6.5px; letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(74,158,255,0.4);
    }
    .cc-hora-val {
      font-family: 'Syne', 'DM Mono', monospace;
      font-size: 30px; font-weight: 800; line-height: 1;
      color: rgba(235,242,255,0.95);
      letter-spacing: 0.04em;
      font-variant-numeric: tabular-nums;
    }
    .cc-val {
      font-family: 'Syne', 'DM Mono', monospace;
      font-size: 20px; font-weight: 800; line-height: 1;
      color: rgba(235,242,255,0.92);
      font-variant-numeric: tabular-nums;
    }
    .cc-val.cc-ok { color: rgba(82,214,138,0.9); }
    .cc-val.cc-warn { color: rgba(230,150,90,0.9); }
    .cc-val.cc-err { color: rgba(232,112,112,0.85); font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 400; }
    .cc-val.cc-ig { color: rgba(200,150,255,0.9); }
    .cc-small { font-size: 11px; font-weight: 400; font-family: 'Fraunces', serif; line-height: 1.4; }
    .cc-sub {
      font-family: 'DM Mono', monospace;
      font-size: 6.5px; letter-spacing: 0.1em;
      color: rgba(140,175,220,0.3);
    }
  `;
  document.head.appendChild(s);
}