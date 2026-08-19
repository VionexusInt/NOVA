const AGENT_URL = 'http://localhost:4000';

export async function agentDisponible() {
  try {
    const r = await fetch(AGENT_URL + '/api/ping', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

export async function ejecutarAccion(accion, params = {}) {
  try {
    const r = await fetch(AGENT_URL + '/api/accion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, params }),
      signal: AbortSignal.timeout(15000)
    });

    if (!r.ok) {
      throw new Error(`Agente respondió ${r.status}`);
    }

    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Acción fallida sin detalle');
    return d.resultado;

  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('El agente no respondió a tiempo (posiblemente colgado o cerrado)');
    }
    if (e instanceof TypeError) {
      throw new Error('No se pudo conectar con el agente. ¿Sigue corriendo nova_agent.py?');
    }
    throw e;
  }
}

export function parsearAccionPC(respuesta) {
  if (!respuesta || typeof respuesta !== 'string') {
    return { acciones: [], textoLimpio: '' };
  }

  const regex = /\[ACCION:([^\]]+)\]/g;
  const acciones = [];
  let match;

  while ((match = regex.exec(respuesta)) !== null) {
    const partes = match[1].split('|');
    const accion = partes[0]?.trim();
    if (!accion) continue;

    const params = {};
    for (let i = 1; i < partes.length; i++) {
      const idx = partes[i].indexOf(':');
      if (idx === -1) continue;
      const k = partes[i].substring(0, idx).trim();
      const v = partes[i].substring(idx + 1);
      if (k) params[k] = v;
    }
    acciones.push({ accion, params });
  }

  const textoLimpio = respuesta.replace(/\[ACCION:[^\]]+\]/g, '').trim();
  return { acciones, textoLimpio };
}

export async function procesarAccionesPC(acciones) {
  if (!Array.isArray(acciones) || acciones.length === 0) return [];

  const resultados = [];
  for (const { accion, params } of acciones) {
    try {
      const resultado = await ejecutarAccion(accion, params);
      resultados.push({ accion, ok: true, resultado });
      console.log(`✅ PC: ${accion} →`, resultado);
    } catch (e) {
      resultados.push({ accion, ok: false, error: e.message });
      console.error(`❌ PC: ${accion} →`, e.message);
    }
  }
  return resultados;
}