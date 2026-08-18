import { state } from './state.js';
import { loadMsgs, loadMem, loadMemoriaEstructurada, saveMsg, extraerYGuardarMemoria, formatearMemoria } from './api.js';
import { addMsg, askNova, sendText, clearHistory, rmTyping } from './chat.js';
import { openPanel, closePanel, closeOnBg } from './paneles.js';
import { addTask } from './tareas.js';
import { genEmail } from './email.js';
import { genBriefing, briefingAutomatico } from './briefing.js';
import { initCalendar } from './calendar.js';
import { setMkt, genMarketing } from './marketing.js';
import { abrirPanelMemoria, initMemoriaStyles } from './memoria.js';
import { initCodeStyles } from './programacion.js';
import { initMejoraStyles } from './mejora.js';
import { activarModoDespertar } from './wake.js';
import { toggleMic, initWakeWord } from './mic.js';
import { speak } from './audio.js';
import { setOrb, initOrb } from './orb.js';
import { copyTxt } from './helpers.js';

function tick() {
  const n = new Date();
  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.textContent = n.toLocaleTimeString('es-ES');
  const M = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const D = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
  const dateEl = document.getElementById('dateD');
  if (dateEl) dateEl.textContent = `${D[n.getDay()]} ${n.getDate()} ${M[n.getMonth()]} ${n.getFullYear()}`;
  const bt = document.getElementById('bTime');
  if (bt) bt.textContent = n.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
}
setInterval(tick, 1000); tick();

const sesEl = document.getElementById('sesId');
if (sesEl) sesEl.textContent = 'SES-' + Math.random().toString(36).substring(2,9).toUpperCase();

document.getElementById('btnSend')?.addEventListener('click', sendText);
document.getElementById('txtIn')?.addEventListener('keydown', e => { if (e.key==='Enter') sendText(); });
document.getElementById('micBtn')?.addEventListener('click', toggleMic);
document.getElementById('btnReset')?.addEventListener('click', clearHistory);

document.getElementById('qaTasks')?.addEventListener('click', () => openPanel('tasks'));
document.getElementById('qaEmail')?.addEventListener('click', () => openPanel('email'));
document.getElementById('qaBriefing')?.addEventListener('click', () => openPanel('briefing'));
document.getElementById('qaCalendar')?.addEventListener('click', () => openPanel('calendar'));
document.getElementById('qaMarketing')?.addEventListener('click', () => openPanel('marketing'));
document.getElementById('qaMemoria')?.addEventListener('click', abrirPanelMemoria);

document.getElementById('ov-tasks')?.addEventListener('click', e => closeOnBg(e,'tasks'));
document.getElementById('ov-email')?.addEventListener('click', e => closeOnBg(e,'email'));
document.getElementById('ov-briefing')?.addEventListener('click', e => closeOnBg(e,'briefing'));
document.getElementById('ov-calendar')?.addEventListener('click', e => closeOnBg(e,'calendar'));
document.getElementById('ov-marketing')?.addEventListener('click', e => closeOnBg(e,'marketing'));

document.querySelectorAll('.fp-close').forEach(btn => {
  btn.addEventListener('click', () => closePanel(btn.dataset.panel));
});

document.getElementById('btnAddTask')?.addEventListener('click', addTask);
document.getElementById('taskIn')?.addEventListener('keydown', e => { if (e.key==='Enter') addTask(); });
document.getElementById('btnGenEmail')?.addEventListener('click', genEmail);
document.getElementById('copyBtnEmail')?.addEventListener('click', () => copyTxt('eResult'));
document.getElementById('btnGenBriefing')?.addEventListener('click', genBriefing);
document.getElementById('btnConnectCal')?.addEventListener('click', initCalendar);
document.querySelectorAll('.mkt-chip').forEach(chip => {
  chip.addEventListener('click', () => setMkt(chip, chip.dataset.mode));
});
document.getElementById('btnGenMarketing')?.addEventListener('click', genMarketing);
document.getElementById('copyBtnMarketing')?.addEventListener('click', () => copyTxt('mktResult'));

async function initApp() {
  rmTyping();

  try {
    const [todosRaw, memory, memEstructurada] = await Promise.all([
      loadMsgs(),
      loadMem(),
      loadMemoriaEstructurada()
    ]);

    const todos = Array.isArray(todosRaw)
      ? todosRaw.filter(m => m?.contenido?.trim?.().length > 0)
      : [];

    state.mem = memory || '';
    state.memEstructurada = memEstructurada || {};
    state.hist = todos.map(m => ({
      role: m.rol === 'user' ? 'user' : 'assistant',
      content: m.contenido.trim()
    }));
    state.msgN = state.hist.length;

    const memFormateada = formatearMemoria(state.memEstructurada);
    if (memFormateada) console.log('🧠 Memoria estructurada cargada:\n' + memFormateada);

    const ph = document.getElementById('ph');
    if (ph) ph.remove();

    if (todos.length > 0) {
      todos.slice(-8).forEach(m => addMsg(m.rol === 'user' ? 'user' : 'nova', m.contenido));
    }

  } catch (e) {
    console.error('Error init:', e);
    const ph = document.getElementById('ph');
    if (ph) ph.remove();
  }

  initOrb();
  initWakeWord();
  initMemoriaStyles();
  initCodeStyles();
  initMejoraStyles();
  window._novaDespertar = activarModoDespertar;

  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
  }

  // Briefing DESPUÉS de mostrar la pantalla
  setTimeout(() => briefingAutomatico().catch(console.warn), 800);
}

initApp();