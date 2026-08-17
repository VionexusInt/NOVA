import { groq } from './api.js';
import { esc } from './helpers.js';
import { state } from './state.js';

export function setMkt(el, mode) {
  document.querySelectorAll('.mkt-chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  state.mktMode = mode;
}

export async function genMarketing() {
  const inp = document.getElementById('mktIn').value.trim();
  const res = document.getElementById('mktResult');
  if (!inp) {
    res.innerHTML = '<span class="result-placeholder">// Describe tu negocio //</span>';
    return;
  }
  res.innerHTML = '<span class="result-placeholder">// Generando estrategia... //</span>';
  const modes = {
    campaña: 'Diseña una campaña de marketing completa con objetivos, canales, mensajes clave, calendario y KPIs.',
    copy: 'Escribe copy persuasivo y potente para web, email y ads.',
    redes: 'Estrategia de contenidos para redes con ideas de posts, hashtags y calendario editorial.',
    seo: 'Estrategia SEO con palabras clave, estructura de contenido y recomendaciones técnicas.',
    embudo: 'Embudo de ventas completo: awareness, consideración, decisión y fidelización.',
    analisis: 'Análisis de situación, puntos débiles, oportunidades y recomendaciones concretas.'
  };
  try {
    res.textContent = await groq(
      `Eres consultor de marketing experto. ${modes[state.mktMode]}\nContexto: ${inp}\nEspañol de España. Específico y práctico. Estructura clara.`,
      'openai/gpt-oss-120b', 1500
    );
  } catch (err) {
    res.innerHTML = `<span class="result-placeholder">// Error: ${esc(err.message)} //</span>`;
  }
}