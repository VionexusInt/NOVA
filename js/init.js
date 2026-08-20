import { state } from './state.js';
import { loadMsgs, loadMem, loadMemoriaEstructurada, formatearMemoria } from './api.js';
import { addMsg, sendText, clearHistory, rmTyping } from './chat.js';
import { openPanel, closePanel, closeOnBg } from './paneles.js';
import { addTask, renderTasks } from './tareas.js';
import { genEmail } from './email.js';
import { genBriefing, briefingAutomatico } from './briefing.js';
import { initCalendar } from './calendar.js';
import { setMkt, genMarketing } from './marketing.js';
import { abrirPanelMemoria, initMemoriaStyles } from './memoria.js';
import { initCodeStyles } from './programacion.js';
import { initMejoraStyles } from './mejora.js';
import { activarModoDespertar } from './wake.js';
import { toggleMic, initWakeWord } from './mic.js';
import { setOrb, initOrb } from './orb.js';
import { copyTxt } from './helpers.js';
import { initMiniOrbSystem, setMiniOrbState, toggleMiniOrbPip } from './mini_orb.js';
import { initConfig, saveConfigInput, saveConfigSelect, exportMemory, forgetAll, showLogs, restartNova, resetAllConfig } from './config.js';

// ═════════════════════════════════════════════════════════════════
// EXPONER FUNCIONES GLOBALMENTE (para onclick en HTML)
// ═════════════════════════════════════════════════════════════════
window.openPanel = openPanel;
window.closePanel = closePanel;
window.closeOnBg = closeOnBg;
window.addTask = addTask;
window.genEmail = genEmail;
window.genMarketing = genMarketing;
window.genBriefing = genBriefing;
window.initCalendar = initCalendar;
window.setMkt = setMkt;
window.saveConfigInput = saveConfigInput;
window.saveConfigSelect = saveConfigSelect;
window.exportMemory = exportMemory;
window.forgetAll = forgetAll;
window.showLogs = showLogs;
window.restartNova = restartNova;
window.resetAllConfig = resetAllConfig;
window.saveAllConfig = saveAllConfig;

// Selector de prioridad para tareas
window.selectPri = function(el) {
  document.querySelectorAll('.task-pri-dot').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
};

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

document.getElementById('btnSend')?.addEventListener('click', sendText);
document.getElementById('txtIn')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendText(); });
document.getElementById('micBtn')?.addEventListener('click', toggleMic);
document.getElementById('btnReset')?.addEventListener('click', clearHistory);
document.getElementById('qaConfig')?.addEventListener('click', () => openPanel('config'));
document.getElementById('ov-config')?.addEventListener('click', e => closeOnBg(e, 'config'));
document.getElementById('qaTasks')?.addEventListener('click', () => { openPanel('tasks'); renderTasks(); });
document.getElementById('qaEmail')?.addEventListener('click', () => openPanel('email'));
document.getElementById('qaBriefing')?.addEventListener('click', () => openPanel('briefing'));
document.getElementById('qaCalendar')?.addEventListener('click', () => openPanel('calendar'));
document.getElementById('qaMarketing')?.addEventListener('click', () => openPanel('marketing'));
document.getElementById('qaMemoria')?.addEventListener('click', abrirPanelMemoria);

// Click fuera del panel para cerrar
document.getElementById('ov-tasks')?.addEventListener('click', e => closeOnBg(e, 'tasks'));
document.getElementById('ov-email')?.addEventListener('click', e => closeOnBg(e, 'email'));
document.getElementById('ov-briefing')?.addEventListener('click', e => closeOnBg(e, 'briefing'));
document.getElementById('ov-calendar')?.addEventListener('click', e => closeOnBg(e, 'calendar'));
document.getElementById('ov-marketing')?.addEventListener('click', e => closeOnBg(e, 'marketing'));

// Event listeners de botones dentro de paneles
document.getElementById('taskAddBtn')?.addEventListener('click', addTask);
document.getElementById('taskIn')?.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
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
  renderTasks();

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

    state.hist = todos.slice(-10).map(m => ({
      role: m.rol === 'user' ? 'user' : 'assistant',
      content: m.contenido.trim()
    }));
    state.msgN = todos.length;

    const memFormateada = formatearMemoria(state.memEstructurada);
    if (memFormateada) console.log('🧠 Memoria:\n' + memFormateada);

    const ph = document.getElementById('ph');
    if (ph) ph.remove();

    todos.slice(-6).forEach(m => addMsg(m.rol === 'user' ? 'user' : 'nova', m.contenido));

  } catch (e) {
    console.error('Error init:', e);
    document.getElementById('ph')?.remove();
  }

  initOrb();
  initMiniOrbSystem();
  initConfig();
  initWakeWord();
  initMemoriaStyles();
  initCodeStyles();
  initMejoraStyles();
  window._novaDespertar = activarModoDespertar;

  window.toggleCfg = function(el) {
  const body = el.nextElementSibling;
  const arrow = el.querySelector('.cfg-arrow');
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
};

  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.opacity = '0';
    setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
  }

  setTimeout(async () => {
    const { saludarAlIniciar } = await import('./saludos.js');
    await saludarAlIniciar();
  }, 3000);
}

initApp();

document.getElementById('pipBtn')?.addEventListener('click', toggleMiniOrbPip);