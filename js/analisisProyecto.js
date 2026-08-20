// ── ANÁLISIS DE PROYECTO EXTERNO (BajateApp) ──
// Lectura y comprensión de código real del PC. SOLO LECTURA — nunca escribe
// ni modifica el proyecto analizado, a propósito, como límite de seguridad.

import { setMemoria, loadMemoriaEstructurada, groqChat } from './api.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';
import { state } from './state.js';

const AGENT = 'http://localhost:4000';
const CODE_MODEL = 'openai/gpt-oss-120b';

let proyectoEscaneado = null; // cache en memoria de sesión: { raiz, archivos }

function log(...a) { console.log('[PROYECTO]', ...a); }

async function agentVivo() {
  try {
    const r = await fetch(`${AGENT}/api/ping`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch (e) { return false; }
}

async function llamarNvidia(messages, maxTokens = 2048) {
  return await groqChat(messages, CODE_MODEL, maxTokens);
}

export async function registrarRutaProyecto(ruta) {
  await setMemoria('dato', 'ruta_proyecto_bajateapp', ruta, 5);
}

export async function obtenerRutaProyecto() {
  try {
    const mem = await loadMemoriaEstructurada();
    return mem.dato?.ruta_proyecto_bajateapp?.valor || null;
  } catch (e) { return null; }
}

export async function escanearProyecto(rutaManual = null) {
  const vivo = await agentVivo();
  if (!vivo) {
    addMsg('nova', '⚠ El agente no está corriendo. No puedo leer archivos del PC sin él (python nova_agent.py).');
    return;
  }

  let ruta = rutaManual || await obtenerRutaProyecto();
  if (!ruta) {
    addMsg('nova', 'No sé dónde está el proyecto. Dime la ruta completa, por ejemplo: "el proyecto está en C:\\Users\\...\\BajateApp".');
    return;
  }

  addMsg('nova', `🔍 Escaneando el proyecto en ${ruta}...`);

  try {
    const r = await fetch(`${AGENT}/api/proyecto/escanear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruta }),
      signal: AbortSignal.timeout(20000)
    });
    const d = await r.json();
    if (!d.ok) {
      addMsg('nova', `⚠ ${d.error}`);
      return;
    }

    proyectoEscaneado = { raiz: d.raiz, archivos: d.archivos };
    await registrarRutaProyecto(ruta);

    addMsg('nova', `📁 ${d.total} archivos de código encontrados.`);

    const resumen = await generarResumenArquitectura(d.archivos);
    addMsg('nova', resumen);
    if (state.audioOn) speak(`Proyecto escaneado. ${d.total} archivos encontrados.`);

  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'El agente tardó demasiado escaneando.' : e.message;
    addMsg('nova', `⚠ Error escaneando el proyecto: ${msg}`);
  }
}

async function generarResumenArquitectura(archivos) {
  const arbol = archivos.slice(0, 200).map(a => a.ruta).join('\n');
  try {
    return await llamarNvidia([{
      role: 'user',
      content: `Aquí está la lista de archivos de un proyecto de app móvil (BajateApp, app social hiperlocal de planes, iOS/Android):
${arbol}

Da un resumen breve (4-5 frases) en español de: qué framework/stack parece usar, cómo está organizado el proyecto, y qué carpetas o módulos principales identificas.`
    }], 500);
  } catch (e) {
    log('Error resumen arquitectura:', e.message);
    return 'Escaneo completo, pero no pude generar el resumen de arquitectura ahora mismo.';
  }
}

async function leerArchivoProyecto(rutaRelativa) {
  if (!proyectoEscaneado) throw new Error('Primero hay que escanear el proyecto.');
  const r = await fetch(`${AGENT}/api/proyecto/leer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ruta_proyecto: proyectoEscaneado.raiz, archivo: rutaRelativa }),
    signal: AbortSignal.timeout(10000)
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error);
  return d.contenido;
}

// Dada una pregunta sobre el código, decide qué archivos son relevantes por
// nombre, los lee de verdad, y responde con ese código real como contexto.
export async function preguntarSobreProyecto(pregunta) {
  if (!proyectoEscaneado) {
    const ruta = await obtenerRutaProyecto();
    if (ruta) {
      await escanearProyecto(ruta);
      if (!proyectoEscaneado) return; // el escaneo falló y ya avisó
    } else {
      addMsg('nova', 'Primero tengo que escanear el proyecto. Dime "analiza el proyecto de BajateApp" o dame la ruta.');
      return;
    }
  }

  addMsg('nova', '🔎 Buscando en el código...');

  try {
    const listaArchivos = proyectoEscaneado.archivos.map(a => a.ruta).join('\n');
    const seleccionRaw = await llamarNvidia([{
      role: 'user',
      content: `Lista de archivos del proyecto:
${listaArchivos}

Pregunta del usuario: "${pregunta}"

¿Qué 1-4 archivos de esa lista son más probablemente relevantes para responder esa pregunta? Responde SOLO con las rutas exactas tal cual aparecen en la lista, una por línea, sin explicaciones ni numeración.`
    }], 200);

    const rutasElegidas = seleccionRaw.split('\n')
      .map(l => l.trim().replace(/^[-*]\s*/, ''))
      .filter(l => proyectoEscaneado.archivos.some(a => a.ruta === l))
      .slice(0, 4);

    if (rutasElegidas.length === 0) {
      addMsg('nova', 'No he identificado archivos claramente relevantes para esa pregunta en el proyecto.');
      return;
    }

    const contenidos = [];
    for (const ruta of rutasElegidas) {
      try {
        const c = await leerArchivoProyecto(ruta);
        contenidos.push(`// ${ruta}\n${c.substring(0, 6000)}`);
      } catch (e) { log('No se pudo leer', ruta, e.message); }
    }

    if (contenidos.length === 0) {
      addMsg('nova', 'Identifiqué archivos relevantes pero no pude leerlos.');
      return;
    }

    const respuesta = await llamarNvidia([{
      role: 'system',
      content: 'Eres un experto programador analizando código real de una app. Responde en español, directo, citando archivos y funciones concretas cuando aplique.'
    }, {
      role: 'user',
      content: `Pregunta: ${pregunta}\n\nCódigo relevante:\n${contenidos.join('\n\n')}`
    }], 1200);

    addMsg('nova', respuesta);
    if (state.audioOn) speak(respuesta.substring(0, 300));

  } catch (e) {
    const msg = e.name === 'TimeoutError' ? 'El análisis tardó demasiado.' : e.message;
    addMsg('nova', `⚠ Error analizando el código: ${msg}`);
  }
}