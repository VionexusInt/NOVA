import { state } from './state.js';
import { esc } from './helpers.js';
import { saveMsg, updateMem, groqChat } from './api.js';
import { setOrb, setTargetLevel } from './orb.js';
import { speak } from './audio.js';
import { detectPanel } from './paneles.js';
import { parsearAccionPC, procesarAccionesPC, agentDisponible, ejecutarAccion } from './agent.js';

export function addMsg(role, text) {
  if (!text || typeof text !== 'string') return;
  const cleanText = text.trim();
  if (!cleanText) return;
  const d = document.getElementById('display');
  if (!d) return;
  const ph = document.getElementById('ph');
  if (ph) ph.remove();
  const el = document.createElement('div');
  el.className = 'msg';
  const safeText = esc(cleanText);
  el.innerHTML = `<div class="mw ${role === 'user' ? 'user' : 'nova'}">${role === 'user' ? '// TÚ' : '// N.O.V.A'}</div><div class="mt ${role === 'user' ? 'user' : 'nova'}">${safeText}</div>`;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

export function showTyping() {
  rmTyping();
  const d = document.getElementById('display');
  if (!d) return;
  const el = document.createElement('div');
  el.className = 'msg typing-indicator-msg'; el.id = 'typing';
  el.innerHTML = '<div class="mw nova">// N.O.V.A</div><div class="typing"><span></span><span></span><span></span></div>';
  d.appendChild(el); d.scrollTop = d.scrollHeight;
}

export function rmTyping() {
  document.querySelectorAll('#typing, .typing-indicator-msg').forEach(e => e.remove());
}

// ══ SISTEMA PROMPT JARVIS ══
const SYS_BASE = `Eres NOVA, un sistema de inteligencia artificial avanzado y personal — exactamente como JARVIS en Iron Man.
Personalidad: frío, preciso, ligeramente irónico, extremadamente eficiente. Sin muletillas ni relleno.
Idioma: español de España. Respuestas de 1-3 frases salvo que pidan más detalle.
Nunca dices "claro", "por supuesto", "perfecto", "entendido". Vas directo al punto.
Tienes acceso a búsqueda web en tiempo real — úsala cuando necesites información actual.
Tienes control total del PC del usuario.`;

const SYS_AGENTE = `

CONTROL TOTAL DEL PC — INSTRUCCIONES:
Cuando el usuario pida una acción en el PC, incluye bloques al final de tu respuesta:
[ACCION:nombre|param1:valor1|param2:valor2]

ACCIONES DISPONIBLES:
Programas: [ACCION:abrir_programa|nombre:chrome]
Webs: [ACCION:abrir_web|url:https://google.com]
Google: [ACCION:buscar_google|query:texto a buscar]
Escribir: [ACCION:escribir|texto:lo que escribir]
Teclas: [ACCION:tecla|key:enter] / [ACCION:hotkey|keys:ctrl,c]
Screenshot: [ACCION:screenshot|nombre:captura]
Volumen: [ACCION:volumen|accion:subir|bajar|silencio]
Archivos: [ACCION:listar_carpeta|ruta:C:/Users/user/Desktop]
Buscar archivo: [ACCION:buscar_archivo|nombre:documento.pdf]
Abrir archivo: [ACCION:abrir_archivo|ruta:C:/ruta/archivo.pdf]
Carpeta: [ACCION:abrir_carpeta|ruta:C:/Users/user/Desktop]
Ventanas: [ACCION:listar_ventanas] / [ACCION:enfocar_ventana|titulo:Chrome]
Cerrar ventana: [ACCION:cerrar_ventana|titulo:Chrome]
Procesos: [ACCION:procesos] / [ACCION:matar_proceso|nombre:chrome.exe]
Sistema: [ACCION:sistema_info]
Word: [ACCION:crear_word|nombre:titulo|contenido:texto completo aquí]
PDF: [ACCION:crear_pdf|nombre:titulo|contenido:texto completo aquí]
Imagen: [ACCION:crear_imagen|nombre:titulo|texto:texto en la imagen]
CMD: [ACCION:ejecutar_cmd|cmd:dir C:\\]
Automatización: [ACCION:crear_auto|nombre:id|cond_tipo:cpu_mayor|cond_valor:80|acc_tipo:notificar|acc_valor:CPU alta]

EJEMPLOS REALES:
"Abre Chrome" → "Abriendo Chrome.[ACCION:abrir_programa|nombre:chrome]"
"Busca trabajo en Madrid" → "Buscando.[ACCION:buscar_google|query:trabajo en Madrid]"
"Crea un anuncio de trabajo" → "Generando.[ACCION:crear_word|nombre:Anuncio Trabajo|contenido:OFERTA DE EMPLEO\\n\\nPuesto vacante\\nEmpresa\\n\\nRequisitos:\\n- Experiencia 2 años\\n- Incorporación inmediata\\n\\nEnviar CV a: rrhh@empresa.com]"
"Qué procesos consumen más CPU" → muestra info del sistema + [ACCION:sistema_info]
"Cierra el explorador" → [ACCION:cerrar_ventana|titulo:Explorador de archivos]`;

let agentActivo = false;
let monitorInterval = null;

agentDisponible().then(ok => {
  agentActivo = ok;
  if (ok) {
    console.log('🤖 Agente NOVA activo');
    iniciarMonitorProactivo();
  }
});

// ── MONITOR PROACTIVO ──
function iniciarMonitorProactivo() {
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = setInterval(async () => {
    try {
      const r = await fetch('http://localhost:4000/api/notificaciones');
      const ns = await r.json();
      for (const n of ns) {
        addMsg('nova', `${n.titulo}: ${n.mensaje}`);
        if (state.audioOn) speak(`${n.titulo}. ${n.mensaje}`);
      }
    } catch (e) {}
  }, 15000);
}

export async function askNova(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return;
  const cleanText = text.trim();

  detectPanel(cleanText);
  addMsg('user', cleanText);
  state.hist.push({ role: 'user', content: cleanText });
  await saveMsg('user', cleanText);
  state.msgN++;

  setOrb('thinking');
  showTyping();
  setTargetLevel(0.45);

  try {
    // Si pide info del sistema, obtenerla primero
    let contextoSistema = '';
    if (/cpu|ram|memoria|proceso|disco|bateria|sistema/i.test(cleanText) && agentActivo) {
      try {
        const r = await ejecutarAccion('sistema_info', {});
        contextoSistema = `\n\nINFO SISTEMA ACTUAL: CPU ${r.cpu}% | RAM ${r.ram_usada}/${r.ram_total}GB (${r.ram_pct}%) | Disco libre: ${r.disco_libre}GB`;
      } catch (e) {}
    }

    const sysFull = SYS_BASE
      + (agentActivo ? SYS_AGENTE : '')
      + contextoSistema
      + (state.mem ? '\n\nSABES DEL USUARIO:\n' + state.mem : '');

    const rawReply = await groqChat(
      [{ role: 'system', content: sysFull }, ...state.hist.slice(-50)],
      'openai/gpt-oss-20b', 1000
    );

    const { acciones, textoLimpio } = parsearAccionPC(rawReply);
    const reply = textoLimpio || rawReply;

    state.hist.push({ role: 'assistant', content: reply });
    await saveMsg('assistant', reply);
    state.msgN++;
    if (state.msgN % 20 === 0) state.mem = await updateMem(state.hist);

    rmTyping();
    addMsg('nova', reply);

    if (acciones.length > 0 && agentActivo) {
      setOrb('thinking');
      addMsg('nova', `⚡ Ejecutando ${acciones.length} acción${acciones.length > 1 ? 'es' : ''}...`);
      const resultados = await procesarAccionesPC(acciones);
      const fallos = resultados.filter(r => !r.ok);
      if (fallos.length > 0) {
        addMsg('nova', `⚠ Fallo en: ${fallos.map(f => f.accion).join(', ')}`);
      }
    }

    setOrb('speaking');
    if (state.audioOn) {
      state.lastSpokenText = reply;
      speak(reply);
    } else {
      setOrb('idle');
      setTargetLevel(0);
    }

  } catch (e) {
    rmTyping();
    setOrb('idle');
    setTargetLevel(0);
    addMsg('nova', '⚠ ' + esc(e.message || 'Error del sistema.'));
  }
}

export function sendText() {
  const i = document.getElementById('txtIn');
  if (!i) return;
  const t = i.value.trim();
  if (!t) return;
  i.value = '';
  askNova(t);
}

export async function clearHistory() {
  if (!confirm('¿Borrar todo el historial?')) return;
  try {
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWxvZmJsc2Vwcm9uYnl6aXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjEzMjAsImV4cCI6MjEwMjUzNzMyMH0.ACFsSthcARANk8zyfeRZiQLeHawVvOAr0cqAzjsZ-1A';
    const SUPA_URL = 'https://ufmlofblsepronbyzish.supabase.co';
    await fetch(SUPA_URL + '/rest/v1/mensajes?id=gt.0', { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } });
    await fetch(SUPA_URL + '/rest/v1/memoria?id=eq.1', { method: 'PATCH', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ resumen: '' }) });
  } catch (e) {}
  state.hist = []; state.mem = ''; state.msgN = 0;
  const d = document.getElementById('display');
  if (d) d.innerHTML = '<div class="empty">// HISTORIAL BORRADO //</div>';
  addMsg('nova', 'Historial eliminado.');
}