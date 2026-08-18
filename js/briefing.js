import { groqChat } from './api.js';
import { state } from './state.js';
import { formatearMemoria } from './api.js';
import { getResumenCalendario, calendarDisponible, getEventosHoy } from './calendar.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';

// ── SECCIONES DEL DIGEST (inspirado en OpenJarvis morning_digest) ──
// Orden: salud/estado → tareas → calendario → noticias mundo
// Cada sección se genera y muestra de forma independiente

async function seccionEstado(momento, memEst, memTexto) {
  const r = await groqChat([{
    role: 'system',
    content: `Eres NOVA, IA personal estilo JARVIS. Es por la ${momento}.
1 frase de estado del sistema. Frío, preciso. Sin saludos. Sin relleno.
Ejemplo: "Sistemas activos. 3 tareas pendientes. Batería al 80%."
Si sabes el nombre del usuario, úsalo.`
  }, {
    role: 'user',
    content: memEst || memTexto || 'Sin datos del usuario.'
  }], 'openai/gpt-oss-20b', 60);
  return r.trim();
}

async function seccionTareas(tareas, urgentes) {
  if (tareas.length === 0) return null;
  const lista = tareas.slice(0, 5).map((t, i) => `${i + 1}. ${t.text}${t.p === 'u' ? ' [URGENTE]' : ''}`).join('\n');
  const r = await groqChat([{
    role: 'system',
    content: `Eres NOVA, IA JARVIS. Resume estas tareas en 1-2 frases. 
Menciona urgentes primero. Sin listas. Sin viñetas. Directo.`
  }, {
    role: 'user',
    content: lista
  }], 'openai/gpt-oss-20b', 80);
  return r.trim();
}

async function seccionCalendario(eventosHoy, calendarioInfo) {
  if (!calendarioInfo && eventosHoy.length === 0) return null;
  const eventos = eventosHoy.slice(0, 3).map(ev => {
    const s = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
    const hora = s ? s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    return `${hora ? hora + ' — ' : ''}${ev.summary}`;
  }).join('\n');
  const r = await groqChat([{
    role: 'system',
    content: `Eres NOVA, IA JARVIS. Informa sobre la agenda en 1-2 frases. 
Menciona el próximo evento y hora. Sin listas. Directo.`
  }, {
    role: 'user',
    content: eventos || calendarioInfo
  }], 'openai/gpt-oss-20b', 80);
  return r.trim();
}

async function seccionMundo(memEst, memTexto) {
  const contexto = memEst || memTexto;
  const prompt = contexto
    ? `Busca 3 noticias de hoy relevantes para este usuario:\n${contexto.substring(0, 400)}\nPrioriza su sector y economía española. 2-3 frases total.`
    : 'Busca las 2-3 noticias más importantes de España hoy. 2-3 frases total.';

  const r = await groqChat([{
    role: 'system',
    content: 'Eres NOVA, IA JARVIS. Informa de noticias relevantes en 2-3 frases. Sin listas. Datos concretos de hoy.'
  }, {
    role: 'user',
    content: prompt
  }], 'compound-beta', 200);
  return r.trim();
}

async function seccionClima(memEst, memTexto) {
  const ctx = memEst || memTexto || '';
  const ciudad = ctx.includes('Elche') ? 'Elche' : ctx.includes('Alicante') ? 'Alicante' : ctx.includes('Madrid') ? 'Madrid' : ctx.includes('Barcelona') ? 'Barcelona' : null;
  if (!ciudad) return null;

  const r = await groqChat([{
    role: 'system',
    content: 'Eres NOVA. Informa el tiempo en 1 frase. Temperatura actual, estado y si va a llover. Sin relleno.'
  }, {
    role: 'user',
    content: `¿Tiempo actual en ${ciudad} hoy?`
  }], 'compound-beta', 80);
  return r.trim();
}

// ── BRIEFING PANEL (botón en panel) ──
export async function genBriefing() {
  const panel = document.getElementById('briefingPanel');
  if (!panel) return;

  panel.innerHTML = `<div class="brief-loading">
    <div class="brief-pulse">generando briefing</div>
    <div class="brief-dots"><span></span><span></span><span></span></div>
  </div>`;

  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');

  let eventosHoy = [], calendarioInfo = '';
  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch (e) {}
    try { calendarioInfo = await getResumenCalendario(); } catch (e) {}
  }

  // Generar todas las secciones en paralelo
  const [estado, tareasTxt, calTxt, mundoTxt, climaTxt] = await Promise.allSettled([
    seccionEstado(momento, memEst, memTexto),
    seccionTareas(tareas, urgentes),
    seccionCalendario(eventosHoy, calendarioInfo),
    seccionMundo(memEst, memTexto),
    seccionClima(memEst, memTexto)
  ]);

  const get = r => r.status === 'fulfilled' && r.value ? r.value : null;

  panel.innerHTML = buildPanelHTML({
    momento,
    hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    fecha: new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
    estado: get(estado),
    tareas: get(tareasTxt),
    nTareas: tareas.length,
    nUrgentes: urgentes.length,
    calendario: get(calTxt),
    mundo: get(mundoTxt),
    clima: get(climaTxt),
    eventosHoy,
    urgentes
  });
}

function buildPanelHTML({ momento, hora, fecha, estado, tareas, nTareas, nUrgentes, calendario, mundo, clima, eventosHoy, urgentes }) {
  const iconoMomento = momento === 'mañana' ? '◐' : momento === 'tarde' ? '◑' : '●';

  return `<div class="brief-wrap">

    <div class="brief-top">
      <div>
        <div class="brief-momento">${iconoMomento} ${momento.toUpperCase()}</div>
        ${estado ? `<div class="brief-estado">${estado}</div>` : ''}
      </div>
      <div class="brief-right">
        <div class="brief-hora">${hora}</div>
        <div class="brief-fecha">${fecha}</div>
      </div>
    </div>

    ${urgentes.length > 0 ? `
    <div class="brief-section">
      <div class="brief-section-label urgent-label">⚡ urgente</div>
      <div class="brief-urgent-list">
        ${urgentes.slice(0, 3).map(t => `<div class="brief-urgent-item">${t.text}</div>`).join('')}
      </div>
    </div>` : ''}

    ${tareas ? `
    <div class="brief-section">
      <div class="brief-section-label">tareas · ${nTareas} pendiente${nTareas !== 1 ? 's' : ''}</div>
      <div class="brief-text">${tareas}</div>
    </div>` : ''}

    ${calendario ? `
    <div class="brief-section">
      <div class="brief-section-label">agenda</div>
      <div class="brief-text">${calendario}</div>
      ${eventosHoy.length > 0 ? `
      <div class="brief-events">
        ${eventosHoy.slice(0, 3).map(ev => {
          const s = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
          const t = s ? s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';
          return `<div class="brief-event"><span class="brief-event-time">${t}</span><span>${ev.summary}</span></div>`;
        }).join('')}
      </div>` : ''}
    </div>` : ''}

    ${clima ? `
    <div class="brief-section">
      <div class="brief-section-label">clima</div>
      <div class="brief-text">${clima}</div>
    </div>` : ''}

    ${mundo ? `
    <div class="brief-section">
      <div class="brief-section-label">mundo · hoy</div>
      <div class="brief-text">${mundo}</div>
    </div>` : ''}

    <div class="brief-footer">
      <span>nova digest</span>
      <span>${new Date().toLocaleTimeString('es-ES')}</span>
    </div>

  </div>`;
}

// ── BRIEFING AUTOMÁTICO AL ARRANCAR (estilo OpenJarvis morning_digest) ──
// Genera cada sección de forma secuencial y la va mostrando + hablando
export async function briefingAutomatico() {
  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');

  let eventosHoy = [], calendarioInfo = '';
  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch (e) {}
    try { calendarioInfo = await getResumenCalendario(); } catch (e) {}
  }

  const mostrar = (texto) => {
    if (!texto) return;
    addMsg('nova', texto);
  };

  const hablar = (texto) => {
    if (!texto || !state.audioOn) return;
    speak(texto);
  };

  const mostrarYHablar = async (texto, delay = 0) => {
    if (!texto) return;
    if (delay) await new Promise(r => setTimeout(r, delay));
    mostrar(texto);
    hablar(texto);
    await new Promise(r => setTimeout(r, 1200));
  };

  try {
    // SECCIÓN 1 — Estado del sistema (inmediato)
    const estado = await seccionEstado(momento, memEst, memTexto);
    await mostrarYHablar(estado);

    // SECCIÓN 2 — Tareas urgentes (si las hay)
    if (urgentes.length > 0) {
      const tareasTxt = await seccionTareas(tareas, urgentes);
      await mostrarYHablar(tareasTxt, 800);
    }

    // SECCIÓN 3 — Calendario (si está conectado)
    if (eventosHoy.length > 0 || calendarioInfo) {
      const calTxt = await seccionCalendario(eventosHoy, calendarioInfo);
      await mostrarYHablar(calTxt, 600);
    }

    // SECCIÓN 4 — Clima (en paralelo con noticias mientras el usuario lee lo anterior)
    const [climaTxt, mundoTxt] = await Promise.all([
      seccionClima(memEst, memTexto),
      seccionMundo(memEst, memTexto)
    ]);

    await mostrarYHablar(climaTxt, 400);
    await mostrarYHablar(mundoTxt, 600);

  } catch (e) {
    console.warn('briefingAutomatico error:', e);
    mostrar(`Sistemas activos. Buenos ${momento}.`);
  }
}