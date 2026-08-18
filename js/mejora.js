import { addMsg } from './chat.js';
import { groqChat } from './api.js';
import { state } from './state.js';

const AGENT = 'http://localhost:4000';

export async function proponerMejora(archivo, descripcion, codigoActual, problemaDetectado) {
  addMsg('nova', `🔍 Analizando ${archivo}...`);

  try {
    const contenidoNuevo = await groqChat([{
      role: 'system',
      content: `Eres NOVA, IA experta en JavaScript. Se te da un archivo con un problema.
Devuelve SOLO el archivo completo corregido, sin explicaciones, sin markdown, sin bloques de código.
Solo el código JavaScript puro.`
    }, {
      role: 'user',
      content: `Archivo: ${archivo}
Problema: ${problemaDetectado}
Código actual:
${codigoActual.substring(0, 8000)}`
    }], 'openai/gpt-oss-20b', 4000);

    const r = await fetch(`${AGENT}/api/mejora/proponer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivo, contenido_nuevo: contenidoNuevo, descripcion })
    });

    const d = await r.json();
    if (!d.ok) { addMsg('nova', `⚠ Error generando mejora: ${d.error}`); return; }

    mostrarPropuesta(d);

  } catch(e) {
    addMsg('nova', `⚠ Error analizando: ${e.message}`);
  }
}

export async function detectarYProponerMejora(descripcionProblema) {
  addMsg('nova', `🔧 Analizando el problema...`);

  try {
    const archivoR = await groqChat([{
      role: 'system',
      content: `Eres NOVA. Dado un problema en la app, decide qué archivo JS necesita ser modificado.
Responde SOLO con el nombre del archivo relativo, ejemplo: js/briefing.js`
    }, {
      role: 'user',
      content: descripcionProblema
    }], 'openai/gpt-oss-20b', 30);

    const archivo = archivoR.trim().replace(/['"]/g, '');

    const leerR = await fetch(`${AGENT}/api/mejora/leer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivo })
    });

    const leerD = await leerR.json();
    if (!leerD.ok) { addMsg('nova', `⚠ No pude leer ${archivo}: ${leerD.error}`); return; }

    await proponerMejora(archivo, descripcionProblema, leerD.contenido, descripcionProblema);

  } catch(e) {
    addMsg('nova', `⚠ ${e.message}`);
  }
}

function mostrarPropuesta(propuesta) {
  const d = document.getElementById('display');
  if (!d) return;

  const el = document.createElement('div');
  el.className = 'msg';
  el.id = `propuesta-${propuesta.propuesta_id}`;
  el.innerHTML = `
    <div class="mw nova">// N.O.V.A — PROPUESTA DE MEJORA</div>
    <div class="mejora-card">
      <div class="mejora-header">
        <div class="mejora-titulo">${propuesta.descripcion}</div>
        <div class="mejora-meta">${propuesta.archivo} · ${propuesta.lineas_cambiadas} líneas cambiadas</div>
      </div>
      ${propuesta.diff ? `<pre class="mejora-diff">${escDiff(propuesta.diff)}</pre>` : ''}
      <div class="mejora-acciones">
        <button class="mejora-btn aprobar" onclick="window._novaAprobarMejora('${propuesta.propuesta_id}')">✓ APROBAR Y APLICAR</button>
        <button class="mejora-btn rechazar" onclick="window._novaRechazarMejora('${propuesta.propuesta_id}')">✕ RECHAZAR</button>
      </div>
    </div>`;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

function escDiff(txt) {
  return txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').substring(0, 2000);
}

window._novaAprobarMejora = async (id) => {
  const r = await fetch(`${AGENT}/api/mejora/aprobar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propuesta_id: id })
  });
  const d = await r.json();
  const el = document.getElementById(`propuesta-${id}`);
  if (el) el.querySelector('.mejora-acciones').innerHTML = d.ok
    ? `<div class="mejora-ok">✅ ${d.mensaje} — Reinicia NOVA para aplicar los cambios.</div>`
    : `<div class="mejora-err">⚠ ${d.error}</div>`;
  if (d.ok) addMsg('nova', `Mejora aplicada. Reinicia NOVA con Ctrl+C y npm run dev para que surta efecto.`);
};

window._novaRechazarMejora = async (id) => {
  await fetch(`${AGENT}/api/mejora/rechazar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propuesta_id: id })
  });
  const el = document.getElementById(`propuesta-${id}`);
  if (el) el.querySelector('.mejora-acciones').innerHTML = '<div class="mejora-err">❌ Propuesta rechazada.</div>';
};

export function initMejoraStyles() {
  if (document.getElementById('mejora-styles')) return;
  const s = document.createElement('style');
  s.id = 'mejora-styles';
  s.textContent = `
    .mejora-card {
      border: 1px solid rgba(74,158,255,0.2);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 6px;
      background: rgba(0,4,14,0.8);
    }
    .mejora-header {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(74,158,255,0.1);
      background: rgba(74,158,255,0.04);
    }
    .mejora-titulo {
      font-family: 'Fraunces', serif;
      font-size: 14px; font-weight: 400;
      color: rgba(235,242,255,0.9);
      margin-bottom: 4px;
    }
    .mejora-meta {
      font-family: 'DM Mono', monospace;
      font-size: 8px; letter-spacing: 0.15em;
      color: rgba(74,158,255,0.4);
    }
    .mejora-diff {
      font-family: 'DM Mono', monospace;
      font-size: 10px; line-height: 1.6;
      padding: 12px 16px;
      overflow-x: auto;
      max-height: 200px;
      overflow-y: auto;
      color: rgba(200,220,245,0.6);
      white-space: pre;
    }
    .mejora-acciones {
      display: flex; gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid rgba(74,158,255,0.1);
    }
    .mejora-btn {
      font-family: 'DM Mono', monospace;
      font-size: 8px; letter-spacing: 0.2em; text-transform: uppercase;
      padding: 8px 16px; border-radius: 2px; cursor: pointer;
      border: 1px solid; transition: all 0.2s;
      background: transparent;
    }
    .mejora-btn.aprobar {
      color: rgba(82,214,138,0.8);
      border-color: rgba(82,214,138,0.3);
    }
    .mejora-btn.aprobar:hover { background: rgba(82,214,138,0.08); }
    .mejora-btn.rechazar {
      color: rgba(232,112,112,0.7);
      border-color: rgba(232,112,112,0.25);
    }
    .mejora-btn.rechazar:hover { background: rgba(232,112,112,0.06); }
    .mejora-ok { font-family: 'DM Mono',monospace; font-size:9px; color: rgba(82,214,138,0.7); letter-spacing:0.1em; }
    .mejora-err { font-family: 'DM Mono',monospace; font-size:9px; color: rgba(232,112,112,0.7); letter-spacing:0.1em; }
  `;
  document.head.appendChild(s);
}