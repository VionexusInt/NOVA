import { groqChat } from './api.js';
import { state } from './state.js';
import { formatearMemoria } from './api.js';
import { getResumenCalendario, calendarDisponible, getEventosHoy } from './calendar.js';
import { addMsg } from './chat.js';
import { speak, speakAndWait } from './audio.js';
import { updateBriefingTasks } from './tareas.js';

// ── Igual que jarvis-ai: hablar y esperar ──
async function decir(texto) {
  if (!texto) return;
  addMsg('nova', texto);
  if (state.audioOn) await speakAndWait(texto);
  await new Promise(r => setTimeout(r, 300));
}

// ── TIEMPO: wttr.in igual que jarvis-ai tools.get_weather() ──
async function getWeather(ciudad) {
  try {
    const place = encodeURIComponent(ciudad || 'Madrid');
    const r = await fetch(`https://wttr.in/${place}?format=j1`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    const cur = d.current_condition[0];
    const area = d.nearest_area[0];
    const city = area.areaName[0].value;
    const tempC = cur.temp_C;
    const desc = cur.weatherDesc[0].value;
    const feels = cur.FeelsLikeC;
    return `${city}: ${desc}, ${tempC}°C, sensación ${feels}°C.`;
  } catch(e) { return null; }
}

// ── NOTICIAS: DuckDuckGo igual que jarvis-ai harness/web_search.py ──
async function getNews() {
  try {
    // GNews API — gratis 100 req/dia, noticias reales en español
    const r = await fetch(
      'https://gnews.io/api/v4/top-headlines?category=general&lang=es&country=es&max=4&apikey=pub_free',
      { signal: AbortSignal.timeout(6000) }
    );
    if (r.ok) {
      const d = await r.json();
      if (d.articles?.length > 0) {
        return d.articles.slice(0,3).map(a => a.title).join(' · ');
      }
    }
  } catch(e) {}
  try {
    // NewsAPI fallback — currentsapi.services gratis sin key para titular
    const r2 = await fetch(
      'https://saurav.tech/NewsAPI/top-headlines/category/general/es.json',
      { signal: AbortSignal.timeout(5000) }
    );
    if (r2.ok) {
      const d2 = await r2.json();
      if (d2.articles?.length > 0) {
        return d2.articles.slice(0,3).map(a => a.title).join(' · ');
      }
    }
  } catch(e) {}
  return null;
}

// ── SECCIONES (patrón _fetch_parallel de jarvis-ai adaptado a Promise.all) ──

async function seccionEstado(momento, memEst, memTexto) {
  try {
    return await groqChat([{
      role: 'system',
      content: `Eres NOVA, IA JARVIS. 1 frase de estado para la ${momento}. Frío, directo.`
    }, {
      role: 'user',
      content: (memEst || memTexto || 'Sin datos.').substring(0, 150)
    }], 'openai/gpt-oss-20b', 60);
  } catch(e) { return `Sistemas activos. Buenas ${momento}.`; }
}

async function seccionTareas(tareas, urgentes) {
  if (tareas.length === 0) return null;
  try {
    const lista = tareas.slice(0,5).map((t,i) => `${i+1}. ${t.text}${t.p==='u'?' [URGENTE]':''}`).join('\n');
    return await groqChat([{
      role: 'system',
      content: 'Eres NOVA, IA JARVIS. Resume en 1 frase. Urgentes primero.'
    }, { role: 'user', content: lista }], 'openai/gpt-oss-20b', 70);
  } catch(e) { return `${tareas.length} tareas.${urgentes.length>0?' '+urgentes.length+' urgentes.':''}`; }
}

async function seccionCalendario(eventosHoy) {
  if (eventosHoy.length === 0) return null;
  try {
    const txt = eventosHoy.slice(0,3).map(ev => {
      const s = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
      const h = s ? s.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
      return `${h ? h+' — ' : ''}${ev.summary}`;
    }).join(', ');
    return await groqChat([{
      role: 'system',
      content: 'Eres NOVA, IA JARVIS. Informa la agenda en 1 frase. Hora y evento más importante.'
    }, { role: 'user', content: txt }], 'openai/gpt-oss-20b', 60);
  } catch(e) { return `${eventosHoy.length} eventos hoy.`; }
}

async function seccionClima(ciudad) {
  const weather = await getWeather(ciudad);
  return weather;
}

async function seccionNoticias() {
  const titulos = await getNews();
  if (!titulos) return null;
  try {
    return await groqChat([{
      role: 'user',
      content: `Resume en 2 frases en español estas noticias de hoy: ${titulos.substring(0,300)}`
    }], 'openai/gpt-oss-20b', 100);
  } catch(e) { return titulos.substring(0,200); }
}

// ── Detectar ciudad del usuario desde memoria ──
function getCiudad(memEst, memTexto) {
  const mem = state.memEstructurada || {};
  const dato = mem.dato || {};
  const persona = mem.persona || {};
  for (const v of [...Object.values(dato), ...Object.values(persona)]) {
    const val = (v.valor || '').toLowerCase();
    if (val.includes('elche')) return 'Elche';
    if (val.includes('alicante')) return 'Alicante';
    if (val.includes('madrid')) return 'Madrid';
    if (val.includes('barcelona')) return 'Barcelona';
    if (val.includes('valencia')) return 'Valencia';
    if (val.includes('sevilla')) return 'Sevilla';
    if (val.includes('bilbao')) return 'Bilbao';
    if (val.includes('zaragoza')) return 'Zaragoza';
  }
  const ctx = (memEst + ' ' + memTexto).toLowerCase();
  if (ctx.includes('elche')) return 'Elche';
  if (ctx.includes('alicante')) return 'Alicante';
  if (ctx.includes('madrid')) return 'Madrid';
  if (ctx.includes('barcelona')) return 'Barcelona';
  if (ctx.includes('valencia')) return 'Valencia';
  return 'Madrid';
}

// ── BRIEFING AUTOMÁTICO (patrón jarvis-ai build_briefing) ──
export async function briefingAutomatico() {
  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');
  const ciudad = getCiudad(memEst, memTexto);
  let eventosHoy = [];

  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch(e) {}
  }

  // Estado — primero, inmediato
  const estado = await seccionEstado(momento, memEst, memTexto);
  await decir(estado);

  // Resto en paralelo (patrón _fetch_parallel de jarvis-ai)
  const [tareasTxt, calTxt, climaTxt, noticiasTxt] = await Promise.allSettled([
    urgentes.length > 0 ? seccionTareas(tareas, urgentes) : Promise.resolve(null),
    eventosHoy.length > 0 ? seccionCalendario(eventosHoy) : Promise.resolve(null),
    seccionClima(ciudad),
    seccionNoticias()
  ]);

  const get = r => r.status === 'fulfilled' ? r.value : null;

  if (get(tareasTxt)) await decir(get(tareasTxt));
  if (get(calTxt)) await decir(get(calTxt));
  if (get(climaTxt)) await decir(get(climaTxt));
  if (get(noticiasTxt)) await decir(get(noticiasTxt));
}

// ── PANEL DE BRIEFING ──
export async function genBriefing() {
  updateBriefingTasks();

  const panel = document.getElementById('briefingPanel');
  if (panel) {
    panel.innerHTML = `<div class="brief-loading"><div class="brief-pulse">generando briefing</div><div class="brief-dots"><span></span><span></span><span></span></div></div>`;
  }

  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');
  const ciudad = getCiudad(memEst, memTexto);
  let eventosHoy = [];

  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch(e) {}
  }

  const [estado, tareasTxt, calTxt, climaTxt, noticiasTxt] = await Promise.allSettled([
    seccionEstado(momento, memEst, memTexto),
    tareas.length > 0 ? seccionTareas(tareas, urgentes) : Promise.resolve(null),
    eventosHoy.length > 0 ? seccionCalendario(eventosHoy) : Promise.resolve(null),
    seccionClima(ciudad),
    seccionNoticias()
  ]);

  const get = r => r.status === 'fulfilled' ? r.value : null;

  if (panel) {
    panel.innerHTML = buildPanelHTML({
      momento,
      hora: new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),
      fecha: new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}),
      estado: get(estado),
      tareas: get(tareasTxt),
      nTareas: tareas.length,
      nUrgentes: urgentes.length,
      calendario: get(calTxt),
      clima: get(climaTxt),
      noticias: get(noticiasTxt),
      eventosHoy,
      urgentes
    });
  }
}

function buildPanelHTML({momento,hora,fecha,estado,tareas,nTareas,calendario,clima,noticias,eventosHoy,urgentes}) {
  const icono = momento==='mañana'?'◐':momento==='tarde'?'◑':'●';
  return `<div class="brief-wrap">
    <div class="brief-top">
      <div><div class="brief-momento">${icono} ${momento.toUpperCase()}</div>${estado?`<div class="brief-estado">${estado}</div>`:''}</div>
      <div class="brief-right"><div class="brief-hora">${hora}</div><div class="brief-fecha">${fecha}</div></div>
    </div>
    ${urgentes.length>0?`<div class="brief-section"><div class="brief-section-label urgent-label">⚡ urgente</div><div class="brief-urgent-list">${urgentes.slice(0,3).map(t=>`<div class="brief-urgent-item">${t.text}</div>`).join('')}</div></div>`:''}
    ${tareas?`<div class="brief-section"><div class="brief-section-label">tareas · ${nTareas} pendiente${nTareas!==1?'s':''}</div><div class="brief-text">${tareas}</div></div>`:''}
    ${calendario?`<div class="brief-section"><div class="brief-section-label">agenda</div><div class="brief-text">${calendario}</div>${eventosHoy.length>0?`<div class="brief-events">${eventosHoy.slice(0,3).map(ev=>{const s=ev.start?.dateTime?new Date(ev.start.dateTime):null;const t=s?s.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'—';return`<div class="brief-event"><span class="brief-event-time">${t}</span><span>${ev.summary}</span></div>`;}).join('')}</div>`:''}</div>`:''}
    ${clima?`<div class="brief-section"><div class="brief-section-label">clima</div><div class="brief-text">${clima}</div></div>`:''}
    ${noticias?`<div class="brief-section"><div class="brief-section-label">mundo · hoy</div><div class="brief-text">${noticias}</div></div>`:''}
    <div class="brief-footer"><span>nova digest</span><span>${new Date().toLocaleTimeString('es-ES')}</span></div>
  </div>`;
}