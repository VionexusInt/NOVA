import { addMsg } from './chat.js';
import { groqChat } from './api.js';
import { state } from './state.js';

const AGENT = 'http://localhost:4000';

const ARCHIVOS_VALIDOS = [
  'js/agent.js','js/api.js','js/audio.js','js/briefing.js','js/calendar.js',
  'js/chat.js','js/email.js','js/helpers.js','js/init.js',
  'js/marketing.js','js/mejora.js','js/memoria.js','js/mic.js','js/orb.js',
  'js/paneles.js','js/programacion.js','js/state.js','js/tareas.js',
  'js/vision.js','js/wake.js','css/estilos.css','index.html'
];
// NOTA: js/config.js está excluido a propósito — nunca debe poder
// autoeditarse un archivo que contiene API keys en texto plano.

const propuestasEnCurso = new Set();
const rechazosRecientes = new Map(); // archivo -> timestamp del último rechazo
const COOLDOWN_TRAS_RECHAZO_MS = 5 * 60 * 1000; // 5 minutos

let autoMejoraDesactivada = false;

// ── Comprobaciones de salud previas ──

async function agentVivo() {
  try {
    const r = await fetch(`${AGENT}/api/ping`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch (e) { return false; }
}

export function activarAutoMejora() {
  autoMejoraDesactivada = false;
  addMsg('nova', 'Auto-mejora reactivada.');
}

export function desactivarAutoMejora() {
  autoMejoraDesactivada = true;
  addMsg('nova', 'Auto-mejora desactivada. No propondré ni aplicaré cambios de código hasta que la reactives con "activa la auto mejora".');
}

function enCooldownPorRechazo(archivo) {
  const ts = rechazosRecientes.get(archivo);
  if (!ts) return false;
  return (Date.now() - ts) < COOLDOWN_TRAS_RECHAZO_MS;
}

function normalizarNombreArchivo(txt) {
  if (!txt || typeof txt !== 'string') return null;
  let a = txt.trim().replace(/['"`]/g, '').replace(/^\.\//, '');
  if (ARCHIVOS_VALIDOS.includes(a)) return a;
  const soloNombre = a.split('/').pop();
  const match = ARCHIVOS_VALIDOS.find(v => v.split('/').pop() === soloNombre);
  return match || null;
}

// Heurística de sanidad básica por tipo de archivo — detecta si el código
// generado está estructuralmente roto antes de proponerlo siquiera.
function validarSintaxisBasica(archivo, contenido) {
  const problemas = [];

  if (archivo.endsWith('.js')) {
    const abrePar = (contenido.match(/\(/g) || []).length;
    const cierraPar = (contenido.match(/\)/g) || []).length;
    if (Math.abs(abrePar - cierraPar) > 2) problemas.push('paréntesis descuadrados');

    const abreLlave = (contenido.match(/{/g) || []).length;
    const cierraLlave = (contenido.match(/}/g) || []).length;
    if (Math.abs(abreLlave - cierraLlave) > 2) problemas.push('llaves descuadradas');

    if (!/export\s/.test(contenido) && archivo !== 'js/config.js') {
      problemas.push('el archivo no tiene ningún export (sospechoso para un módulo JS)');
    }

    if (/```/.test(contenido)) problemas.push('contiene restos de bloques markdown');
  }

  if (archivo.endsWith('.html')) {
    if (!/<html/i.test(contenido)) problemas.push('falta la etiqueta <html>');
    if (!/<\/html>/i.test(contenido)) problemas.push('falta el cierre </html>');
  }

  if (archivo.endsWith('.css')) {
    const abreLlave = (contenido.match(/{/g) || []).length;
    const cierraLlave = (contenido.match(/}/g) || []).length;
    if (abreLlave !== cierraLlave) problemas.push('llaves CSS descuadradas');
  }

  return problemas;
}

export async function proponerMejora(archivo, descripcion, codigoActual, problemaDetectado) {
  if (autoMejoraDesactivada) {
    addMsg('nova', 'La auto-mejora está desactivada. Di "activa la auto mejora" para reactivarla.');
    return;
  }

  if (propuestasEnCurso.has(archivo)) {
    addMsg('nova', `Ya estoy procesando una mejora para ${archivo}. Espera a que termine.`);
    return;
  }

  if (enCooldownPorRechazo(archivo)) {
    addMsg('nova', `Rechazaste una propuesta para ${archivo} hace poco. Espera unos minutos antes de volver a pedir cambios en ese archivo, o dime algo distinto a lo anterior.`);
    return;
  }

  if (!codigoActual || codigoActual.trim().length < 10) {
    addMsg('nova', `⚠ El archivo ${archivo} está vacío o no se pudo leer correctamente. No propongo cambios sobre una base vacía.`);
    return;
  }

  propuestasEnCurso.add(archivo);
  addMsg('nova', `🔍 Analizando ${archivo}...`);

  try {
    const tamanoOriginal = codigoActual.length;
    const maxTokensNecesarios = Math.min(8000, Math.ceil(tamanoOriginal / 2) + 1200);

    let contenidoNuevo;
    try {
      contenidoNuevo = await groqChat([{
        role: 'system',
        content: `Eres un programador senior de JavaScript/HTML/CSS trabajando en el código de tu propio sistema.
REGLAS ABSOLUTAS, sin excepción:
1. Devuelve el ARCHIVO COMPLETO corregido, de la primera línea a la última.
2. Prohibido usar bloques de markdown (\`\`\`). Solo código plano.
3. Prohibido añadir explicaciones, comentarios sobre el cambio, o texto fuera del código.
4. Conserva TODOS los imports, exports y la estructura general del archivo original.
5. Modifica solo lo estrictamente necesario para resolver el problema descrito.
6. Si no identificas el problema con certeza, devuelve el archivo original sin cambios — nunca inventes una reescritura especulativa.
7. No elimines funcionalidad existente que no esté relacionada con el problema.`
      }, {
        role: 'user',
        content: `Archivo: ${archivo}\nProblema a resolver: ${problemaDetectado}\n\nCÓDIGO ACTUAL COMPLETO:\n${codigoActual}`
      }], 'openai/gpt-oss-20b', maxTokensNecesarios);
    } catch (e) {
      addMsg('nova', `⚠ No pude generar la corrección: ${e.message}`);
      return;
    }

    if (!contenidoNuevo || !contenidoNuevo.trim()) {
      addMsg('nova', `⚠ La IA no devolvió ningún contenido. No se propone ningún cambio.`);
      return;
    }

    let limpio = contenidoNuevo.trim();
    if (limpio.startsWith('```')) {
      limpio = limpio.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '').trim();
    }

    // Validación de tamaño — evita que un archivo se "vacíe" por error del modelo
    if (limpio.length < tamanoOriginal * 0.3) {
      addMsg('nova', `⚠ La corrección generada (${limpio.length} caracteres) es mucho más pequeña que el original (${tamanoOriginal} caracteres). Por seguridad, no la propongo — puede indicar que el modelo truncó el archivo.`);
      return;
    }

    // Validación de tamaño excesivo — un archivo que crece x3 también es sospechoso
    if (limpio.length > tamanoOriginal * 3 + 500) {
      addMsg('nova', `⚠ La corrección generada es sospechosamente más grande de lo esperado (${limpio.length} vs ${tamanoOriginal} caracteres originales). No la propongo por seguridad.`);
      return;
    }

    if (limpio.trim() === codigoActual.trim()) {
      addMsg('nova', `No encuentro cambios necesarios en ${archivo} para ese problema. El archivo ya parece correcto.`);
      return;
    }

    // Sanidad estructural básica
    const problemas = validarSintaxisBasica(archivo, limpio);
    if (problemas.length > 0) {
      addMsg('nova', `⚠ La corrección generada parece tener problemas estructurales (${problemas.join(', ')}). No la propongo por seguridad. Intenta describir el problema de forma más específica.`);
      return;
    }

    const r = await fetch(`${AGENT}/api/mejora/proponer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivo, contenido_nuevo: limpio, descripcion }),
      signal: AbortSignal.timeout(15000)
    }).catch(e => {
      throw new Error(e.name === 'TimeoutError' ? 'El agente tardó demasiado en responder' : 'No se pudo conectar con el agente');
    });

    if (!r.ok) {
      const errBody = await r.text().catch(() => '');
      addMsg('nova', `⚠ El agente respondió con error ${r.status}. ${errBody.substring(0,150)}`);
      return;
    }

    const d = await r.json().catch(() => null);
    if (!d) {
      addMsg('nova', `⚠ El agente devolvió una respuesta ilegible.`);
      return;
    }
    if (!d.ok) {
      addMsg('nova', `⚠ Error generando propuesta: ${d.error}`);
      return;
    }
    if (!d.propuesta_id || d.lineas_cambiadas === 0) {
      addMsg('nova', `No hay cambios reales que proponer en ${archivo} para ese problema.`);
      return;
    }

    mostrarPropuesta(d);

  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      addMsg('nova', `⚠ El agente tardó demasiado en responder. Comprueba que esté corriendo (python nova_agent.py).`);
    } else {
      addMsg('nova', `⚠ Error generando la mejora: ${e.message}`);
    }
  } finally {
    propuestasEnCurso.delete(archivo);
  }
}

export async function detectarYProponerMejora(descripcionProblema) {
  if (autoMejoraDesactivada) {
    addMsg('nova', 'La auto-mejora está desactivada. Di "activa la auto mejora" si quieres que vuelva a proponerte cambios de código.');
    return;
  }

  if (!descripcionProblema || descripcionProblema.trim().length < 3) {
    addMsg('nova', `Necesito que me digas qué problema tiene NOVA. Ejemplo: "mejora el briefing, no muestra noticias".`);
    return;
  }

  const vivo = await agentVivo();
  if (!vivo) {
    addMsg('nova', `⚠ El agente de control (nova_agent.py) no está corriendo. Ábrelo con "python nova_agent.py" en una terminal para que pueda leer y modificar mi propio código.`);
    return;
  }

  addMsg('nova', `🔧 Analizando: "${descripcionProblema}"...`);

  try {
    let archivoR;
    try {
      archivoR = await groqChat([{
        role: 'system',
        content: `Decide qué archivo necesita modificarse para resolver este problema.
Archivos disponibles: ${ARCHIVOS_VALIDOS.join(', ')}
Responde SOLO con el nombre exacto de un archivo de esa lista, nada más.`
      }, {
        role: 'user',
        content: descripcionProblema
      }], 'openai/gpt-oss-20b', 30);
    } catch (e) {
      addMsg('nova', `⚠ No pude determinar qué archivo tocar: ${e.message}`);
      return;
    }

    const archivo = normalizarNombreArchivo(archivoR);

    if (!archivo) {
      addMsg('nova', `⚠ No he podido determinar con certeza qué archivo modificar (la IA sugirió "${archivoR?.trim()}", que no reconozco). Sé más específico, por ejemplo: "arregla js/briefing.js, no saca noticias".`);
      return;
    }

    addMsg('nova', `📄 Leyendo ${archivo}...`);

    const leerR = await fetch(`${AGENT}/api/mejora/leer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivo }),
      signal: AbortSignal.timeout(8000)
    }).catch(e => {
      throw new Error(e.name === 'TimeoutError' ? 'timeout' : 'sin conexión');
    });

    if (!leerR.ok) {
      addMsg('nova', `⚠ No pude leer ${archivo} (error ${leerR.status}).`);
      return;
    }

    const leerD = await leerR.json().catch(() => null);
    if (!leerD || !leerD.ok) {
      addMsg('nova', `⚠ No pude leer ${archivo}: ${leerD?.error || 'respuesta ilegible del agente'}`);
      return;
    }

    await proponerMejora(archivo, descripcionProblema, leerD.contenido, descripcionProblema);

  } catch (e) {
    addMsg('nova', `⚠ ${e.message === 'timeout' ? 'El agente no respondió a tiempo.' : e.message === 'sin conexión' ? 'No pude conectar con el agente.' : e.message}`);
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
        <div class="mejora-titulo">${escHtml(propuesta.descripcion)}</div>
        <div class="mejora-meta">${escHtml(propuesta.archivo)} · ${propuesta.lineas_cambiadas} línea${propuesta.lineas_cambiadas !== 1 ? 's' : ''} cambiada${propuesta.lineas_cambiadas !== 1 ? 's' : ''}</div>
      </div>
      ${propuesta.diff ? `<pre class="mejora-diff">${escHtml(propuesta.diff)}</pre>` : '<div class="mejora-diff" style="opacity:0.5;">Sin vista previa disponible.</div>'}
      <div class="mejora-acciones">
        <button class="mejora-btn aprobar" onclick="window._novaAprobarMejora('${propuesta.propuesta_id}')">✓ APROBAR Y APLICAR</button>
        <button class="mejora-btn rechazar" onclick="window._novaRechazarMejora('${propuesta.propuesta_id}', '${propuesta.archivo}')">✕ RECHAZAR</button>
      </div>
      <div class="mejora-nota">Se creará un backup automático. Si algo falla, di "revierte ${escHtml(propuesta.archivo)}".</div>
    </div>`;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

function escHtml(txt) {
  if (!txt) return '';
  return String(txt).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').substring(0, 3000);
}

window._novaAprobarMejora = async (id) => {
  const el = document.getElementById(`propuesta-${id}`);
  const acciones = el?.querySelector('.mejora-acciones');
  const btns = el?.querySelectorAll('.mejora-btn');
  if (btns) btns.forEach(b => b.disabled = true);
  if (acciones) acciones.insertAdjacentHTML('beforeend', '<div class="mejora-ok">Aplicando...</div>');

  try {
    const r = await fetch(`${AGENT}/api/mejora/aprobar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propuesta_id: id }),
      signal: AbortSignal.timeout(10000)
    });

    if (!r.ok) {
      if (acciones) acciones.innerHTML = `<div class="mejora-err">⚠ Error del servidor (${r.status})</div>`;
      return;
    }

    const d = await r.json().catch(() => null);
    if (!d) {
      if (acciones) acciones.innerHTML = `<div class="mejora-err">⚠ Respuesta ilegible del agente</div>`;
      return;
    }

    if (acciones) {
      acciones.innerHTML = d.ok
        ? `<div class="mejora-ok">✅ Aplicado. Backup guardado automáticamente. Reinicia NOVA (Ctrl+C y npm run dev) para ver los cambios. Si algo no funciona bien, di "revierte" seguido del nombre del archivo.</div>`
        : `<div class="mejora-err">⚠ ${d.error}</div>`;
    }
    if (d.ok) addMsg('nova', `Mejora aplicada. Reinicia NOVA para que surta efecto.`);

  } catch (e) {
    if (acciones) acciones.innerHTML = `<div class="mejora-err">⚠ El agente no respondió: ${e.message}</div>`;
  }
};

window._novaRechazarMejora = async (id, archivo) => {
  const el = document.getElementById(`propuesta-${id}`);
  const acciones = el?.querySelector('.mejora-acciones');
  const btns = el?.querySelectorAll('.mejora-btn');
  if (btns) btns.forEach(b => b.disabled = true);

  try {
    await fetch(`${AGENT}/api/mejora/rechazar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propuesta_id: id }),
      signal: AbortSignal.timeout(5000)
    });
  } catch (e) {}

  if (archivo) rechazosRecientes.set(archivo, Date.now());

  if (acciones) acciones.innerHTML = '<div class="mejora-err">❌ Propuesta rechazada. No volveré a proponer cambios en este archivo durante 5 minutos.</div>';
};

export async function revertirMejora(archivo) {
  const archivoNorm = normalizarNombreArchivo(archivo);
  if (!archivoNorm) {
    addMsg('nova', `⚠ No reconozco el archivo "${archivo}". Los nombres válidos empiezan por "js/" o "css/", por ejemplo js/briefing.js.`);
    return;
  }

  const vivo = await agentVivo();
  if (!vivo) {
    addMsg('nova', `⚠ El agente no está corriendo. No puedo revertir cambios sin él.`);
    return;
  }

  try {
    const r = await fetch(`${AGENT}/api/mejora/revertir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivo: archivoNorm }),
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json().catch(() => null);
    if (!d) { addMsg('nova', '⚠ Respuesta ilegible del agente al revertir.'); return; }
    addMsg('nova', d.ok ? `⏪ ${d.mensaje}. Reinicia NOVA para ver el archivo restaurado.` : `⚠ ${d.error}`);
  } catch (e) {
    addMsg('nova', `⚠ Error al revertir: ${e.name === 'TimeoutError' ? 'el agente no respondió a tiempo' : e.message}`);
  }
}

export function initMejoraStyles() {
  if (document.getElementById('mejora-styles')) return;
  const s = document.createElement('style');
  s.id = 'mejora-styles';
  s.textContent = `
    .mejora-card { border: 1px solid rgba(74,158,255,0.2); border-radius: 3px; overflow: hidden; margin-top: 6px; background: rgba(0,4,14,0.8); }
    .mejora-header { padding: 12px 16px; border-bottom: 1px solid rgba(74,158,255,0.1); background: rgba(74,158,255,0.04); }
    .mejora-titulo { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 400; color: rgba(235,242,255,0.9); margin-bottom: 4px; }
    .mejora-meta { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 0.15em; color: rgba(74,158,255,0.4); }
    .mejora-diff { font-family: 'DM Mono', monospace; font-size: 10px; line-height: 1.6; padding: 12px 16px; overflow-x: auto; max-height: 220px; overflow-y: auto; color: rgba(200,220,245,0.6); white-space: pre; }
    .mejora-acciones { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid rgba(74,158,255,0.1); flex-wrap: wrap; align-items: center; }
    .mejora-btn { font-family: 'DM Mono', monospace; font-size: 8px; letter-spacing: 0.2em; text-transform: uppercase; padding: 8px 16px; border-radius: 2px; cursor: pointer; border: 1px solid; transition: all 0.2s; background: transparent; }
    .mejora-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .mejora-btn.aprobar { color: rgba(82,214,138,0.8); border-color: rgba(82,214,138,0.3); }
    .mejora-btn.aprobar:hover:not(:disabled) { background: rgba(82,214,138,0.08); }
    .mejora-btn.rechazar { color: rgba(232,112,112,0.7); border-color: rgba(232,112,112,0.25); }
    .mejora-btn.rechazar:hover:not(:disabled) { background: rgba(232,112,112,0.06); }
    .mejora-ok { font-family: 'DM Mono',monospace; font-size:9px; color: rgba(82,214,138,0.7); letter-spacing:0.05em; line-height:1.6; }
    .mejora-err { font-family: 'DM Mono',monospace; font-size:9px; color: rgba(232,112,112,0.7); letter-spacing:0.05em; }
    .mejora-nota { font-family: 'DM Mono',monospace; font-size:7px; color: rgba(140,175,220,0.3); letter-spacing:0.05em; padding: 8px 16px 12px; }
  `;
  document.head.appendChild(s);
}