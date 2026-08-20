// ── SOCIO BAJATEAPP — MULTI-DEPARTAMENTO ──
// Seguimiento de compromisos/métricas + generación de ideas ancladas
// al contexto real del negocio, organizadas por departamento.

import { groqChat, setMemoria, loadMemoriaEstructurada, delMemoria } from './api.js';
import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak, speakAndWait } from './audio.js';

const CATEGORIA = 'bajateapp';
const DIAS_VIGENCIA_COMPROMISO = 4;

function log(...args) { console.log('[BAJATEAPP]', ...args); }

// Contexto real del negocio — se inyecta en cada generación de ideas
// para que sean específicas, no consejos genéricos de manual.
export const CONTEXTO_EMPRESA = `BÁJATE (bajateapp) es una app móvil gratuita para jóvenes de 16-28 años en Elche y la provincia de Alicante.
Sirve para encontrar planes y gente para salir HOY cuando el grupo habitual no puede — NO es una app de citas, es de planes y quedadas.
Es hiperlocal: solo se ven planes y gente de la zona (Elche, Santa Pola, Arenales, Alicante capital).
Modelo de negocio: gratis para usuarios. Monetiza dando visibilidad y promoción en tiempo real a negocios locales (bares, restaurantes, ocio) que quieren llegar a jóvenes que están decidiendo dónde salir esa noche.
Fundador: Andrés Meseguer. Disponible en App Store desde septiembre de 2026, Android próximamente en Google Play.
Fase actual: lanzamiento reciente, captando primeros usuarios y primeros negocios locales en Elche.
Instagram oficial: @bajateapp.`;

export const DEPARTAMENTOS = {
  crecimiento: { label: 'Crecimiento de usuarios', icon: '📈' },
  negocios: { label: 'Captación de negocios', icon: '🤝' },
  producto: { label: 'Producto e ideas', icon: '💡' },
};

function escHtml(txt) {
  if (!txt) return '';
  return String(txt).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── ANÁLISIS EN SEGUNDO PLANO — compromisos y métricas mencionados casualmente ──
export async function analizarMencionBajateApp(textoUsuario) {
  if (!/bajateapp|b[aá]jate\s*app/i.test(textoUsuario)) return;

  try {
    const pendientes = await obtenerCompromisosPendientes();
    const listaPendientes = pendientes.map(p => `[${p.clave}] ${p.texto}`).join('\n') || 'ninguno';

    const raw = await groqChat([{
      role: 'system',
      content: `Analizas un mensaje sobre BÁJATE (bajateapp) para un asistente que actúa como socio de negocio.
Compromisos pendientes actuales:
${listaPendientes}

Devuelve SOLO JSON con esta estructura exacta, sin texto adicional:
{
  "nuevo_compromiso": "texto del compromiso nuevo o null",
  "metrica": {"tipo": "usuarios|ventas|ingresos|descargas|otro", "valor": "cifra o texto", "texto": "frase completa"} o null,
  "resuelve": ["clave1", "clave2"]
}
Solo marca "resuelve" si el mensaje CLARAMENTE confirma que ese compromiso se cumplió, canceló o ya no aplica.`
    }, { role: 'user', content: textoUsuario }], 'openai/gpt-oss-20b', 250);

    const limpio = raw.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
    const start = limpio.indexOf('{');
    const end = limpio.lastIndexOf('}');
    if (start === -1 || end === -1) return;
    const datos = JSON.parse(limpio.substring(start, end + 1));

    if (datos.nuevo_compromiso) await guardarCompromiso(datos.nuevo_compromiso);
    if (datos.metrica && datos.metrica.valor) await guardarMetrica(datos.metrica);
    if (Array.isArray(datos.resuelve)) {
      for (const clave of datos.resuelve) await marcarResuelto(clave);
    }
  } catch (e) {
    log('Error analizando mención (no crítico):', e.message);
  }
}

async function guardarCompromiso(texto) {
  const clave = `compromiso_${Date.now()}`;
  await setMemoria(CATEGORIA, clave, JSON.stringify({ texto, fecha: new Date().toISOString(), cumplido: false }), 4);
}

async function guardarMetrica(metrica) {
  const clave = `metrica_${metrica.tipo}_${Date.now()}`;
  await setMemoria(CATEGORIA, clave, JSON.stringify({ ...metrica, fecha: new Date().toISOString() }), 4);
}

async function marcarResuelto(clave) {
  try {
    const mem = await loadMemoriaEstructurada();
    const entrada = mem[CATEGORIA]?.[clave];
    if (!entrada) return;
    const data = JSON.parse(entrada.valor);
    data.cumplido = true;
    data.fecha_resuelto = new Date().toISOString();
    await setMemoria(CATEGORIA, clave, JSON.stringify(data), 4);
  } catch (e) { log('Error marcando resuelto:', e.message); }
}

async function obtenerCompromisosPendientes() {
  try {
    const mem = await loadMemoriaEstructurada();
    const cat = mem[CATEGORIA] || {};
    const ahora = Date.now();
    const vigenciaMs = DIAS_VIGENCIA_COMPROMISO * 24 * 60 * 60 * 1000;
    const compromisos = [];
    for (const [clave, obj] of Object.entries(cat)) {
      if (!clave.startsWith('compromiso_')) continue;
      try {
        const data = JSON.parse(obj.valor);
        if (data.cumplido) continue;
        if (ahora - new Date(data.fecha).getTime() > vigenciaMs) continue;
        compromisos.push({ clave, ...data });
      } catch (e) {}
    }
    return compromisos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  } catch (e) { log('Error obteniendo pendientes:', e.message); return []; }
}

async function obtenerMetricasRecientes(dias = 7) {
  try {
    const mem = await loadMemoriaEstructurada();
    const cat = mem[CATEGORIA] || {};
    const ahora = Date.now();
    const vigenciaMs = dias * 24 * 60 * 60 * 1000;
    const metricas = [];
    for (const [clave, obj] of Object.entries(cat)) {
      if (!clave.startsWith('metrica_')) continue;
      try {
        const data = JSON.parse(obj.valor);
        if (ahora - new Date(data.fecha).getTime() > vigenciaMs) continue;
        metricas.push(data);
      } catch (e) {}
    }
    return metricas;
  } catch (e) { return []; }
}

// ── CHECK-IN DIARIO / BAJO DEMANDA ──
export async function checkInSocio() {
  const pendientes = await obtenerCompromisosPendientes();
  const metricas = await obtenerMetricasRecientes(7);
  if (pendientes.length === 0 && metricas.length === 0) return;

  let mensaje;
  if (pendientes.length > 0) {
    const lista = pendientes.map(p => p.texto).join('. ');
    mensaje = pendientes.length === 1
      ? `Socio, sobre BajateApp: dijiste que ibas a ${lista}. ¿Cómo quedó?`
      : `Socio, tienes ${pendientes.length} cosas pendientes de BajateApp: ${lista}. Cuéntame cómo van.`;
  } else {
    mensaje = 'Socio, ¿alguna novedad de BajateApp que deba saber?';
  }
  addMsg('nova', mensaje);
  if (state.audioOn) await speakAndWait(mensaje);
}

export async function reunionDeSocios() {
  const pendientes = await obtenerCompromisosPendientes();
  const metricas = await obtenerMetricasRecientes(14);

  addMsg('nova', '📊 Repasando el estado de BajateApp...');

  if (pendientes.length === 0 && metricas.length === 0) {
    const msg = 'No tengo nada pendiente registrado de BajateApp. Cuéntame qué tal va.';
    addMsg('nova', msg);
    if (state.audioOn) await speakAndWait(msg);
    return;
  }

  if (metricas.length > 0) {
    const resumenMetricas = metricas.slice(-5).map(m => m.texto || `${m.tipo}: ${m.valor}`).join(' · ');
    addMsg('nova', `📈 Últimas métricas: ${resumenMetricas}`);
  }

  if (pendientes.length > 0) {
    const lista = pendientes.map(p => `• ${p.texto}`).join('\n');
    addMsg('nova', `📋 Pendientes:\n${lista}`);
    const mensajeVoz = pendientes.length === 1
      ? `Tienes pendiente: ${pendientes[0].texto}. ¿Cómo va?`
      : `Tienes ${pendientes.length} cosas pendientes de BajateApp. Cuéntame cómo van.`;
    if (state.audioOn) await speakAndWait(mensajeVoz);
  }
}

// ── GENERACIÓN DE IDEAS POR DEPARTAMENTO ──
// Usa compound-beta (con búsqueda web real) para poder anclar ideas a
// cosas actuales — ferias locales, tendencias, referencias reales.

async function generarIdeas(departamento) {
  const dep = DEPARTAMENTOS[departamento];
  if (!dep) return [];

  try {
    const raw = await groqChat([{
      role: 'user',
      content: `${CONTEXTO_EMPRESA}

Actúa como socio cofundador experto en ${dep.label.toLowerCase()} para startups locales de app móvil.
Dame 4 ideas CONCRETAS y ACCIONABLES de ${dep.label.toLowerCase()} para BÁJATE, específicas para su contexto real (Elche/Alicante, 16-28 años, fase de lanzamiento reciente).
Nada de consejos genéricos de manual tipo "haz marketing en redes sociales" — sé específico: qué hacer exactamente, con quién, cómo, aprovechando que es hiperlocal.
Si conoces eventos, ferias o fechas locales de Elche/Alicante relevantes, apóyate en ellos.
Responde SOLO con una lista numerada de 4 ideas, cada una en 1-2 frases, sin introducción ni cierre.`
    }], 'compound-beta', 600);

    const ideas = raw.split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(l => l.length > 15);

    return ideas.slice(0, 4);
  } catch (e) {
    log('Error generando ideas:', e.message);
    return [];
  }
}

async function guardarIdeasComoBanco(departamento, ideas) {
  const ts = Date.now();
  for (let i = 0; i < ideas.length; i++) {
    const clave = `idea_${departamento}_${ts}_${i}`;
    const data = { texto: ideas[i], departamento, fecha: new Date().toISOString(), estado: 'pendiente' };
    try { await setMemoria(CATEGORIA, clave, JSON.stringify(data), 3); }
    catch (e) { log('Error guardando idea:', e.message); }
  }
}

function mostrarIdeas(departamento, ideas) {
  initIdeaStyles();
  const dep = DEPARTAMENTOS[departamento];
  const d = document.getElementById('display');
  if (!d) return;

  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `
    <div class="mw nova">// N.O.V.A — IDEAS · ${dep.icon} ${dep.label.toUpperCase()}</div>
    <div class="idea-card">
      ${ideas.map((idea, i) => `
        <div class="idea-item">
          <div class="idea-num">${i + 1}</div>
          <div class="idea-texto">${escHtml(idea)}</div>
        </div>
      `).join('')}
      <div class="idea-nota">Guardadas en el banco de ideas. Di "banco de ideas" para revisarlas cuando quieras.</div>
    </div>`;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

export async function ideasDepartamento(departamento) {
  const dep = DEPARTAMENTOS[departamento];
  if (!dep) {
    addMsg('nova', 'No reconozco ese departamento. Puedo darte ideas de crecimiento, negocios o producto.');
    return;
  }

  addMsg('nova', `${dep.icon} Pensando ideas de ${dep.label.toLowerCase()} para BajateApp...`);

  const ideas = await generarIdeas(departamento);

  if (ideas.length === 0) {
    const msg = 'No he podido generar ideas ahora mismo. Inténtalo de nuevo en un momento.';
    addMsg('nova', msg);
    if (state.audioOn) speak(msg);
    return;
  }

  await guardarIdeasComoBanco(departamento, ideas);
  mostrarIdeas(departamento, ideas);

  const resumenVoz = `Tienes ${ideas.length} ideas nuevas de ${dep.label.toLowerCase()}. La primera: ${ideas[0]}`;
  if (state.audioOn) speak(resumenVoz);
}

// ── BANCO DE IDEAS ──
export async function listarBancoIdeas(departamento = null) {
  try {
    const mem = await loadMemoriaEstructurada();
    const cat = mem[CATEGORIA] || {};
    const ideas = [];
    for (const [clave, obj] of Object.entries(cat)) {
      if (!clave.startsWith('idea_')) continue;
      try {
        const data = JSON.parse(obj.valor);
        if (departamento && data.departamento !== departamento) continue;
        if (data.estado === 'hecha' || data.estado === 'descartada') continue;
        ideas.push({ clave, ...data });
      } catch (e) {}
    }
    ideas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (ideas.length === 0) {
      const msg = departamento
        ? `No tienes ideas guardadas de ${DEPARTAMENTOS[departamento]?.label.toLowerCase() || departamento}.`
        : 'No tienes ideas pendientes en el banco. Pide ideas de crecimiento, negocios o producto.';
      addMsg('nova', msg);
      if (state.audioOn) await speakAndWait(msg);
      return;
    }

    const porDepartamento = {};
    for (const idea of ideas) {
      if (!porDepartamento[idea.departamento]) porDepartamento[idea.departamento] = [];
      porDepartamento[idea.departamento].push(idea);
    }

    initIdeaStyles();
    const d = document.getElementById('display');
    if (d) {
      const el = document.createElement('div');
      el.className = 'msg';
      el.innerHTML = `
        <div class="mw nova">// N.O.V.A — BANCO DE IDEAS</div>
        <div class="idea-card">
          ${Object.entries(porDepartamento).map(([dep, lista]) => `
            <div class="idea-departamento-header">${DEPARTAMENTOS[dep]?.icon || '💡'} ${DEPARTAMENTOS[dep]?.label || dep}</div>
            ${lista.map(idea => `
              <div class="idea-item">
                <div class="idea-texto">${escHtml(idea.texto)}</div>
              </div>
            `).join('')}
          `).join('')}
        </div>`;
      d.appendChild(el);
      d.scrollTop = d.scrollHeight;
    }

    const msg = `Tienes ${ideas.length} ideas guardadas en el banco.`;
    if (state.audioOn) await speakAndWait(msg);

  } catch (e) {
    log('Error listando banco de ideas:', e.message);
    addMsg('nova', '⚠ No he podido leer el banco de ideas ahora mismo.');
  }
}

// Marca una idea como hecha buscando coincidencia parcial de texto — comando explícito
export async function marcarIdeaHecha(fragmentoTexto) {
  try {
    const mem = await loadMemoriaEstructurada();
    const cat = mem[CATEGORIA] || {};
    const frag = fragmentoTexto.toLowerCase();

    for (const [clave, obj] of Object.entries(cat)) {
      if (!clave.startsWith('idea_')) continue;
      try {
        const data = JSON.parse(obj.valor);
        if (data.estado !== 'pendiente') continue;
        if (data.texto.toLowerCase().includes(frag)) {
          data.estado = 'hecha';
          data.fecha_resuelto = new Date().toISOString();
          await setMemoria(CATEGORIA, clave, JSON.stringify(data), 3);
          addMsg('nova', `✅ Marcada como hecha: ${data.texto}`);
          return;
        }
      } catch (e) {}
    }
    addMsg('nova', 'No he encontrado ninguna idea que coincida con eso.');
  } catch (e) {
    addMsg('nova', '⚠ Error marcando la idea.');
  }
}

export function initIdeaStyles() {
  if (document.getElementById('idea-styles')) return;
  const s = document.createElement('style');
  s.id = 'idea-styles';
  s.textContent = `
    .idea-card {
      border: 1px solid rgba(74,158,255,0.18);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 6px;
      background: rgba(0,4,14,0.85);
      max-width: 560px;
      padding: 4px 0;
    }
    .idea-departamento-header {
      font-family: 'DM Mono', monospace;
      font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase;
      color: rgba(74,158,255,0.55);
      padding: 12px 18px 8px;
      border-bottom: 1px solid rgba(74,158,255,0.08);
    }
    .idea-item {
      display: flex; gap: 12px;
      padding: 12px 18px;
      border-bottom: 1px solid rgba(74,158,255,0.06);
    }
    .idea-item:last-child { border-bottom: none; }
    .idea-num {
      font-family: 'DM Mono', monospace;
      font-size: 11px; font-weight: 500;
      color: rgba(74,158,255,0.5);
      flex-shrink: 0;
      width: 16px;
    }
    .idea-texto {
      font-family: 'Fraunces', serif;
      font-size: 13px; line-height: 1.65; font-weight: 300;
      color: rgba(215,228,248,0.88);
    }
    .idea-nota {
      font-family: 'DM Mono', monospace;
      font-size: 8px; letter-spacing: 0.05em;
      color: rgba(140,175,220,0.35);
      padding: 10px 18px 12px;
      font-style: italic;
    }
  `;
  document.head.appendChild(s);
}