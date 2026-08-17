import { state } from './state.js';
import { loadMsgs, loadMem, saveMsg } from './api.js';
import { addMsg, askNova, sendText, clearHistory, rmTyping } from './chat.js';
import { openPanel, closePanel, closeOnBg } from './paneles.js';
import { addTask } from './tareas.js';
import { genEmail } from './email.js';
import { genBriefing } from './briefing.js';
import { initCalendar } from './calendar.js';
import { setMkt, genMarketing } from './marketing.js';
import { toggleMic, initWakeWord } from './mic.js';
import { speak } from './audio.js';
import { setOrb } from './orb.js';
import { copyTxt } from './helpers.js';

// Reloj
function tick() {
  const n = new Date();
  const clockEl = document.getElementById('clock');
  if (clockEl) clockEl.textContent = n.toLocaleTimeString('es-ES');
  const M = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  const D = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const dateEl = document.getElementById('dateD');
  if (dateEl) dateEl.textContent = `${D[n.getDay()]} ${n.getDate()} ${M[n.getMonth()]} ${n.getFullYear()}`;
  const bt = document.getElementById('bTime');
  if (bt) bt.textContent = n.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
setInterval(tick, 1000);
tick();

const sesEl = document.getElementById('sesId');
if (sesEl) sesEl.textContent = 'SES-' + Math.random().toString(36).substring(2, 9).toUpperCase();

// Event listeners globales
document.getElementById('btnSend')?.addEventListener('click', sendText);
document.getElementById('txtIn')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') sendText();
});
document.getElementById('micBtn')?.addEventListener('click', toggleMic);
document.getElementById('btnReset')?.addEventListener('click', clearHistory);

// Quick actions
document.getElementById('qaTasks')?.addEventListener('click', () => openPanel('tasks'));
document.getElementById('qaEmail')?.addEventListener('click', () => openPanel('email'));
document.getElementById('qaBriefing')?.addEventListener('click', () => openPanel('briefing'));
document.getElementById('qaCalendar')?.addEventListener('click', () => openPanel('calendar'));
document.getElementById('qaMarketing')?.addEventListener('click', () => openPanel('marketing'));

// Overlays
document.getElementById('ov-tasks')?.addEventListener('click', e => closeOnBg(e, 'tasks'));
document.getElementById('ov-email')?.addEventListener('click', e => closeOnBg(e, 'email'));
document.getElementById('ov-briefing')?.addEventListener('click', e => closeOnBg(e, 'briefing'));
document.getElementById('ov-calendar')?.addEventListener('click', e => closeOnBg(e, 'calendar'));
document.getElementById('ov-marketing')?.addEventListener('click', e => closeOnBg(e, 'marketing'));

// Botones cerrar
document.querySelectorAll('.fp-close').forEach(btn => {
  btn.addEventListener('click', () => closePanel(btn.dataset.panel));
});

// Tareas
document.getElementById('btnAddTask')?.addEventListener('click', addTask);
document.getElementById('taskIn')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') addTask();
});

// Email
document.getElementById('btnGenEmail')?.addEventListener('click', genEmail);
document.getElementById('copyBtnEmail')?.addEventListener('click', () => copyTxt('eResult'));

// Briefing
document.getElementById('btnGenBriefing')?.addEventListener('click', genBriefing);

// Calendar
document.getElementById('btnConnectCal')?.addEventListener('click', initCalendar);

// Marketing
document.querySelectorAll('.mkt-chip').forEach(chip => {
  chip.addEventListener('click', () => setMkt(chip, chip.dataset.mode));
});
document.getElementById('btnGenMarketing')?.addEventListener('click', genMarketing);
document.getElementById('copyBtnMarketing')?.addEventListener('click', () => copyTxt('mktResult'));

// ---------- INICIALIZACIÓN ----------
const loadingEl = document.getElementById('loading');
if (loadingEl) {
  loadingEl.style.opacity = '0';
  setTimeout(() => { loadingEl.style.display = 'none'; }, 400);
}

async function initApp() {
  rmTyping();
  try {
    const [todosRaw, memory] = await Promise.all([loadMsgs(), loadMem()]);
    
    
    const todos = Array.isArray(todosRaw) 
      ? todosRaw.filter(m => m && m.contenido && typeof m.contenido === 'string' && m.contenido.trim().length > 0) 
      : [];
      
    state.mem = memory || '';
    
    state.hist = todos.map(m => ({
      role: m.rol === 'user' ? 'user' : 'assistant',
      content: m.contenido.trim()
    }));
    state.msgN = state.hist.length;

    const ph = document.getElementById('ph');
    if (ph) ph.remove();

    if (todos.length > 0) {
      todos.slice(-8).forEach(m => {
        const role = m.rol === 'user' ? 'user' : 'nova';
        addMsg(role, m.contenido);
      });
    } else {
      greetUser();
    }
  } catch (e) {
    console.error('Error cargando historial:', e);
    const ph = document.getElementById('ph');
    if (ph) ph.remove();
    greetUser();
  }

  
  initWakeWord();
}

function greetUser() {
  const greeting = 'Sistemas en línea. NOVA activo.';
  addMsg('nova', greeting);
  state.hist.push({ role: 'assistant', content: greeting });
  
  if (state.audioOn) {
    state.lastSpokenText = greeting;
    speak(greeting);
  }
  
  saveMsg('assistant', greeting).catch(e => console.warn('No se pudo guardar saludo:', e));
}

initApp();