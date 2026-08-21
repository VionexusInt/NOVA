import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';

const AGENT = 'http://localhost:4000';
const NVIDIA_KEY = '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';

export async function analizarPantalla(pregunta) {
  addMsg('nova', '👁️ Mirando tu pantalla...');
  try {
    const r = await fetch(`${AGENT}/api/pantalla/analizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pregunta: pregunta || 'Describe con detalle qué hay en esta pantalla.', key: NVIDIA_KEY }),
      signal: AbortSignal.timeout(35000)
    });
    const d = await r.json();
    if (!d.ok) {
      addMsg('nova', '⚠ No pude analizar la pantalla: ' + (d.error || 'error desconocido'));
      return;
    }
    addMsg('nova', d.analisis);
    if (state.audioOn) speak(d.analisis.substring(0, 350));
  } catch (e) {
    const msg = e.name === 'TimeoutError'
      ? 'La captura de pantalla tardó demasiado.'
      : 'No pude conectar con el agente para capturar la pantalla.';
    addMsg('nova', '⚠ ' + msg);
  }
}