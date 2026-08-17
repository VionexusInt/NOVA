import { groq } from './api.js';
import { esc } from './helpers.js';

export async function genEmail() {
  const to = document.getElementById('eTo').value;
  const subj = document.getElementById('eSubj').value;
  const tone = document.getElementById('eTone').value;
  const body = document.getElementById('eBody').value;
  const res = document.getElementById('eResult');
  if (!body) {
    res.innerHTML = '<span class="result-placeholder">// Describe qué quieres comunicar //</span>';
    return;
  }
  res.innerHTML = '<span class="result-placeholder">// Generando... //</span>';
  try {
    const p = `Redacta un email profesional en español de España.\nPara: ${to || 'no especificado'}\nAsunto: ${subj || 'no especificado'}\nTono: ${tone}\nContenido: ${body}\nEmail completo listo para enviar. Sin explicaciones.`;
    res.textContent = await groq(p, 'openai/gpt-oss-120b', 800);
  } catch (e) {
    res.innerHTML = `<span class="result-placeholder">// Error: ${esc(e.message)} //</span>`;
  }
}