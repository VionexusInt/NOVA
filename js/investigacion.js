// ── INVESTIGACIÓN PROFUNDA ──
// Patrón inspirado en research.py de jarvis-ai: desglosar el tema en varios
// ángulos, investigar cada uno con búsqueda web real en paralelo, y sintetizar.

import { groqChat } from './api.js';
import { addMsg } from './chat.js';
import { speak, speakAndWait } from './audio.js';
import { state } from './state.js';

const MODELO_BUSQUEDA = 'compound-beta';   // tiene búsqueda web real integrada de Groq
const MODELO_SINTESIS = 'openai/gpt-oss-20b';

function escHtml(txt) {
  if (!txt) return '';
  return String(txt).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function generarSubpreguntas(tema) {
  try {
    const raw = await groqChat([{
      role: 'user',
      content: `Quiero investigar en profundidad este tema: "${tema}".
Identifica entre 3 y 4 preguntas o ángulos clave y distintos que, juntos, den una visión completa y actual del tema.
Responde SOLO con una lista numerada, una pregunta corta por línea, sin explicaciones ni texto adicional.`
    }], MODELO_SINTESIS, 200);

    const lineas = raw.split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(l => l.length > 8);

    return lineas.length > 0 ? lineas.slice(0, 4) : [tema];
  } catch (e) {
    console.warn('Error generando subpreguntas:', e);
    return [tema];
  }
}

async function investigarSubpregunta(subpregunta, tema) {
  try {
    const respuesta = await groqChat([{
      role: 'user',
      content: `Busca información actual y precisa en internet para responder a esto: "${subpregunta}"
Contexto general de la investigación: ${tema}
Da una respuesta concisa de 3-4 frases en español, con datos y cifras concretas si las encuentras.`
    }], MODELO_BUSQUEDA, 300);
    return { pregunta: subpregunta, respuesta: respuesta?.trim() || null };
  } catch (e) {
    console.warn(`Error investigando "${subpregunta}":`, e);
    return { pregunta: subpregunta, respuesta: null };
  }
}

async function generarResumenHablado(tema, secciones) {
  const validas = secciones.filter(s => s.respuesta);
  if (validas.length === 0) return `No he podido encontrar información fiable sobre ${tema} en este momento.`;

  try {
    const contexto = validas.map(s => `${s.pregunta}: ${s.respuesta}`).join('\n\n');
    return await groqChat([{
      role: 'user',
      content: `Basándote en esta investigación sobre "${tema}", da un resumen hablado de 3-4 frases con lo más importante. Directo, sin listas, natural para leer en voz alta.\n\n${contexto.substring(0, 1500)}`
    }], MODELO_SINTESIS, 150);
  } catch (e) {
    return `He terminado la investigación sobre ${tema}. Tienes el informe completo en pantalla.`;
  }
}

function mostrarInformeInvestigacion(tema, secciones) {
  const d = document.getElementById('display');
  if (!d) return;

  const conRespuesta = secciones.filter(s => s.respuesta).length;

  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `
    <div class="mw nova">// N.O.V.A — INFORME DE INVESTIGACIÓN</div>
    <div class="inv-card">
      <div class="inv-header">
        <div class="inv-titulo">${escHtml(tema)}</div>
        <div class="inv-meta">${conRespuesta} ángulo${conRespuesta !== 1 ? 's' : ''} investigado${conRespuesta !== 1 ? 's' : ''} · ${new Date().toLocaleTimeString('es-ES')}</div>
      </div>
      <div class="inv-secciones">
        ${secciones.map((s, i) => s.respuesta ? `
          <div class="inv-seccion">
            <div class="inv-seccion-pregunta">${i + 1}. ${escHtml(s.pregunta)}</div>
            <div class="inv-seccion-respuesta">${escHtml(s.respuesta)}</div>
          </div>
        ` : `
          <div class="inv-seccion">
            <div class="inv-seccion-pregunta">${i + 1}. ${escHtml(s.pregunta)}</div>
            <div class="inv-seccion-respuesta inv-fallo">Sin datos disponibles para este ángulo.</div>
          </div>
        `).join('')}
      </div>
    </div>`;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

// ── API PÚBLICA ──
// Se auto-inicializa: no requiere ningún cambio en init.js para funcionar.

export async function realizarInvestigacionProfunda(tema) {
  initInvestigacionStyles();

  if (!tema || tema.trim().length < 3) {
    addMsg('nova', 'Necesito que me digas sobre qué tema quieres que investigue.');
    return;
  }

  const temaLimpio = tema.trim();

  addMsg('nova', `🔎 Iniciando investigación profunda sobre: ${temaLimpio}`);
  if (state.audioOn) await speakAndWait(`Iniciando investigación sobre ${temaLimpio}.`);

  const subpreguntas = await generarSubpreguntas(temaLimpio);
  addMsg('nova', `📋 Analizando ${subpreguntas.length} ángulo${subpreguntas.length > 1 ? 's' : ''}: ${subpreguntas.join(' · ')}`);

  const resultados = await Promise.allSettled(
    subpreguntas.map(sp => investigarSubpregunta(sp, temaLimpio))
  );

  const secciones = resultados
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean);

  const conRespuesta = secciones.filter(s => s.respuesta);

  if (conRespuesta.length === 0) {
    const msg = `No he podido completar la investigación sobre ${temaLimpio}. La búsqueda web puede no estar disponible ahora mismo.`;
    addMsg('nova', msg);
    if (state.audioOn) speak('No he podido completar la investigación.');
    return;
  }

  mostrarInformeInvestigacion(temaLimpio, secciones);

  const resumenHablado = await generarResumenHablado(temaLimpio, secciones);
  addMsg('nova', resumenHablado);
  if (state.audioOn) speak(resumenHablado);
}

export function initInvestigacionStyles() {
  if (document.getElementById('inv-styles')) return;
  const s = document.createElement('style');
  s.id = 'inv-styles';
  s.textContent = `
    .inv-card {
      border: 1px solid rgba(74,158,255,0.18);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 6px;
      background: rgba(0,4,14,0.85);
      max-width: 560px;
    }
    .inv-header {
      padding: 14px 18px;
      border-bottom: 1px solid rgba(74,158,255,0.1);
      background: linear-gradient(180deg, rgba(74,158,255,0.04) 0%, transparent 100%);
    }
    .inv-titulo {
      font-family: 'Fraunces', serif;
      font-size: 15px; font-weight: 400; font-style: italic;
      color: rgba(235,242,255,0.92);
      margin-bottom: 4px;
    }
    .inv-meta {
      font-family: 'DM Mono', monospace;
      font-size: 8px; letter-spacing: 0.15em; text-transform: uppercase;
      color: rgba(74,158,255,0.4);
    }
    .inv-secciones { padding: 6px 0; }
    .inv-seccion {
      padding: 14px 18px;
      border-bottom: 1px solid rgba(74,158,255,0.06);
    }
    .inv-seccion:last-child { border-bottom: none; }
    .inv-seccion-pregunta {
      font-family: 'DM Mono', monospace;
      font-size: 10px; letter-spacing: 0.05em;
      color: rgba(74,158,255,0.65);
      margin-bottom: 6px;
      font-weight: 500;
    }
    .inv-seccion-respuesta {
      font-family: 'Fraunces', serif;
      font-size: 13px; line-height: 1.7; font-weight: 300;
      color: rgba(215,228,248,0.85);
    }
    .inv-fallo { color: rgba(140,175,220,0.35); font-style: italic; }
  `;
  document.head.appendChild(s);
}