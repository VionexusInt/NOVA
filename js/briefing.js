import { groq } from './api.js';
import { state } from './state.js';
import { updateBriefingTasks } from './tareas.js';

export async function genBriefing() {
  document.getElementById('bSummary').textContent = 'Generando...';
  document.getElementById('bCtx').textContent = 'Buscando información del día...';
  updateBriefingTasks();
  const h = new Date().getHours();
  const m = h < 12 ? 'mañana' : h < 20 ? 'tarde' : 'noche';
  const p = state.tasks.filter(t => !t.done).map(t => t.text).join(', ') || 'ninguna';
  try {
    const s = await groq(
      `Eres NOVA. Briefing de ${m} en español de España. Lo que sabes del usuario: ${state.mem || 'primera vez'}. Tareas: ${p}. Da 3-4 puntos clave: foco, prioridades, recomendación. Estilo JARVIS frío. 4 frases máximo.`,
      'openai/gpt-oss-120b', 300
    );
    document.getElementById('bSummary').textContent = s;
    const ctx = await groq(
      'Dame el tiempo actual en Madrid y una noticia relevante de España de hoy. Máximo 2 frases.',
      'openai/gpt-oss-120b', 150
    );
    document.getElementById('bCtx').textContent = ctx;
  } catch (e) {
    document.getElementById('bSummary').textContent = 'Error generando briefing.';
  }
}