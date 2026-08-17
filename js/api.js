import { API_KEY, SUPA_URL, SUPA_KEY } from './config.js';

async function supa(path, method = 'GET', body = null) {
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json'
  };
  if (method === 'POST') headers['Prefer'] = 'return=minimal';
  const r = await fetch(SUPA_URL + '/rest/v1/' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  if (!r.ok) {
    const err = await r.text().catch(() => r.statusText);
    throw new Error(`Supabase ${r.status}: ${err}`);
  }
  return method === 'GET' ? r.json() : r;
}

export async function saveMsg(rol, contenido) {
  try { await supa('mensajes', 'POST', { rol, contenido }); } catch (e) { console.warn(e); }
}

export async function loadMsgs() {
  try { return await supa('mensajes?select=rol,contenido,fecha&order=fecha.asc'); }
  catch (e) { console.warn(e); return []; }
}

export async function loadMem() {
  try { const d = await supa('memoria?select=resumen&limit=1'); return d[0]?.resumen || ''; }
  catch (e) { return ''; }
}

export async function updateMem(hist) {
  try {
    const p = `Resume en máximo 300 palabras lo que sabes sobre este usuario. Proyectos, preferencias, datos clave. Solo el resumen.\n${hist.slice(-30).map(m => m.rol + ': ' + m.contenido).join('\n')}`;
    const r = await groq(p, 'openai/gpt-oss-120b', 400);
    try {
      await supa('memoria?id=eq.1', 'PATCH', { resumen: r, actualizado: new Date().toISOString() });
    } catch (e) {
      await supa('memoria', 'POST', { id: 1, resumen: r, actualizado: new Date().toISOString() });
    }
    return r;
  } catch (e) { return ''; }
}

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
  throw new Error('Límite de velocidad excedido tras varios intentos');
}