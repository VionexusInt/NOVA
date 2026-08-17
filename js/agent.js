const AGENT_URL = 'http://localhost:4000';

export async function agentDisponible() {
  try {
    const r = await fetch(AGENT_URL + '/api/ping', { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch { return false; }
}

export async function ejecutarAccion(accion, params = {}) {
  const r = await fetch(AGENT_URL + '/api/accion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion, params })
  });
  const d = await r.json();
  if (!d.ok) throw new Error(d.error);
  return d.resultado;
}

export function parsearAccionPC(respuesta) {
  const regex = /\[ACCION:([^\]]+)\]/g;
  const acciones = [];
  let match;

  while ((match = regex.exec(respuesta)) !== null) {
    const partes = match[1].split('|');
    const accion = partes[0];
    const params = {};
    for (let i = 1; i < partes.length; i++) {
      const [k, ...v] = partes[i].split(':');
      params[k] = v.join(':');
    }
    acciones.push({ accion, params });
  }

  const textoLimpio = respuesta.replace(/\[ACCION:[^\]]+\]/g, '').trim();
  return { acciones, textoLimpio };
}

export async function procesarAccionesPC(acciones) {
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