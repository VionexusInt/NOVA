import { groq, groqChat } from './api.js';
import { state } from './state.js';
import { formatearMemoria } from './api.js';
import { updateBriefingTasks } from './tareas.js';
import { getResumenCalendario, calendarDisponible } from './calendar.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';

export async function genBriefing() {
  const bSummary = document.getElementById('bSummary');
  const bCtx = document.getElementById('bCtx');
  const bTasks = document.getElementById('bTasks');
  const bTime = document.getElementById('bTime');

  if (bSummary) bSummary.textContent = 'Generando...';
  if (bCtx) bCtx.textContent = 'Buscando novedades...';
  if (bTime) bTime.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  updateBriefingTasks();

  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const tareas = state.tasks.filter(t => !t.done).map(t => t.text).join(', ') || 'ninguna';
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';

  let calendarioInfo = '';
  if (await calendarDisponible()) {
    calendarioInfo = await getResumenCalendario();
  }

  const contexto = [
    memEst ? `MEMORIA DEL USUARIO:\n${memEst}` : memTexto ? `RESUMEN: ${memTexto}` : '',
    calendarioInfo ? `CALENDARIO: ${calendarioInfo}` : '',
    `TAREAS PENDIENTES: ${tareas}`
  ].filter(Boolean).join('\n\n');

  try {
    const [resumen, noticias] = await Promise.all([
      groqChat([{
        role: 'system',
        content: `Eres NOVA, IA personal estilo JARVIS. Genera un briefing de ${momento} en español de España.
Sé específico y personalizado basándote en el contexto del usuario.
Estructura: 1) Estado del día 2) Prioridades 3) Recomendación concreta.
Máximo 5 frases. Frío, directo, útil. Sin saludos genéricos.`
      }, {
        role: 'user',
        content: contexto || 'Sin datos del usuario todavía.'
      }], 'compound-beta', 300),

      groqChat([{
        role: 'system',
        content: 'Eres un asistente que busca noticias relevantes. Responde en español de España. Máximo 4 frases.'
      }, {
        role: 'user',
        content: buildNoticiaPrompt(memEst, memTexto)
      }], 'compound-beta', 400)
    ]);

    if (bSummary) bSummary.textContent = resumen;
    if (bCtx) bCtx.textContent = noticias;

  } catch (e) {
    if (bSummary) bSummary.textContent = 'Error generando briefing. Comprueba la conexión.';
    if (bCtx) bCtx.textContent = '—';
  }
}

function buildNoticiaPrompt(memEst, memTexto) {
  const contexto = memEst || memTexto;

  if (!contexto) {
    return 'Busca las 2-3 noticias más importantes de España de hoy. Incluye también el tiempo en Madrid. Sé breve y directo.';
  }

  return `Basándote en este perfil del usuario, busca noticias de hoy que le sean relevantes:
${contexto}

Busca:
1. Noticias de su sector/industria o empresa si la mencionas
2. Noticias económicas o de negocio relevantes para España
3. Algo relacionado con sus proyectos o intereses si los conoces
4. El tiempo en su ciudad si la conoces, o en Madrid

Máximo 4 frases. Formato: noticias concretas con datos reales de hoy.`;
}

export async function briefingAutomatico() {
  const h = new Date().getHours();
  const momento = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const tareas = state.tasks.filter(t => !t.done);
  const urgentes = tareas.filter(t => t.p === 'u');
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';

  let calendarioInfo = '';
  if (await calendarDisponible()) {
    calendarioInfo = await getResumenCalendario();
  }

  const contexto = [
    memEst || memTexto,
    calendarioInfo,
    tareas.length > 0 ? `${tareas.length} tareas pendientes${urgentes.length > 0 ? `, ${urgentes.length} urgentes` : ''}` : ''
  ].filter(Boolean).join('. ');

  try {
    const saludo = await groqChat([{
      role: 'system',
      content: `Eres NOVA, IA personal estilo JARVIS. Genera un saludo de ${momento} personalizado en español de España.
Si tienes datos del calendario, menciona el próximo evento importante.
Si hay tareas urgentes, menciónalas.
Si sabes algo del usuario, personaliza el saludo.
Máximo 3 frases. Frío, preciso, útil. Sin "buenos días" genérico si tienes contexto.`
    }, {
      role: 'user',
      content: contexto || `Es ${momento}. Sin datos del usuario.`
    }], 'openai/gpt-oss-20b', 150);

    addMsg('nova', saludo);
    if (state.audioOn) speak(saludo);

    await new Promise(r => setTimeout(r, 500));

    if (urgentes.length > 0) {
      const alertaTareas = `⚡ Tienes ${urgentes.length} tarea${urgentes.length > 1 ? 's' : ''} urgente${urgentes.length > 1 ? 's' : ''}: ${urgentes.slice(0, 3).map(t => t.text).join(', ')}`;
      addMsg('nova', alertaTareas);
    }

    if (calendarioInfo && calendarioInfo !== 'El calendario no está conectado.') {
      addMsg('nova', `📅 ${calendarioInfo}`);
    }

  } catch (e) {
    console.warn('briefingAutomatico:', e);
  }
  await new Promise(r => setTimeout(r, 500));
}