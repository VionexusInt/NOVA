// ═════════════════════════════════════════════════════════════════
//  CONFIG.JS  —  Constantes + Gestión completa de configuración
// ═════════════════════════════════════════════════════════════════

export const API_KEY = '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';
export const ELEVEN_KEY = 'sk_404e2f2932e004d99c1d7b2c2cdcf4f440ddd52786d2fe47';
export const ELEVEN_V = 'SRyJwjhI40bOiXgtq1Ia';
export const SUPA_URL = 'https://ufmlofblsepronbyzish.supabase.co';
export const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWxvZmJsc2Vwcm9uYnl6aXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjEzMjAsImV4cCI6MjEwMjUzNzMyMH0.ACFsSthcARANk8zyfeRZiQLeHawVvOAr0cqAzjsZ-1A';
export const GCAL_ID = '57696040424-lq5a5ci8e1vskc64r3ag8vd83lrigijm.apps.googleusercontent.com';
export const NVIDIA_KEY = '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';

// ═════════════════════════════════════════════════════════════════
//  AYUDA VISUAL
// ═════════════════════════════════════════════════════════════════
function toast(msg) {
  console.log('[NOVA]', msg);
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(0,212,255,0.1);color:#00d4ff;padding:10px 18px;border-radius:8px;font-size:12px;backdrop-filter:blur(10px);border:1px solid rgba(0,212,255,0.2);z-index:9999;transition:opacity .5s';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 2000);
}

// ═════════════════════════════════════════════════════════════════
//  INIT  —  Carga TODOS los valores guardados al arrancar
// ═════════════════════════════════════════════════════════════════
export function initConfig() {
  // --- Inputs de texto ---
  const textMap = [
    ['cfgName',    'userName'],
    ['cfgCompany', 'userCompany'],
    ['cfgRole',    'userRole'],
    ['cfgWake',    'wakeWord'],
    ['cfgStop',    'stopWord'],
    ['cfgGroq',    'groqKey'],
    ['cfgHotkey',  'globalHotkey']
  ];
  textMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem('nova_' + key);
    if (saved !== null) el.value = saved;
  });

  // --- Selects ---
  const selectMap = [
    ['cfgVoice',   'voice'],
    ['cfgConv',    'convMode'],
    ['cfgOrbSize', 'orbSize'],
    ['cfgTheme',   'theme']
  ];
  selectMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem('nova_' + key);
    if (saved !== null) el.value = saved;
  });

  // --- Sliders (range) ---
  const sliderMap = [
    ['cfgPitch', 'pitch', v => Math.round(v * 100) + '%'],
    ['cfgSpeed', 'speed', v => v + 'x'],
    ['cfgVol',   'volume', v => Math.round(v * 100) + '%'],
    ['cfgGlow',  'glow', v => Math.round(v * 100) + '%']
  ];
  sliderMap.forEach(([id, key, fmt]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem('nova_' + key);
    if (saved !== null) {
      el.value = saved;
      const valSpan = document.getElementById(el.dataset.val);
      if (valSpan) valSpan.textContent = fmt(saved);
    }
    // Listener en tiempo real
    el.addEventListener('input', () => {
      localStorage.setItem('nova_' + key, el.value);
      const valSpan = document.getElementById(el.dataset.val);
      if (valSpan) valSpan.textContent = fmt(el.value);
    });
  });

  // --- Toggles (checkboxes) ---
  const toggleMap = [
    ['cfgTTS',       'ttsEnabled'],
    ['cfgPost',      'postProcess'],
    ['cfgUiSounds',  'uiSounds'],
    ['cfgAutoImp',   'autoImprove'],
    ['cfgShort',     'shortAnswers'],
    ['cfgParticles', 'particles'],
    ['cfgAgent',     'agentEnabled'],
    ['cfgAutoStart', 'autoStart'],
    ['cfgTray',      'minimizeTray'],
    ['cfgNotifs',    'notifications'],
    ['cfgPip',       'pipEnabled']
  ];
  toggleMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem('nova_' + key);
    if (saved !== null) el.checked = saved === 'true';
    // Listener
    el.addEventListener('change', () => {
      localStorage.setItem('nova_' + key, el.checked);
      toast(key + (el.checked ? ' activado' : ' desactivado'));
    });
  });

  // --- Preview de voz ---
  const previewBtn = document.getElementById('cfgVoicePreview');
  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      const voice = document.getElementById('cfgVoice')?.value || 'carlfm';
      toast('Preview: ' + voice);
      // Aquí puedes conectar tu TTS real:
      // speak('Hola, soy NOVA. ¿Me escuchas bien?');
    });
  }
}

// ═════════════════════════════════════════════════════════════════
//  GUARDAR INPUT / SELECT
// ═════════════════════════════════════════════════════════════════
export function saveConfigInput(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  localStorage.setItem('nova_' + key, el.value);
  toast(key + ' guardado');
}

export function saveConfigSelect(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  localStorage.setItem('nova_' + key, el.value);
  toast(key + ' guardado');
}

// ═════════════════════════════════════════════════════════════════
//  MEMORIA
// ═════════════════════════════════════════════════════════════════
export function exportMemory() {
  const data = {};
  try {
    const mem     = localStorage.getItem('nova_memoria');
    const hist    = localStorage.getItem('nova_historial');
    const memEstr = localStorage.getItem('nova_memoria_estructurada');

    if (mem)     data.memoria = mem;
    if (hist)    data.historial = JSON.parse(hist);
    if (memEstr) data.memoriaEstructurada = JSON.parse(memEstr);

    if (!data.historial) {
      const msgs = [];
      document.querySelectorAll('#display .msg, #display .msg-user, #display .msg-nova').forEach(m => {
        const role = m.classList.contains('msg-user') || m.classList.contains('user') ? 'user' : 'nova';
        msgs.push({ role, content: m.textContent.trim() });
      });
      if (msgs.length) data.historial = msgs;
    }
  } catch (e) {
    console.error('Error exportando memoria:', e);
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nova-memory-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Memoria exportada');
}

export function forgetAll() {
  if (!confirm('¿Seguro que quieres que NOVA olvide toda la memoria y conversación?')) return;
  localStorage.removeItem('nova_memoria');
  localStorage.removeItem('nova_historial');
  localStorage.removeItem('nova_memoria_estructurada');
  toast('Memoria borrada. Reiniciando...');
  setTimeout(() => location.reload(), 800);
}

// ═════════════════════════════════════════════════════════════════
//  SISTEMA
// ═════════════════════════════════════════════════════════════════
export function showLogs() {
  const container = document.getElementById('cfgLogsContent');
  const items = Object.keys(localStorage).filter(k => k.startsWith('nova_'));
  const html = items.map(k => `<div style="font-size:11px;color:var(--text-ghost);margin:2px 0;"><b>${k}</b>: ${localStorage.getItem(k).substring(0, 60)}${localStorage.getItem(k).length > 60 ? '...' : ''}</div>`).join('');
  if (container) container.innerHTML = html || '<div style="font-size:11px;color:var(--text-ghost);">No hay datos guardados.</div>';
  console.log('%c[NOVA LOGS]', 'color:#00d4ff; font-size:14px; font-weight:bold;');
  console.log('Items en localStorage:', items);
  toast('Logs mostrados');
}

export function restartNova() {
  location.reload();
}

export function resetAllConfig() {
  if (!confirm('¿Seguro que quieres resetear TODA la configuración?')) return;
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith('nova_')) localStorage.removeItem(k);
  });
  toast('Configuración reseteada. Reiniciando...');
  setTimeout(() => location.reload(), 800);
}

// ═════════════════════════════════════════════════════════════════
//  GUARDAR TODO DE GOLPE
// ═════════════════════════════════════════════════════════════════
export function saveAllConfig() {
  // --- Inputs de texto ---
  const textMap = [
    ['cfgName',    'userName'],
    ['cfgCompany', 'userCompany'],
    ['cfgRole',    'userRole'],
    ['cfgWake',    'wakeWord'],
    ['cfgStop',    'stopWord'],
    ['cfgGroq',    'groqKey'],
    ['cfgHotkey',  'globalHotkey']
  ];
  textMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem('nova_' + key, el.value);
  });

  // --- Selects ---
  const selectMap = [
    ['cfgVoice',   'voice'],
    ['cfgConv',    'convMode'],
    ['cfgOrbSize', 'orbSize'],
    ['cfgTheme',   'theme']
  ];
  selectMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem('nova_' + key, el.value);
  });

  // --- Sliders ---
  const sliderMap = [
    ['cfgPitch', 'pitch'],
    ['cfgSpeed', 'speed'],
    ['cfgVol',   'volume'],
    ['cfgGlow',  'glow']
  ];
  sliderMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem('nova_' + key, el.value);
  });

  // --- Toggles ---
  const toggleMap = [
    ['cfgTTS',       'ttsEnabled'],
    ['cfgPost',      'postProcess'],
    ['cfgUiSounds',  'uiSounds'],
    ['cfgAutoImp',   'autoImprove'],
    ['cfgShort',     'shortAnswers'],
    ['cfgParticles', 'particles'],
    ['cfgAgent',     'agentEnabled'],
    ['cfgAutoStart', 'autoStart'],
    ['cfgTray',      'minimizeTray'],
    ['cfgNotifs',    'notifications'],
    ['cfgPip',       'pipEnabled']
  ];
  toggleMap.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) localStorage.setItem('nova_' + key, el.checked);
  });

  toast('Configuración guardada');
}