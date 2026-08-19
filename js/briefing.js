import { groqChat } from './api.js';
import { state } from './state.js';
import { formatearMemoria } from './api.js';
import { getResumenCalendario, calendarDisponible, getEventosHoy } from './calendar.js';
import { addMsg } from './chat.js';
import { speak, speakAndWait } from './audio.js';
import { updateBriefingTasks } from './tareas.js';

async function notificarWindows(titulo, mensaje) {
  try {
    await fetch('http://localhost:4000/api/notificar_windows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, mensaje }),
      signal: AbortSignal.timeout(3000)
    });
  } catch (e) {}
}

async function decir(texto) {
  if (!texto || !texto.trim()) {
    console.warn('⚠️ decir() recibió texto vacío');
    return;
  }
  console.log('💬 Diciendo:', texto.substring(0, 80) + '...');
  addMsg('nova', texto);
  if (state.audioOn) await speakAndWait(texto);
  await new Promise(r => setTimeout(r, 300));
}

async function getWeather(ciudad) {
  try {
    const place = encodeURIComponent(ciudad || 'Elche');
    const r = await fetch(`https://wttr.in/${place}?format=j1`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    const cur = d.current_condition[0];
    const area = d.nearest_area[0];
    const city = area.areaName[0].value;
    const tempC = cur.temp_C;
    const desc = cur.weatherDesc[0].value;
    const feels = cur.FeelsLikeC;
    return `${city}: ${desc}, ${tempC}°C, sensación ${feels}°C.`;
  } catch (e) { 
    console.warn('⚠️ Error obteniendo clima:', e);
    return null; 
  }
}

async function getNews() {
  console.log('📰 Solicitando noticias al backend...');
  try {
    const r = await fetch('http://localhost:4000/api/noticias', {
      signal: AbortSignal.timeout(15000)
    });
    console.log('📰 Respuesta del backend:', r.status);
    if (!r.ok) {
      console.warn('⚠️ Backend respondió con error:', r.status);
      return null;
    }
    const data = await r.json();
    console.log('📰 Datos recibidos:', data);
    if (data.titulos && data.titulos.length > 0) {
      const titulosValidos = data.titulos.filter(t => 
        t && typeof t === 'string' && t.length > 5
      );
      console.log('📰 Títulos válidos:', titulosValidos.length);
      if (titulosValidos.length > 0) {
        return titulosValidos.join(' · ');
      }
    }
    return null;
  } catch (e) {
    console.error('❌ Error obteniendo noticias:', e);
    return null;
  }
}

function getInteresesUsuario(mem) {
  const intereses = [];
  if (!mem) return intereses;
  const pref = mem.preferencia || {};
  const proy = mem.proyecto || {};
  const hab = mem.habito || {};
  for (const v of Object.values(pref)) intereses.push((v.valor || '').toLowerCase());
  for (const v of Object.values(proy)) intereses.push((v.valor || '').toLowerCase());
  for (const v of Object.values(hab)) intereses.push((v.valor || '').toLowerCase());
  return intereses.filter(i => i.length > 3);
}

async function seccionEstado(momento, memEst, memTexto) {
  try {
    return await groqChat([{
      role: 'system',
      content: `Eres NOVA, IA JARVIS. 1 frase de estado para la ${momento}. Frío, directo. El usuario es de Elche, Alicante.`
    }, {
      role: 'user',
      content: (memEst || memTexto || 'Sin datos.').substring(0, 150)
    }], 'openai/gpt-oss-20b', 60);
  } catch (e) { 
    console.warn('⚠️ Error en seccionEstado:', e);
    return `Sistemas activos. Buenas ${momento}.`; 
  }
}

async function seccionTareas(tareas, urgentes) {
  if (tareas.length === 0) return null;
  const total = tareas.length;
  const nUrgentes = urgentes.length;
  try {
    const lista = tareas.slice(0, 5).map((t, i) =>
      `${i + 1}. ${t.text}${t.p === 'u' ? ' [URGENTE]' : ''}`
    ).join('\n');
    const prompt = nUrgentes > 0
      ? `Tienes ${total} tareas pendientes, ${nUrgentes} urgentes. Resume en 1 frase las más importantes. Urgentes primero.`
      : `Tienes ${total} tareas pendientes. Resume brevemente las más relevantes en 1 frase.`;
    return await groqChat([{
      role: 'system',
      content: `Eres NOVA, IA JARVIS. Resume las tareas en 1 frase concisa. ${prompt}`
    }, { role: 'user', content: lista }], 'openai/gpt-oss-20b', 70);
  } catch (e) {
    console.warn('⚠️ Error en seccionTareas:', e);
    return `${total} tareas pendientes.${nUrgentes > 0 ? ' ' + nUrgentes + ' urgentes.' : ''}`;
  }
}

async function seccionCalendario(eventosHoy) {
  if (eventosHoy.length === 0) return null;
  try {
    const txt = eventosHoy.slice(0, 3).map(ev => {
      const s = ev.start?.dateTime ? new Date(ev.start.dateTime) : null;
      const h = s ? s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
      return `${h ? h + ' — ' : ''}${ev.summary}`;
    }).join(', ');
    return await groqChat([{
      role: 'system',
      content: 'Eres NOVA, IA JARVIS. Informa la agenda en 1 frase. Hora y evento más importante.'
    }, { role: 'user', content: txt }], 'openai/gpt-oss-20b', 60);
  } catch (e) { 
    console.warn('⚠️ Error en seccionCalendario:', e);
    return `${eventosHoy.length} eventos hoy.`; 
  }
}

async function seccionClima(ciudad) {
  return await getWeather(ciudad);
}

async function seccionNoticias(memEst) {
  console.log('🗞️ Obteniendo noticias...');
  const titulos = await getNews();
  
  if (!titulos || titulos.trim() === '') {
    console.warn('⚠️ No se obtuvieron noticias del backend');
    return 'No hay noticias disponibles en este momento.';
  }
  
  console.log('✅ Títulos obtenidos:', titulos.substring(0, 100) + '...');
  
  const mem = state.memEstructurada || {};
  const intereses = getInteresesUsuario(mem);
  let filtroContexto = '';
  if (intereses.length > 0) {
    filtroContexto = ` Intereses del usuario: ${intereses.join(', ')}. Prioriza noticias relacionadas con estos temas.`;
  }
  
  let resumen = '';
  try {
    console.log('🤖 Pidiendo a la IA que resuma las noticias...');
    resumen = await groqChat([{
      role: 'user',
      content: `Resume en 2-3 frases en español estas noticias locales de Elche/Alicante y nacionales de hoy. Enfócate en lo más relevante para un residente de Elche.${filtroContexto}\n\n${titulos.substring(0, 500)}`
    }], 'openai/gpt-oss-20b', 120);
    
    console.log('✅ Resumen generado:', resumen ? resumen.substring(0, 100) + '...' : '(vacío)');
    
    if (!resumen || resumen.trim() === '') {
      console.warn('⚠️ La IA devolvió un resumen vacío, usando fallback');
      throw new Error('Resumen vacío');
    }
  } catch (e) { 
    console.warn('⚠️ Error al resumir noticias con IA:', e);
    const titulosCortos = titulos.split(' · ').slice(0, 3).join('. ');
    resumen = `En las noticias de hoy: ${titulosCortos}.`;
  }
  
  return resumen;
}

function getCiudad(memEst, memTexto) {
  const mem = state.memEstructurada || {};
  const dato = mem.dato || {};
  const persona = mem.persona || {};
  const preferencia = mem.preferencia || {};
  for (const v of [...Object.values(dato), ...Object.values(persona), ...Object.values(preferencia)]) {
    const val = (v.valor || '').toLowerCase();
    if (val.includes('elche')) return 'Elche';
    if (val.includes('alicante')) return 'Alicante';
    if (val.includes('elx')) return 'Elche';
  }
  const ctx = (memEst + ' ' + memTexto).toLowerCase();
  if (ctx.includes('elche')) return 'Elche';
  if (ctx.includes('alicante')) return 'Alicante';
  if (ctx.includes('elx')) return 'Elche';
  if (ctx.includes('madrid')) return 'Madrid';
  if (ctx.includes('barcelona')) return 'Barcelona';
  if (ctx.includes('valencia')) return 'Valencia';
  return 'Elche';
}

export async function briefingAutomatico() {
  console.log('🚀 Iniciando briefing automático...');
  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');
  const ciudad = getCiudad(memEst, memTexto);
  
  console.log(`📍 Ciudad detectada: ${ciudad}`);
  console.log(`🕐 Momento: ${momento}`);
  console.log(`📋 Tareas: ${tareas.length} (${urgentes.length} urgentes)`);
  
  let eventosHoy = [];
  if (await calendarDisponible()) {
    try { eventosHoy = await getEventosHoy(); } catch (e) {
      console.warn('⚠️ Error obteniendo eventos:', e);
    }
  }
  
  console.log(`📅 Eventos hoy: ${eventosHoy.length}`);
  
  const estado = await seccionEstado(momento, memEst, memTexto);
  await decir(estado);
  
  console.log('⏳ Obteniendo tareas, calendario, clima y noticias en paralelo...');
  
  const [tareasTxt, calTxt, climaTxt, noticiasTxt] = await Promise.allSettled([
    tareas.length > 0 ? seccionTareas(tareas, urgentes) : Promise.resolve(null),
    eventosHoy.length > 0 ? seccionCalendario(eventosHoy) : Promise.resolve(null),
    seccionClima(ciudad),
    seccionNoticias(memEst)
  ]);
  
  console.log('✅ Todas las secciones procesadas');
  console.log('📊 Resultados:', {
    tareas: tareasTxt.status,
    calendario: calTxt.status,
    clima: climaTxt.status,
    noticias: noticiasTxt.status
  });
  
  const get = r => r.status === 'fulfilled' ? r.value : null;
  
  if (get(tareasTxt)) await decir(get(tareasTxt));
  if (get(calTxt)) await decir(get(calTxt));
  if (get(climaTxt)) await decir(get(climaTxt));
  
  const noticias = get(noticiasTxt);
  if (noticias && noticias.trim() !== '') {
    console.log('📰 Diciendo noticias...');
    await decir(noticias);
  } else {
    console.warn('⚠️ No hay noticias para decir (vacías o null)');
  }
  
  const partes = [];
  if (tareas.length > 0) {
    partes.push(`${tareas.length} tarea${tareas.length > 1 ? 's' : ''}`);
    if (urgentes.length > 0) partes.push(`(${urgentes.length} urgente${urgentes.length > 1 ? 's' : ''})`);
  }
  if (eventosHoy.length > 0) partes.push(`${eventosHoy.length} evento${eventosHoy.length > 1 ? 's' : ''}`);
  
  const resumen = partes.length > 0
    ? `Briefing completado: ${partes.join(', ')}`
    : 'Briefing completado. Sin tareas ni eventos pendientes.';
  
  console.log('✅ Briefing finalizado');
  notificarWindows('NOVA — Briefing', resumen);
}

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
    try { eventosHoy = await getEventosHoy(); } catch (e) {}
  }
  const [estado, tareasTxt, calTxt, climaTxt, noticiasTxt] = await Promise.allSettled([
    seccionEstado(momento, memEst, memTexto),
    tareas.length > 0 ? seccionTareas(tareas, urgentes) : Promise.resolve(null),
    eventosHoy.length > 0 ? seccionCalendario(eventosHoy) : Promise.resolve(null),
    seccionClima(ciudad),
    seccionNoticias(memEst)
  ]);
  const get = r => r.status === 'fulfilled' ? r.value : null;
  if (panel) {
    panel.innerHTML = buildPanelHTML({
      momento,
      hora: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      fecha: new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
      ciudad,
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

function buildPanelHTML({ momento, hora, fecha, ciudad, estado, tareas, nTareas, calendario, clima, noticias, eventosHoy, urgentes }) {
  const icono = momento === 'mañana' ? '◐' : momento === 'tarde' ? '◑' : '●';
  return `<div class="brief-wrap">
    <div class="brief-top">
      <div>
        <div class="brief-momento">${icono} ${momento.toUpperCase()}</div>
        ${estado ? `<div class="brief-estado">${estado}</div>` : ''}
      </div>
      <div class="brief-right">
        <div class="brief-hora">${hora}</div>
        <div class="brief-fecha">${fecha}</div>
        <div class="brief-ciudad" style="font-size:10px;opacity:0.5;margin-top:4px;">📍 ${ciudad}</div>
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
      <div class="brief-section-label">clima en ${ciudad}</div>
      <div class="brief-text">${clima}</div>
    </div>` : ''}
    ${noticias ? `
    <div class="brief-section">
      <div class="brief-section-label">noticias · Elche / Alicante / Mundo</div>
      <div class="brief-text">${noticias}</div>
    </div>` : ''}
    <div class="brief-footer">
      <span>nova digest</span>
      <span>${new Date().toLocaleTimeString('es-ES')}</span>
    </div>
  </div>`;
}