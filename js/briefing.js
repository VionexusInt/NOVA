import { groqChat, loadMemoriaEstructurada, formatearMemoria } from './api.js';
import { state } from './state.js';
import { calendarDisponible, getEventosHoy } from './calendar.js';
import { addMsg } from './chat.js';
import { speakAndWait } from './audio.js';
import { updateBriefingTasks } from './tareas.js';

async function decir(texto) {
  if (!texto) return;
  addMsg('nova', texto);
  if (state.audioOn) await speakAndWait(texto).catch(() => {});
  await new Promise(r => setTimeout(r, 250));
}

function greeting() {
  const h = new Date().getHours();
  const period = h < 12 ? 'mañana' : h < 17 ? 'tarde' : 'noche';
  const mem = state.memEstructurada || {};
  for (const cat of Object.values(mem)) {
    for (const [k, v] of Object.entries(cat)) {
      if (/nombre|name/i.test(k) && v.valor) {
        return `Buenas ${period}, ${v.valor.split(' ')[0]}.`;
      }
    }
  }
  return `Buenas ${period}.`;
}

function getCiudad() {
  const mem = state.memEstructurada || {};
  const ciudades = ['elche','alicante','murcia','madrid','barcelona','valencia','sevilla','bilbao','zaragoza'];
  for (const cat of Object.values(mem)) {
    for (const { valor } of Object.values(cat)) {
      const v = (valor || '').toLowerCase();
      for (const c of ciudades) {
        if (v.includes(c)) return c.charAt(0).toUpperCase() + c.slice(1);
      }
    }
  }
  return 'Madrid';
}

async function getWeather(ciudad) {
  try {
    const r = await fetch(`https://wttr.in/${encodeURIComponent(ciudad)}?format=j1`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    const cur = d.current_condition[0];
    const desc = cur.weatherDesc[0].value;
    const temp = cur.temp_C;
    const feels = cur.FeelsLikeC;
    return `${ciudad}: ${desc}, ${temp}°C, sensación ${feels}°C.`;
  } catch(e) { return null; }
}

async function getNews() {
  const feeds = [
    'https://www.20minutos.es/rss/',
    'https://feeds.bbci.co.uk/mundo/noticias/rss.xml',
    'https://www.europapress.es/rss/rss.aspx'
  ];
  for (const url of feeds) {
    try {
      const r = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(7000) });
      const d = await r.json();
      if (d.status === 'ok' && d.items?.length > 0) {
        const titulos = d.items.slice(0,4).map(i => i.title).join('. ');
        try {
          return await groqChat([{ role: 'user', content: `En 2 frases en español resume: ${titulos.substring(0,280)}` }], 'openai/gpt-oss-20b', 100);
        } catch(e) { return titulos.substring(0,200); }
      }
    } catch(e) { continue; }
  }
  return null;
}

async function getTareasTxt(tareas, urgentes) {
  if (tareas.length === 0) return null;
  const lista = tareas.slice(0,5).map((t,i) => `${i+1}. ${t.text}${t.p==='u'?' [URGENTE]':''}`).join(', ');
  try {
    return await groqChat([{ role: 'user', content: `En 1 frase en español resume estas tareas (urgentes primero): ${lista}` }], 'openai/gpt-oss-20b', 70);
  } catch(e) { return `${tareas.length} tareas pendientes${urgentes.length > 0 ? `, ${urgentes.length} urgentes` : ''}.`; }
}

async function getCalendarioTxt(eventosHoy) {
  if (!eventosHoy?.length) return null;
  const lines = eventosHoy.slice(0,3).map(ev => {
    const s = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
    const t = s ? s.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '';
    return t ? `${t} — ${ev.summary}` : ev.summary;
  }).join(', ');
  try {
    return await groqChat([{ role: 'user', content: `En 1 frase en español informa la agenda: ${lines}` }], 'openai/gpt-oss-20b', 60);
  } catch(e) { return lines; }
}

async function cargarMemoriaFresca() {
  try {
    state.memEstructurada = await loadMemoriaEstructurada();
  } catch(e) {}
}

export async function briefingAutomatico() {
  await cargarMemoriaFresca();

  const ciudad = getCiudad();
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');
  let eventosHoy = [];

  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch(e) {}
  }

  await decir(greeting());

  const [tareasTxt, calTxt, weatherTxt, newsTxt] = await Promise.allSettled([
    getTareasTxt(tareas, urgentes),
    getCalendarioTxt(eventosHoy),
    getWeather(ciudad),
    getNews()
  ]);

  const get = r => r.status === 'fulfilled' && r.value ? r.value : null;

  if (get(tareasTxt)) await decir(get(tareasTxt));
  if (get(calTxt)) await decir(get(calTxt));
  if (get(weatherTxt)) await decir(get(weatherTxt));
  if (get(newsTxt)) await decir(get(newsTxt));
}

export async function genBriefing() {
  updateBriefingTasks();

  const panel = document.getElementById('briefingPanel');
  if (panel) panel.innerHTML = `<div class="brief-loading"><div class="brief-pulse">generando briefing</div><div class="brief-dots"><span></span><span></span><span></span></div></div>`;

  await cargarMemoriaFresca();

  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const ciudad = getCiudad();
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');
  let eventosHoy = [];

  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch(e) {}
  }

  const [tareasTxt, calTxt, weatherTxt, newsTxt] = await Promise.allSettled([
    getTareasTxt(tareas, urgentes),
    getCalendarioTxt(eventosHoy),
    getWeather(ciudad),
    getNews()
  ]);

  const get = r => r.status === 'fulfilled' && r.value ? r.value : null;
  const icono = momento === 'mañana' ? '◐' : momento === 'tarde' ? '◑' : '●';

  if (!panel) return;
  panel.innerHTML = `<div class="brief-wrap">
    <div class="brief-top">
      <div>
        <div class="brief-momento">${icono} ${momento.toUpperCase()}</div>
        <div class="brief-estado">${greeting()}</div>
      </div>
      <div class="brief-right">
        <div class="brief-hora">${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="brief-fecha">${new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</div>
      </div>
    </div>
    ${urgentes.length > 0 ? `<div class="brief-section"><div class="brief-section-label urgent-label">⚡ urgente</div><div class="brief-urgent-list">${urgentes.slice(0,3).map(t => `<div class="brief-urgent-item">${t.text}</div>`).join('')}</div></div>` : ''}
    ${get(tareasTxt) ? `<div class="brief-section"><div class="brief-section-label">tareas · ${tareas.length} pendiente${tareas.length !== 1 ? 's' : ''}</div><div class="brief-text">${get(tareasTxt)}</div></div>` : ''}
    ${get(calTxt) ? `<div class="brief-section"><div class="brief-section-label">agenda</div><div class="brief-text">${get(calTxt)}</div>${eventosHoy.length > 0 ? `<div class="brief-events">${eventosHoy.slice(0,3).map(ev => { const s = ev.start?.dateTime ? new Date(ev.start.dateTime) : null; const t = s ? s.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}) : '—'; return `<div class="brief-event"><span class="brief-event-time">${t}</span><span>${ev.summary}</span></div>`; }).join('')}</div>` : ''}</div>` : ''}
    ${get(weatherTxt) ? `<div class="brief-section"><div class="brief-section-label">clima · ${ciudad}</div><div class="brief-text">${get(weatherTxt)}</div></div>` : ''}
    ${get(newsTxt) ? `<div class="brief-section"><div class="brief-section-label">mundo · hoy</div><div class="brief-text">${get(newsTxt)}</div></div>` : ''}
    <div class="brief-footer"><span>nova digest</span><span>${new Date().toLocaleTimeString('es-ES')}</span></div>
  </div>`;
}