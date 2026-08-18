import { groq } from './api.js';
import { state } from './state.js';
import { updateBriefingTasks } from './tareas.js';

export async function generateBriefing() {
  const bSummary = document.getElementById('bSummary');
  const bCtx = document.getElementById('bCtx');
  if (!bSummary || !bCtx) return '';
  bSummary.textContent = 'Generando...';
  bCtx.textContent = 'Consultando información del día...';
  updateBriefingTasks();
  const hora = new Date().getHours();
  const momento = hora < 12 ? 'mañana' : hora < 20 ? 'tarde' : 'noche';
  const tareasPendientes = state.tasks.filter(t => !t.done).map(t => t.text).join(', ') || 'ninguna';
  try {
    const resumen = await groq(
      `Eres NOVA. Genera un briefing de ${momento} en español de España.
Lo que sabes del usuario: ${state.mem || 'primera vez'}
Tareas pendientes: ${tareasPendientes}
Da 3-4 puntos clave: foco, prioridades, recomendación.
Estilo JARVIS frío, 4 frases máximo.`,
      'openai/gpt-oss-20b', 300
    );
    bSummary.textContent = resumen;
    const contexto = await groq(
      'Dame un breve resumen del tiempo en Madrid y una noticia relevante de España de hoy. Máximo 2 frases.',
      'openai/gpt-oss-20b', 150
    );
    bCtx.textContent = contexto;
    return `${resumen}\n${contexto}`;
  } catch (error) {
    bSummary.textContent = 'Error al generar el briefing. Inténtalo de nuevo.';
    bCtx.textContent = 'No se pudo obtener contexto.';
    return '';
  }
}

export async function genBriefing() {
  await generateBriefing();
}