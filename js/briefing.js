import { groqChat } from './api.js';
import { state } from './state.js';
import { formatearMemoria } from './api.js';
import { getResumenCalendario, calendarDisponible, getEventosHoy } from './calendar.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';

async function seccionEstado(momento) {
  try {
    const r = await groqChat([
      { role: 'system', content: `Eres NOVA, IA estilo JARVIS. Es por la ${momento}. Da una frase corta y precisa de estado del sistema. Sin saludos.` },
      { role: 'user', content: 'Estado' }
    ], 'openai/gpt-oss-20b', 40);
    return r.trim();
  } catch {
    return 'Sistemas operativos al cien por ciento.';
  }
}

async function seccionTareas(tareas) {
  if (!tareas || tareas.length === 0) return null;
  try {
    const lista = tareas.slice(0, 3).map(t => t.text).join('; ');
    const r = await groqChat([
      { role: 'system', content: 'Resume estas tareas en una sola frase directa y clara.' },
      { role: 'user', content: lista }
    ], 'openai/gpt-oss-20b', 50);
    return r.trim();
  } catch {
    return `${tareas.length} tareas pendientes en cola.`;
  }
}

async function seccionCalendario(eventos) {
  if (!eventos || eventos.length === 0) return null;
  try {
    const ev = eventos[0];
    const hora = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    return `Próximo evento: ${ev.summary}${hora ? ' a las ' + hora : ''}.`;
  } catch {
    return null;
  }
}

async function seccionMundo() {
  try {
    const r = await groqChat([
      { role: 'system', content: 'Informa de una noticia clave en España hoy en una sola frase.' },
      { role: 'user', content: 'Noticia' }
    ], 'openai/gpt-oss-20b', 60);
    return r.trim();
  } catch {
    return null;
  }
}

async function seccionClima() {
  try {
    const r = await groqChat([
      { role: 'system', content: 'Informa el tiempo en Elche hoy en una frase breve.' },
      { role: 'user', content: 'Clima' }
    ], 'openai/gpt-oss-20b', 40);
    return r.trim();
  } catch {
    return 'Condiciones meteorológicas estables.';
  }
}

export async function genBriefing() {
  const panel = document.getElementById('briefingPanel');
  if (!panel) return;

  panel.innerHTML = `<div class="brief-loading"><div class="brief-pulse">generando briefing</div><div class="brief-dots"><span></span><span></span><span></span></div></div>`;

  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const tareas = (state.tasks || []).filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');

  let eventosHoy = [];
  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch {}
  }

  const [estado, tareasTxt, calTxt, mundoTxt, climaTxt] = await Promise.allSettled([
    seccionEstado(momento),
    seccionTareas(tareas),
    seccionCalendario(eventosHoy),
    seccionMundo(),
    seccionClima()
  ]);

  const get = r => r.status === 'fulfilled' ? r.value : null;

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

export async function briefingAutomatico() {
  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const tareas = (state.tasks || []).filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');

  let eventosHoy = [];
  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch {}
  }

  const mostrar = (texto) => {
    if (!texto) return;
    addMsg('nova', texto);
  };

  const hablar = (texto) => {
    if (!texto) return;
    if (state.audioOn === undefined) state.audioOn = true;
    if (!state.audioOn) return;
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
    const estado = await seccionEstado(momento);
    await mostrarYHablar(estado);

    if (urgentes.length > 0) {
      const tareasTxt = await seccionTareas(tareas);
      await mostrarYHablar(tareasTxt, 800);
    }

    if (eventosHoy.length > 0) {
      const calTxt = await seccionCalendario(eventosHoy);
      await mostrarYHablar(calTxt, 600);
    }

    const climaTxt = await seccionClima();
    await mostrarYHablar(climaTxt, 400);

    const mundoTxt = await seccionMundo();
    await mostrarYHablar(mundoTxt, 600);
  } catch (e) {
    console.error(e);
    mostrar(`Sistemas activos. Buenos ${momento}.`);
    hablar(`Sistemas activos. Buenos ${momento}.`);
  } finally {
    setTimeout(() => {
      window._novaHablando = false;
    }, 2500);
  }
}