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
    await fetch(SUPA_URL + '/rest/v1/memoria_estructurada', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        categoria, clave,
        valor: String(valor),
        confianza,
        actualizado: new Date().toISOString()
      })
    });
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
- Si no hay nada nuevo, devuelve {}`;

    const respuesta = await groq(prompt, 'openai/gpt-oss-20b', 600);

    // Limpiar y parsear JSON
    const jsonStr = respuesta.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const datos = JSON.parse(jsonStr);

    if (!datos || Object.keys(datos).length === 0) return;

    // Procesar eliminaciones primero
    if (datos.eliminar && Array.isArray(datos.eliminar)) {
      for (const { categoria, clave } of datos.eliminar) {
        await delMemoria(categoria, clave);
      }
      delete datos.eliminar;
    }

    // Guardar nuevos datos
    const categorias = ['persona', 'proyecto', 'preferencia', 'decision', 'dato', 'habito', 'contacto'];
    for (const cat of categorias) {
      if (!datos[cat]) continue;
      for (const [clave, valor] of Object.entries(datos[cat])) {
        if (clave && valor) {
          await setMemoria(cat, clave, valor);
        }
      }
    }

    console.log('✅ Memoria estructurada actualizada');
  } catch (e) {
    console.warn('extraerYGuardarMemoria:', e.message);
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
  const maxAttempts = 4;
  let delay = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages })
    });
    if (r.status === 429) {
      console.warn(`Rate limit, reintento ${attempt} en ${delay}ms`);
      await new Promise(res => setTimeout(res, delay));
      delay *= 2;
      continue;
    }
    if (!r.ok) {
      const err = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }));
      throw new Error(err.error?.message || 'Error de Groq');
    }
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return d.choices[0].message.content;
  }
  throw new Error('Límite de velocidad excedido');
}