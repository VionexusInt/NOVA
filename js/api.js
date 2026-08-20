import { API_KEY, SUPA_URL, SUPA_KEY } from './config.js';

// ══════════════════════════════════════════
// SUPABASE
// ══════════════════════════════════════════
async function supa(path, method = 'GET', body = null) {
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json'
  };
  if (method === 'POST') headers['Prefer'] = 'return=minimal';
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    method, headers,
    body: body ? JSON.stringify(body) : null
  });
  if (!r.ok) {
    const err = await r.text().catch(() => r.statusText);
    throw new Error(`Supabase ${r.status}: ${err}`);
  }
  return method === 'GET' ? r.json() : r;
}

// ══════════════════════════════════════════
// MENSAJES
// ══════════════════════════════════════════
export async function saveMsg(rol, contenido) {
  try { await supa('mensajes', 'POST', { rol, contenido }); }
  catch (e) { console.warn('saveMsg:', e.message); }
}

export async function loadMsgs() {
  try { return await supa('mensajes?select=rol,contenido,fecha&order=fecha.asc'); }
  catch (e) { console.warn('loadMsgs:', e.message); return []; }
}

// ══════════════════════════════════════════
// MEMORIA SIMPLE (resumen texto)
// ══════════════════════════════════════════
export async function loadMem() {
  try {
    const d = await supa('memoria?select=resumen&limit=1');
    return d[0]?.resumen || '';
  } catch (e) { return ''; }
}

export async function updateMem(hist) {
  try {
    const p = `Resume en máximo 300 palabras lo que sabes sobre este usuario. Proyectos, preferencias, datos clave. Solo el resumen.\n${hist.slice(-30).map(m => m.rol + ': ' + m.contenido).join('\n')}`;
    const r = await groq(p, 'openai/gpt-oss-20b', 400);
    try {
      await supa('memoria?id=eq.1', 'PATCH', { resumen: r, actualizado: new Date().toISOString() });
    } catch {
      await supa('memoria', 'POST', { id: 1, resumen: r, actualizado: new Date().toISOString() });
    }
    return r;
  } catch (e) { console.warn('updateMem:', e); return ''; }
}

// ══════════════════════════════════════════
// MEMORIA ESTRUCTURADA
// Categorías: persona, proyecto, preferencia, decision, dato, habito
// ══════════════════════════════════════════

// Cargar toda la memoria estructurada
export async function loadMemoriaEstructurada() {
  try {
    const rows = await supa('memoria_estructurada?select=categoria,clave,valor,confianza&order=actualizado.desc');
    const mem = {};
    for (const row of rows) {
      if (!mem[row.categoria]) mem[row.categoria] = {};
      mem[row.categoria][row.clave] = { valor: row.valor, confianza: row.confianza };
    }
    return mem;
  } catch (e) { console.warn('loadMemoriaEstructurada:', e); return {}; }
}

export async function setMemoria(categoria, clave, valor, confianza = 3) {
  try {
    const headers = {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    };
    const r = await fetch(SUPA_URL + '/rest/v1/memoria_estructurada?on_conflict=categoria,clave', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        categoria, clave,
        valor: String(valor),
        confianza,
        actualizado: new Date().toISOString()
      })
    });
    if (!r.ok && r.status !== 409) {
      console.warn('setMemoria: respuesta no ok', r.status);
    }
  } catch (e) { console.warn('setMemoria:', e); }
}

// Eliminar un dato de la memoria
export async function delMemoria(categoria, clave) {
  try {
    await supa(`memoria_estructurada?categoria=eq.${encodeURIComponent(categoria)}&clave=eq.${encodeURIComponent(clave)}`, 'DELETE');
  } catch (e) { console.warn('delMemoria:', e); }
}

// Formatear la memoria estructurada como texto para el system prompt
export function formatearMemoria(mem) {
  const categorias = {
    persona: '👤 PERSONAS CONOCIDAS',
    proyecto: '📁 PROYECTOS',
    preferencia: '⭐ PREFERENCIAS',
    decision: '✅ DECISIONES TOMADAS',
    dato: '📌 DATOS PERSONALES',
    habito: '🔄 HÁBITOS Y RUTINAS',
    contacto: '📞 CONTACTOS',
  };

  const lineas = [];
  for (const [cat, label] of Object.entries(categorias)) {
    if (!mem[cat] || Object.keys(mem[cat]).length === 0) continue;
    lineas.push(`\n${label}:`);
    for (const [clave, { valor, confianza }] of Object.entries(mem[cat])) {
      const conf = confianza >= 4 ? '' : confianza <= 2 ? ' (incierto)' : '';
      lineas.push(`  - ${clave}: ${valor}${conf}`);
    }
  }
  return lineas.join('\n');
}

// Extrae un objeto JSON de un texto que puede venir con markdown, texto extra, etc.
function extraerJsonDeTexto(texto) {
  if (!texto || typeof texto !== 'string') return null;

  let limpio = texto.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

  // Intento directo
  try { return JSON.parse(limpio); } catch (e) {}

  // Buscar el primer { y el último } — por si hay texto antes/después
  const start = limpio.indexOf('{');
  const end = limpio.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const candidato = limpio.substring(start, end + 1);
    try { return JSON.parse(candidato); } catch (e) {}
  }

  return null;
}

// Analizar conversación y extraer datos para la memoria estructurada
export async function extraerYGuardarMemoria(hist, memActual) {
  try {
    const memFormateada = formatearMemoria(memActual);
    const convReciente = hist.slice(-20).map(m => `${m.role}: ${m.content}`).join('\n');

    const prompt = `Analiza esta conversación y extrae información relevante para recordar sobre el usuario.
Devuelve SOLO un JSON válido con esta estructura (omite categorías vacías):
{
  "persona": {"nombre de persona": "descripción/relación"},
  "proyecto": {"nombre del proyecto": "descripción y estado"},
  "preferencia": {"aspecto": "preferencia del usuario"},
  "decision": {"tema": "decisión tomada"},
  "dato": {"tipo de dato": "valor"},
  "habito": {"habito": "descripción"},
  "contacto": {"nombre": "email o teléfono o empresa"},
  "eliminar": [{"categoria": "cat", "clave": "clave a eliminar"}]
}

Memoria actual del usuario:
${memFormateada || 'Sin memoria previa'}

Conversación reciente:
${convReciente}

Reglas:
- Solo incluye información nueva o que actualice lo existente
- Si algo ya está en la memoria y sigue siendo válido, no lo incluyas
- Si algo ha cambiado o es incorrecto, inclúyelo en "eliminar" primero
- Sé conciso en los valores (máximo 100 caracteres)
- Devuelve SOLO el JSON, nada de texto antes o después
- Si no hay nada nuevo, devuelve {}`;

    let respuesta;
    try {
      respuesta = await groq(prompt, 'openai/gpt-oss-20b', 600);
    } catch (e) {
      console.warn('extraerYGuardarMemoria: fallo en llamada a Groq:', e.message);
      return;
    }

    const datos = extraerJsonDeTexto(respuesta);

    if (!datos) {
      console.warn('extraerYGuardarMemoria: la IA no devolvió JSON válido, se omite esta extracción. Respuesta recibida:', respuesta?.substring(0, 200));
      return;
    }

    if (Object.keys(datos).length === 0) return;

    const categoriasValidas = new Set(['persona', 'proyecto', 'preferencia', 'decision', 'dato', 'habito', 'contacto']);

    // Procesar eliminaciones primero, validando estructura
    if (Array.isArray(datos.eliminar)) {
      for (const item of datos.eliminar) {
        if (item && typeof item === 'object' && item.categoria && item.clave) {
          try { await delMemoria(item.categoria, item.clave); }
          catch (e) { console.warn('Error eliminando', item, e.message); }
        }
      }
    }
    delete datos.eliminar;

    // Guardar nuevos datos, validando cada categoría y valor
    for (const cat of categoriasValidas) {
      const entradas = datos[cat];
      if (!entradas || typeof entradas !== 'object') continue;

      for (const [clave, valor] of Object.entries(entradas)) {
        if (!clave || valor === null || valor === undefined) continue;
        const valorStr = typeof valor === 'string' ? valor : JSON.stringify(valor);
        if (!valorStr.trim()) continue;

        try { await setMemoria(cat, clave, valorStr.substring(0, 300)); }
        catch (e) { console.warn(`Error guardando ${cat}.${clave}:`, e.message); }
      }
    }

    console.log('✅ Memoria estructurada actualizada');
  } catch (e) {
    console.warn('extraerYGuardarMemoria: error inesperado:', e.message);
  }
}

// ══════════════════════════════════════════
// GROQ
// ══════════════════════════════════════════
export async function groq(prompt, model = 'openai/gpt-oss-20b', max = 800, msgs = null) {
  const messages = msgs || [{ role: 'user', content: prompt }];
  return groqChat(messages, model, max);
}

export async function groqChat(messages, model, maxTokens) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('groqChat: mensajes vacíos o inválidos');
  }
  if (!API_KEY) {
    throw new Error('groqChat: falta la API key de Groq en config.js');
  }

  const maxAttempts = 4;
  let delay = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let r;
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
        signal: AbortSignal.timeout(30000)
      });
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        throw new Error('Groq no respondió a tiempo (timeout 30s)');
      }
      throw new Error('No se pudo conectar con Groq: ' + e.message);
    }

    if (r.status === 429) {
      console.warn(`Rate limit, reintento ${attempt}/${maxAttempts} en ${delay}ms`);
      if (attempt === maxAttempts) throw new Error('Límite de velocidad de Groq excedido tras varios reintentos');
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
      continue;
    }

    if (r.status === 400) {
      const err = await r.json().catch(() => null);
      throw new Error(`Groq 400: ${err?.error?.message || 'Petición inválida (posible historial demasiado largo o modelo incorrecto)'}`);
    }

    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }));
      throw new Error(err.error?.message || `Error de Groq (${r.status})`);
    }

    const d = await r.json().catch(() => null);
    if (!d) throw new Error('Groq devolvió una respuesta no parseable');
    if (d.error) throw new Error(d.error.message || 'Error desconocido de Groq');

    const contenido = d.choices?.[0]?.message?.content;
    if (contenido === undefined || contenido === null) {
      throw new Error('Groq devolvió una respuesta sin contenido');
    }

    return contenido;
  }
  throw new Error('Límite de velocidad excedido');
}