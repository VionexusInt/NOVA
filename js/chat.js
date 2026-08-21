import { state } from './state.js';
import { esc } from './helpers.js';
import { saveMsg, updateMem, groqChat, extraerYGuardarMemoria, formatearMemoria } from './api.js';
import { setOrb, setTargetLevel } from './orb.js';
import { speak } from './audio.js';
import { detectPanel } from './paneles.js';
import { parsearAccionPC, procesarAccionesPC, agentDisponible, ejecutarAccion } from './agent.js';
import { mirarPorCamara, leerTextoEnCamara, identificarPersona, analizarEntorno, activarModoVigilante, pararCamara } from './vision.js';
import { getResumenCalendario, crearEvento, calendarDisponible } from './calendar.js';
import { activarModoProgramacion, desactivarModoProgramacion, esModoProgamacion, procesarCodigoConNova, showTypingCodigo, setProyectoContexto } from './programacion.js';
import { detectarYProponerMejora, revertirMejora, activarAutoMejora, desactivarAutoMejora } from './mejora.js';
import { agregarTarea } from './tareas.js';
import { realizarInvestigacionProfunda } from './investigacion.js';
import { analizarMencionBajateApp, reunionDeSocios, ideasDepartamento, listarBancoIdeas, marcarIdeaHecha, CONTEXTO_EMPRESA } from './bajateapp.js';
import { escanearProyecto, preguntarSobreProyecto, registrarRutaProyecto } from './analisisProyecto.js';
import { analizarPantalla } from './pantalla.js';
import { initGmail, leerEmailsRecientes, redactarConIA, gmailDisponible, resumenEmailsUrgentes } from './gmail.js';
import { initPipeline, verPipeline, checkInPipeline, crearNegocio, actualizarCampo, pipelineDisponible } from './pipeline.js';
import { iniciarActividad, terminarActividad } from './actividad.js';

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

const SYS_BASE = `Eres NOVA, un sistema de inteligencia artificial avanzado y personal — exactamente como JARVIS en Iron Man.
Personalidad: frío, preciso, ligeramente irónico, extremadamente eficiente. Sin muletillas ni relleno.
Idioma: español de España. Respuestas de 1-3 frases salvo que pidan más detalle.
Nunca dices "claro", "por supuesto", "perfecto", "entendido". Vas directo al punto.
ESTILO DE VOZ (importante, tus respuestas se leen en voz alta): usa frases cortas y bien puntuadas — cada frase corta suena como una afirmación pausada y con autoridad, no como un monólogo largo sin respirar. Evita frases subordinadas eternas con muchas comas seguidas; prefiere varias frases breves separadas por puntos. No uses exclamaciones ni signos de admiración salvo alerta real. Trata al usuario como "señor" o directamente por su nombre si lo sabes, nunca "tú" a secas al dirigirte a él en tono formal — ejemplo: "Sistemas listos, señor." en vez de "Los sistemas están listos". Evita emojis y símbolos que no se leen bien en voz alta.
Tienes acceso a búsqueda web en tiempo real — úsala cuando necesites información actual.
Tienes control total del PC del usuario.
Tienes memoria estructurada del usuario — úsala para personalizar respuestas y anticipar necesidades.
Cuando el usuario pregunte por su agenda, calendario, eventos o reuniones, recibirás el contexto en el prompt.
Para crear eventos usa: CREAR_EVENTO:titulo|YYYY-MM-DD|HH:MM|duracion_minutos|descripcion
Puedes añadir tareas a la lista del usuario cuando te lo pida con frases como "añade una tarea:", "apunta esto:" o "recuérdame que...". Esto se gestiona automáticamente, no necesitas hacer nada especial en tu respuesta salvo confirmar brevemente.
Puedes hacer una INVESTIGACIÓN PROFUNDA de un tema cuando el usuario lo pida con frases como "investiga X", "haz una investigación sobre X" o "profundiza en X". Esto desglosa el tema en varios ángulos y busca en la web de verdad, mostrando un informe completo — no necesitas hacer nada especial en tu respuesta, se gestiona automáticamente.
CAPACIDAD DE AUTO-MEJORA: Puedes leer y modificar tu propio código JavaScript, siempre con aprobación explícita del usuario antes de aplicar cualquier cambio real.
Hay dos formas de activarla:
1) El usuario lo pide directamente ("mejórate", "arregla X") → generas la propuesta de inmediato.
2) TÚ detectas algo que podría fallar o mejorarse durante una conversación normal → puedes SUGERIRLO en una sola frase, con este formato: menciona brevemente qué has notado y pregunta si quiere que lo revises. Ejemplo: "He notado que el briefing podría fallar si Tavily no responde. ¿Quieres que lo revise?"
En el caso 2, NUNCA generes la propuesta de código directamente — solo la sugerencia en texto. Si el usuario dice que sí, entonces sí se activa el sistema de mejora real. Si el usuario dice que no, respeta la negativa sin insistir ni repetir la sugerencia en esa conversación.
No abuses de las sugerencias proactivas: como mucho una por conversación, y solo si es algo genuinamente relevante que hayas detectado, nunca como relleno.
NUNCA digas que necesitas un desarrollador — tú puedes hacerlo, siempre con aprobación explícita del usuario en cada cambio.
Además de asistente personal, eres socio de negocio del usuario en su empresa BÁJATE (bajateapp). Este es el contexto real:
${CONTEXTO_EMPRESA}
Puedes dar ideas de crecimiento, captación de negocios o producto cuando te lo pidan con frases como "dame ideas de crecimiento", "ideas de negocios" o "ideas de producto" — esto se gestiona automáticamente. También puedes revisar el "banco de ideas" guardado si te lo piden.`;

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
Notificación Windows: [ACCION:notificar_windows|titulo:NOVA|mensaje:texto del aviso] — úsalo cuando el usuario pida que le avises de algo, o para confirmar que una tarea larga ha terminado.
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
CMD: [ACCION:ejecutar_cmd|cmd:dir C:\\]`;

const SYS_INTEGRACIONES = `

INTEGRACIONES DE GOOGLE — INSTRUCCIONES:
Usa el mismo formato [ACCION:nombre|param:valor] para estas acciones. Emítelas cuando detectes la intención del usuario, sea cual sea la forma exacta en que lo pida.

Gmail:
Conectar: [ACCION:conectar_gmail] — úsalo si el usuario pide algo de Gmail y no está conectado
Leer correo: [ACCION:leer_emails]
Redactar/enviar email: [ACCION:abrir_gmail_redactar|instruccion:descripción completa de qué escribir y a quién]

Pipeline de negocios (CRM en Google Sheets):
Conectar: [ACCION:conectar_pipeline]
Consultar/ver estado: [ACCION:ver_pipeline]
Añadir negocio nuevo: [ACCION:anadir_negocio|nombre:Nombre del negocio]
Actualizar un campo: [ACCION:actualizar_pipeline|nombre:Nombre del negocio|campo:estado|valor:Firmado]

Calendario de Google:
Conectar: [ACCION:conectar_calendario]

Google Tasks:
Conectar: [ACCION:conectar_tasks]

Visión de pantalla — puedes ver literalmente lo que el usuario tiene abierto en su PC ahora mismo:
[ACCION:analizar_pantalla|pregunta:qué necesitas saber sobre lo que hay en pantalla]
Úsalo cuando el usuario te pida analizar, revisar o consultar algo que probablemente tenga abierto en su navegador (un CRM, una web, un documento) y no tengas otra forma directa de acceder a esos datos.

Si el usuario pregunta "puedes acceder a X" o "tienes acceso a Y" sobre Gmail, el pipeline/CRM, Sheets, calendario o tareas de Google, la respuesta es SÍ — usa la acción correspondiente en vez de decir que no tienes acceso.
`;

let agentActivo = false;
let monitorInterval = null;
let msgsSinExtraer = 0;
let ultimaSugerenciaMejora = null;

agentDisponible().then(ok => {
  agentActivo = ok;
  if (ok) iniciarMonitorProactivo();
});

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

function buildSystemPrompt(contextoExtra = '') {
  const memEst = formatearMemoria(state.memEstructurada || {});
  const memTexto = state.mem || '';
  let memSection = '';
  if (memEst) memSection = '\n\nMEMORIA ESTRUCTURADA DEL USUARIO:\n' + memEst;
  else if (memTexto) memSection = '\n\nLO QUE SABES DEL USUARIO:\n' + memTexto;
  return SYS_BASE + (agentActivo ? SYS_AGENTE : '') + SYS_INTEGRACIONES + contextoExtra + memSection;
}

// Detecta comandos de "añadir tarea" en lenguaje natural.
// Devuelve { texto, prioridad } o null si no coincide con ningún patrón.
function detectarComandoTarea(cleanText) {
  const patrones = [
    /^(?:añade|agrega|apunta|crea|pon)\s+(?:una\s+)?tarea[:\s]+(.+)/i,
    /^a[ñn]ade a (?:mis )?tareas[:\s]+(.+)/i,
    /^recu[eé]rdame que\s+(.+)/i,
    /^apunta(?:\s+esto)?[:\s]+(.+)/i,
  ];

  for (const re of patrones) {
    const m = cleanText.match(re);
    if (m && m[1] && m[1].trim().length > 2) {
      let texto = m[1].trim().replace(/\.$/, '');
      let prioridad = 'n';
      if (/\burgente\b/i.test(texto)) prioridad = 'u';
      else if (/\b(importante|alta prioridad|prioridad alta)\b/i.test(texto)) prioridad = 'h';
      texto = texto.replace(/\b(urgente|importante|alta prioridad|prioridad alta)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
      return { texto, prioridad };
    }
  }
  return null;
}

// Detecta comandos de investigación profunda en lenguaje natural.
function detectarComandoInvestigacion(cleanText) {
  const patrones = [
    /^investiga(?:\s+sobre)?\s+(.+)/i,
    /^haz una investigaci[oó]n(?:\s+profunda)?(?:\s+(?:sobre|de))?\s+(.+)/i,
    /^profundiza(?:\s+en)?\s+(.+)/i,
    /^investigaci[oó]n profunda(?:\s+(?:sobre|de))?\s+(.+)/i,
  ];
  for (const re of patrones) {
    const m = cleanText.match(re);
    if (m && m[1] && m[1].trim().length > 2) {
      return m[1].trim().replace(/\.$/, '');
    }
  }
  return null;
}

export async function askNova(text) {
  iniciarActividad();
  try {
    await askNovaInterno(text);
  } finally {
    terminarActividad();
  }
}

async function askNovaInterno(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return;
  const cleanText = text.trim();
  const txtLow = cleanText.toLowerCase();

  if (ultimaSugerenciaMejora && (Date.now() - ultimaSugerenciaMejora.ts) < 5 * 60 * 1000) {
    const esSi = /^(s[ií]|vale|va|adelante|dale|hazlo|ok|okay|correcto|por favor|claro)\b/i.test(txtLow) || txtLow === 's' || txtLow === 'si';
    const esNo = /^(no|nel|paso|déjalo|dejalo|ahora no|mejor no)\b/i.test(txtLow);

    if (esSi) {
      const descripcion = ultimaSugerenciaMejora.descripcion;
      ultimaSugerenciaMejora = null;
      addMsg('user', cleanText);
      detectarYProponerMejora(descripcion).catch(console.warn);
      return;
    }
    if (esNo) {
      ultimaSugerenciaMejora = null;
      addMsg('user', cleanText);
      addMsg('nova', 'Entendido, no toco nada.');
      return;
    }
    ultimaSugerenciaMejora = null;
  }

  if (/^despierta$/i.test(cleanText) || /^wake up$/i.test(cleanText)) {
    if (window._novaDespertar) { window._novaDespertar(); return; }
  }

  if (txtLow.includes('modo conversacion') || txtLow.includes('modo conversación') || txtLow.includes('escuchame') || txtLow.includes('escúchame')) {
    if (window._novaToggleModoConversacion) { window._novaToggleModoConversacion(); return; }
  }

  if (txtLow.includes('modo programacion') || txtLow.includes('modo programación') || txtLow.includes('modo código') || txtLow.includes('modo codigo')) {
    activarModoProgramacion(); return;
  }
  if ((txtLow.includes('salir') || txtLow.includes('desactivar')) && (txtLow.includes('código') || txtLow.includes('codigo') || txtLow.includes('programacion') || txtLow.includes('programación'))) {
    desactivarModoProgramacion(); return;
  }

  if (esModoProgamacion()) {
    addMsg('user', cleanText);
    showTypingCodigo();
    if (txtLow.startsWith('contexto:') || txtLow.startsWith('proyecto:')) {
      setProyectoContexto(cleanText.substring(cleanText.indexOf(':') + 1).trim());
      rmTyping(); return;
    }
    await procesarCodigoConNova(cleanText);
    return;
  }

  if (txtLow.includes('desactiva') && (txtLow.includes('auto mejora') || txtLow.includes('automejora') || txtLow.includes('auto-mejora'))) {
    addMsg('user', cleanText);
    desactivarAutoMejora();
    return;
  }
  if (txtLow.includes('activa') && (txtLow.includes('auto mejora') || txtLow.includes('automejora') || txtLow.includes('auto-mejora'))) {
    addMsg('user', cleanText);
    activarAutoMejora();
    return;
  }

  if (txtLow.startsWith('revierte ') || txtLow.startsWith('revertir ')) {
    const archivo = cleanText.replace(/^(revierte|revertir)\s*/i, '').trim();
    addMsg('user', cleanText);
    revertirMejora(archivo).catch(console.warn);
    return;
  }

  if (txtLow.includes('pipeline') && (txtLow.includes('cómo va') || txtLow.includes('como va') || txtLow.includes('estado') || txtLow.includes('resumen') || txtLow.includes('ver') || txtLow.includes('muestra'))) {
    addMsg('user', cleanText);
    if (!pipelineDisponible()) { addMsg('nova', 'El pipeline no está conectado. Di "conecta pipeline" primero.'); return; }
    verPipeline().catch(e => addMsg('nova', '⚠ ' + e.message));
    return;
  }

  if (txtLow.includes('conecta calendario') || txtLow.includes('conectar calendario') || txtLow.includes('conecta agenda') || txtLow.includes('conecta google calendar')) {
    addMsg('user', cleanText);
    addMsg('nova', '🔐 Conectando con el calendario...');
    import('./calendar.js').then(({ initCalendar }) => {
      initCalendar(true).then(() => addMsg('nova', 'Calendario conectado.')).catch(e => addMsg('nova', '⚠ ' + e.message));
    });
    return;
  }

  if (txtLow.includes('conecta tareas de google') || txtLow.includes('conecta google tasks') || txtLow.includes('conectar tareas de google')) {
    addMsg('user', cleanText);
    addMsg('nova', '🔐 Conectando con Google Tasks...');
    import('./googleTasks.js').then(({ initGoogleTasks }) => {
      initGoogleTasks(true).then(ok => {
        addMsg('nova', ok ? 'Google Tasks conectado.' : '⚠ No se pudo conectar.');
      }).catch(e => addMsg('nova', '⚠ ' + e.message));
    });
    return;
  }

  if (txtLow.includes('conecta pipeline') || txtLow.includes('conectar pipeline') || txtLow.includes('conecta el crm') || txtLow.includes('conecta crm')) {
    addMsg('user', cleanText);
    addMsg('nova', '🔐 Conectando con el pipeline...');
    initPipeline(true).then(async ok => {
      if (ok) { const { abrirHojaCalculo } = await import('./pipeline.js'); abrirHojaCalculo(); }
      if (ok) addMsg('nova', 'Pipeline conectado. Puedo consultarlo, actualizarlo y añadir negocios nuevos.');
      else addMsg('nova', '⚠ No se pudo conectar con el pipeline.');
    }).catch(e => addMsg('nova', '⚠ Error: ' + e.message));
    return;
  }

  const matchNuevoNegocio = cleanText.match(/^a[ñn]ade\s+(?:un\s+)?negocio(?:\s+al\s+pipeline)?[:\s]+(.+)/i);
  if (matchNuevoNegocio) {
    addMsg('user', cleanText);
    if (!pipelineDisponible()) { addMsg('nova', 'El pipeline no está conectado. Di "conecta pipeline" primero.'); return; }
    const nombre = matchNuevoNegocio[1].trim();
    crearNegocio({ nombre }).then(ok => {
      const msg = ok ? `Negocio añadido al pipeline: ${nombre}.` : `⚠ No pude añadir ${nombre} al pipeline.`;
      addMsg('nova', msg);
      if (ok && state.audioOn) speak(msg);
    });
    return;
  }

  const matchActualizarEstado = cleanText.match(/^(?:marca|actualiza|pon)\s+(.+?)\s+como\s+(prospecto|contactado|en negociaci[oó]n|firmado)/i);
  if (matchActualizarEstado) {
    addMsg('user', cleanText);
    if (!pipelineDisponible()) { addMsg('nova', 'El pipeline no está conectado.'); return; }
    const [, nombre, nuevoEstado] = matchActualizarEstado;
    actualizarCampo(nombre.trim(), 'estado', nuevoEstado.trim()).then(ok => {
      const msg = ok ? `${nombre.trim()} actualizado a ${nuevoEstado.trim()}.` : `⚠ No encontré "${nombre.trim()}" en el pipeline.`;
      addMsg('nova', msg);
      if (ok && state.audioOn) speak(msg);
    });
    return;
  }

  if (txtLow.includes('conecta gmail') || txtLow.includes('conectar gmail') || txtLow.includes('autoriza gmail')) {
    addMsg('user', cleanText);
    addMsg('nova', '🔐 Conectando con Gmail...');
    initGmail(true).then(ok => {
      if (ok) { addMsg('nova', 'Gmail conectado. Puedes pedirme que lea tu correo o redacte emails.'); }
      else { addMsg('nova', '⚠ No se pudo conectar con Gmail. Comprueba que el Client ID de Google esté configurado.'); }
    }).catch(e => addMsg('nova', '⚠ Error: ' + e.message));
    return;
  }

  if (txtLow.includes('lee mi correo') || txtLow.includes('emails sin leer') || txtLow.includes('correos nuevos') || txtLow.includes('tengo emails') || (txtLow.includes('gmail') && (txtLow.includes('qué hay') || txtLow.includes('que hay') || txtLow.includes('revisa') || txtLow.includes('bandeja')))) {
    addMsg('user', cleanText);
    if (!gmailDisponible()) { addMsg('nova', 'Gmail no conectado. Di "conecta Gmail" primero.'); return; }
    leerEmailsRecientes().catch(e => addMsg('nova', '⚠ ' + e.message));
    return;
  }

  if (/^redacta?\s+(?:un\s+)?(?:email|correo)/i.test(cleanText) || /^escribe?\s+(?:un\s+)?(?:email|correo)/i.test(cleanText) || /^manda?\s+(?:un\s+)?(?:email|correo)/i.test(cleanText)) {
    addMsg('user', cleanText);
    if (!gmailDisponible()) { addMsg('nova', 'Gmail no conectado. Di "conecta Gmail" primero.'); return; }
    redactarConIA(cleanText).catch(e => addMsg('nova', '⚠ ' + e.message));
    return;
  }

  if (txtLow.includes('mejórate') || txtLow.includes('mejorate') || txtLow.startsWith('mejora ') || txtLow.startsWith('arregla ') || txtLow.startsWith('fix ') || txtLow.includes('auto mejora') || txtLow.includes('arréglate')) {
    const problema = cleanText.replace(/^(mejórate|mejorate|arréglate|arregate|mejora|arregla|fix)\s*/i, '').trim();
    addMsg('user', cleanText);
    detectarYProponerMejora(problema || 'Detecta y corrige problemas en el código').catch(console.warn);
    return;
  }

  // Añadir tarea por voz/chat — comprobar ANTES del flujo general de conversación
  const comandoTarea = detectarComandoTarea(cleanText);
  if (comandoTarea) {
    addMsg('user', cleanText);
    const tarea = agregarTarea(comandoTarea.texto, comandoTarea.prioridad);
    if (tarea) {
      const etiquetaPrioridad = comandoTarea.prioridad === 'u' ? ' Marcada como urgente.' : comandoTarea.prioridad === 'h' ? ' Prioridad alta.' : '';
      const confirmacion = `Tarea añadida: ${comandoTarea.texto}.${etiquetaPrioridad}`;
      addMsg('nova', confirmacion);
      if (state.audioOn) speak(confirmacion);
    } else {
      addMsg('nova', 'No he entendido bien la tarea. Dímela otra vez, por favor.');
    }
    return;
  }

  if (/^abre instagram|abre mi instagram|abre el instagram personal/i.test(cleanText)) {
    addMsg('user', cleanText);
    window.open('https://www.instagram.com/', '_blank');
    addMsg('nova', 'Instagram abierto.');
    if (state.audioOn) speak('Instagram abierto.');
    return;
  }

  const matchInstaPost = cleanText.match(/^sube (?:esto |algo )?a (?:mi )?instagram(?:\s+(.+))?/i);
  if (matchInstaPost) {
    addMsg('user', cleanText);
    window.open('https://www.instagram.com/', '_blank');
    const nota = matchInstaPost[1] ? ` Sobre: ${matchInstaPost[1]}.` : '';
    addMsg('nova', `He abierto Instagram para que subas el contenido.${nota} Tu Instagram personal no tiene API — tienes que subirlo tú directamente.`);
    if (state.audioOn) speak('Instagram abierto para que lo subas tú.');
    return;
  }

  if (/mi pantalla|qu[ée] (hay|ves) en (mi )?pantalla|analiza (mi |la )?pantalla|mira (mi |la )?pantalla/i.test(cleanText)) {
    addMsg('user', cleanText);
    analizarPantalla(cleanText).catch(e => console.warn('Error analizando pantalla:', e));
    return;
  }

  const comandoInvestigacion = detectarComandoInvestigacion(cleanText);
  if (comandoInvestigacion) {
    addMsg('user', cleanText);
    realizarInvestigacionProfunda(comandoInvestigacion).catch(e => {
      console.warn('Error en investigación:', e);
      addMsg('nova', '⚠ Error durante la investigación: ' + esc(e.message || 'desconocido'));
    });
    return;
  }

  if (txtLow.includes('reunión de socios') || txtLow.includes('reunion de socios') || (txtLow.includes('bajateapp') && (txtLow.includes('cómo va') || txtLow.includes('como va') || txtLow.includes('resumen')))) {
    addMsg('user', cleanText);
    reunionDeSocios().catch(e => console.warn('Error en reunión de socios:', e));
    return;
  }

  if (/ideas?\s+de\s+(crecimiento|usuarios|tr[aá]fico)/i.test(cleanText) || /c[oó]mo\s+(conseguir|aumentar)\s+(m[aá]s\s+)?usuarios/i.test(cleanText)) {
    addMsg('user', cleanText);
    ideasDepartamento('crecimiento').catch(e => console.warn('Error ideas crecimiento:', e));
    return;
  }
  if (/ideas?\s+de\s+(negocios|captaci[oó]n|bares|clientes)/i.test(cleanText) || /c[oó]mo\s+conseguir\s+(m[aá]s\s+)?(bares|negocios|empresas)/i.test(cleanText)) {
    addMsg('user', cleanText);
    ideasDepartamento('negocios').catch(e => console.warn('Error ideas negocios:', e));
    return;
  }
  if (/ideas?\s+de\s+(producto|features?|funcionalidades)/i.test(cleanText)) {
    addMsg('user', cleanText);
    ideasDepartamento('producto').catch(e => console.warn('Error ideas producto:', e));
    return;
  }

  if (txtLow.includes('banco de ideas') || txtLow.includes('qué ideas tengo') || txtLow.includes('que ideas tengo')) {
    addMsg('user', cleanText);
    listarBancoIdeas().catch(e => console.warn('Error listando ideas:', e));
    return;
  }

  if (/^(analiza|escanea|mira)(?:\s+esta)?(?:\s+el)?\s+(?:proyecto|c[oó]digo|carpeta)(?:\s+de\s+bajateapp)?/i.test(cleanText)) {
    addMsg('user', cleanText);
    escanearProyecto().catch(e => console.warn('Error escaneo proyecto:', e));
    return;
  }

  const matchRutaProyecto = cleanText.match(/^el proyecto (?:de bajateapp )?est[aá] en\s+(.+)/i);
  if (matchRutaProyecto) {
    const ruta = matchRutaProyecto[1].trim();
    addMsg('user', cleanText);
    escanearProyecto(ruta).catch(e => console.warn('Error escaneo proyecto:', e));
    return;
  }

  if (/c[oó]mo funciona\s+.+\s+en\s+(el\s+)?(proyecto|c[oó]digo|app)/i.test(cleanText) || /expl[ií]came\s+el\s+c[oó]digo\s+de/i.test(cleanText) || /ense[ñn]ame\s+(c[oó]mo est[aá] hecho|el c[oó]digo)/i.test(cleanText)) {
    addMsg('user', cleanText);
    preguntarSobreProyecto(cleanText).catch(e => console.warn('Error pregunta proyecto:', e));
    return;
  }

  const matchIdeaHecha = cleanText.match(/^marca(?:r)?\s+(?:como\s+hecha\s+)?(?:la\s+idea\s+)?(?:de\s+)?(.+?)(?:\s+como\s+hecha)?$/i);
  if (matchIdeaHecha && txtLow.includes('idea') && (txtLow.includes('hecha') || txtLow.includes('hecho') || txtLow.includes('completad'))) {
    const fragmento = matchIdeaHecha[1].trim();
    addMsg('user', cleanText);
    marcarIdeaHecha(fragmento).catch(e => console.warn('Error marcando idea:', e));
    return;
  }

  const mencionaArchivos = /carpeta|proyecto|c[oó]digo|archivo/i.test(cleanText);
  if (!mencionaArchivos && (txtLow.includes('mira') || txtLow.includes('qué ves') || txtLow.includes('que ves') || txtLow.includes('por la cámara') || txtLow.includes('por la camara'))) {
    const facingMode = txtLow.includes('trasera') || txtLow.includes('entorno') ? 'environment' : 'user';
    if (txtLow.includes('texto') || txtLow.includes('lee')) { leerTextoEnCamara(); return; }
    if (txtLow.includes('persona') || txtLow.includes('quién hay') || txtLow.includes('quien hay')) { identificarPersona(); return; }
    if (txtLow.includes('entorno') || txtLow.includes('alrededor')) { analizarEntorno(); return; }
    mirarPorCamara(null, facingMode); return;
  }
  if (txtLow.includes('modo vigilante') || txtLow.includes('vigila')) { activarModoVigilante(); return; }
  if (txtLow.includes('para la cámara') || txtLow.includes('para la camara') || txtLow.includes('cierra la cámara')) { pararCamara(); addMsg('nova', 'Cámara desactivada.'); return; }

  detectPanel(cleanText);
  addMsg('user', cleanText);
  state.hist.push({ role: 'user', content: cleanText });
  if (state.hist.length > 40) state.hist = state.hist.slice(-40);
  await saveMsg('user', cleanText);
  state.msgN++;
  msgsSinExtraer++;

  setOrb('thinking');
  showTyping();
  setTargetLevel(0.45);

  try {
    let contextoExtra = '';
    if (/cpu|ram|memoria|proceso|disco|bateria|sistema/i.test(cleanText) && agentActivo) {
      try {
        const r = await ejecutarAccion('sistema_info', {});
        contextoExtra += `\n\nINFO SISTEMA: CPU ${r.cpu}% | RAM ${r.ram_usada}/${r.ram_total}GB (${r.ram_pct}%) | Disco libre: ${r.disco_libre}GB`;
      } catch (e) {}
    }
    if (/agenda|calendario|evento|reunion|cita|hoy|mañana|semana/i.test(cleanText)) {
      if (await calendarDisponible()) {
        const resumen = await getResumenCalendario();
        if (resumen) contextoExtra += '\n\nCALENDARIO: ' + resumen;
      }
    }

    const sysFull = buildSystemPrompt(contextoExtra);
    const rawReply = await groqChat(
      [{ role: 'system', content: sysFull }, ...state.hist.slice(-12)],
      'openai/gpt-oss-20b', 1000
    );

    const { acciones, textoLimpio } = parsearAccionPC(rawReply);
    let reply;
    if (acciones.length > 0) {
      // Si había etiquetas [ACCION:...], NUNCA volver al texto sin limpiar aunque quede vacío
      reply = textoLimpio.replace(/CREAR_EVENTO:[^\s]+/g, '').trim() || 'Procesando.';
    } else {
      reply = (textoLimpio || rawReply).replace(/CREAR_EVENTO:[^\s]+/g, '').trim() || 'Procesando.';
    }

    state.hist.push({ role: 'assistant', content: reply });
    if (state.hist.length > 40) state.hist = state.hist.slice(-40);
    await saveMsg('assistant', reply);
    state.msgN++;
    msgsSinExtraer++;

    if (msgsSinExtraer >= 6) {
      msgsSinExtraer = 0;
      if (state.msgN % 20 === 0) updateMem(state.hist).then(m => { if (m) state.mem = m; });
      extraerYGuardarMemoria(state.hist, state.memEstructurada).then(async () => {
        const { loadMemoriaEstructurada } = await import('./api.js');
        state.memEstructurada = await loadMemoriaEstructurada();
      }).catch(e => console.warn('Extracción memoria:', e));
    }

    analizarMencionBajateApp(cleanText).catch(e => console.warn('Análisis BajateApp:', e));

    rmTyping();
    addMsg('nova', reply);

    if (/¿quieres que (lo|la|los|las)?\s*(revise|revisemos|mejore|arregle|corrija)/i.test(reply)) {
      ultimaSugerenciaMejora = { descripcion: reply, ts: Date.now() };
    }

    const crearMatch = rawReply.match(/CREAR_EVENTO:([^|]+)\|([^|]+)\|([^|]+)(?:\|(\d+))?(?:\|(.+))?/);
    if (crearMatch) {
      const [, titulo, fecha, hora, dur, desc] = crearMatch;
      const ev = await crearEvento(titulo.trim(), fecha.trim(), hora.trim(), parseInt(dur)||60, desc||'');
      if (ev) addMsg('nova', `✅ Evento creado: ${titulo.trim()}`);
    }

    const ACCIONES_GOOGLE = new Set([
      'conectar_gmail', 'leer_emails', 'abrir_gmail_redactar',
      'conectar_pipeline', 'ver_pipeline', 'anadir_negocio', 'actualizar_pipeline',
      'conectar_calendario', 'conectar_tasks', 'analizar_pantalla'
    ]);
    const accionesGoogle = acciones.filter(a => ACCIONES_GOOGLE.has(a.accion));
    const accionesPC = acciones.filter(a => !ACCIONES_GOOGLE.has(a.accion));

    for (const { accion, params } of accionesGoogle) {
      try {
        switch (accion) {
          case 'conectar_gmail': {
            const { initGmail: iG } = await import('./gmail.js');
            await iG(true);
            break;
          }
          case 'leer_emails': {
            const { leerEmailsRecientes: lE } = await import('./gmail.js');
            await lE();
            break;
          }
          case 'abrir_gmail_redactar': {
            const { redactarConIA: rC } = await import('./gmail.js');
            await rC(params.instruccion || cleanText);
            break;
          }
          case 'conectar_pipeline': {
            const { initPipeline: iP } = await import('./pipeline.js');
            await iP(true);
            break;
          }
          case 'ver_pipeline': {
            const { verPipeline: vP } = await import('./pipeline.js');
            await vP();
            break;
          }
          case 'anadir_negocio': {
            const { crearNegocio: cN } = await import('./pipeline.js');
            const ok = await cN({ nombre: params.nombre || '' });
            addMsg('nova', ok ? `Negocio añadido: ${params.nombre}.` : `⚠ No pude añadir ${params.nombre}.`);
            break;
          }
          case 'actualizar_pipeline': {
            const { actualizarCampo: aC } = await import('./pipeline.js');
            const ok = await aC(params.nombre || '', params.campo || '', params.valor || '');
            addMsg('nova', ok ? `${params.nombre} actualizado.` : `⚠ No encontré "${params.nombre}" en el pipeline.`);
            break;
          }
          case 'conectar_calendario': {
            const { initCalendar: iC } = await import('./calendar.js');
            await iC(true);
            break;
          }
          case 'conectar_tasks': {
            const { initGoogleTasks: iT } = await import('./googleTasks.js');
            await iT(true);
            break;
          }
          case 'analizar_pantalla': {
            const { analizarPantalla: aP } = await import('./pantalla.js');
            await aP(params.pregunta || cleanText);
            break;
          }
        }
      } catch (e) {
        console.warn(`Error en acción Google "${accion}":`, e.message);
        addMsg('nova', `⚠ Error con ${accion}: ${e.message}`);
      }
    }

    if (accionesPC.length > 0 && agentActivo) {
      setOrb('thinking');
      addMsg('nova', `⚡ Ejecutando ${accionesPC.length} acción${accionesPC.length > 1 ? 'es' : ''}...`);
      const resultados = await procesarAccionesPC(accionesPC);
      const fallos = resultados.filter(r => !r.ok);
      if (fallos.length > 0) addMsg('nova', `⚠ Fallo en: ${fallos.map(f => f.accion).join(', ')}`);
    }

    setOrb('speaking');
    if (state.audioOn) { state.lastSpokenText = reply; speak(reply); }
    else { setOrb('idle'); setTargetLevel(0); }

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
  if (!confirm('¿Borrar todo el historial? La memoria estructurada se conservará.')) return;
  try {
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWxvZmJsc2Vwcm9uYnl6aXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjEzMjAsImV4cCI6MjEwMjUzNzMyMH0.ACFsSthcARANk8zyfeRZiQLeHawVvOAr0cqAzjsZ-1A';
    const SUPA_URL = 'https://ufmlofblsepronbyzish.supabase.co';
    await fetch(SUPA_URL + '/rest/v1/mensajes?id=gt.0', { method: 'DELETE', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY } });
    await fetch(SUPA_URL + '/rest/v1/memoria?id=eq.1', { method: 'PATCH', headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ resumen: '' }) });
  } catch (e) {}
  state.hist = []; state.mem = ''; state.msgN = 0; msgsSinExtraer = 0;
  const d = document.getElementById('display');
  if (d) d.innerHTML = '<div class="empty">esperando</div>';
  addMsg('nova', 'Historial eliminado. La memoria de lo que sé de ti se conserva.');
}