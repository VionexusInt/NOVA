import { state } from './state.js';
import { askNova } from './chat.js';
import { setOrb, setTargetLevel } from './orb.js';

let recognition = null;
let wakeWordRec = null;
let silenceTimer = null;
let finalTranscript = '';
let isListening = false;
let isWakeWordActive = false;
let modoConversacion = false;

const SILENCE_TIMEOUT = 2000;
const SILENCE_TIMEOUT_CONV = 3000;
const WAKE_WORDS = ['ey nova', 'hey nova', 'hola nova', 'eh nova', 'nova'];
const STOP_WORDS = ['para', 'detente', 'stop', 'silencio', 'deja de escuchar', 'modo manual'];

// ── INDICADOR VISUAL ──
function mostrarModoConversacion(activo) {
  let ind = document.getElementById('conv-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'conv-indicator';
    ind.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;
      color:#00ffaa;background:rgba(0,255,170,0.08);
      border:1px solid rgba(0,255,170,0.3);border-radius:2px;
      padding:5px 16px;z-index:999;transition:opacity .3s;
    `;
    document.body.appendChild(ind);
  }
  if (activo) {
    ind.textContent = '⬤ MODO CONVERSACIÓN — Di "PARA" para detener';
    ind.style.opacity = '1'; ind.style.display = 'block';
  } else {
    ind.style.opacity = '0';
    setTimeout(() => { if (ind) ind.style.display = 'none'; }, 300);
  }
}

// ── WAKE WORD ──
export function initWakeWord() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  wakeWordRec = new SR();
  wakeWordRec.lang = 'es-ES';
  wakeWordRec.continuous = true;
  wakeWordRec.interimResults = true;

  wakeWordRec.onresult = (event) => {
    if (isListening || window._novaHablando) return;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript.toLowerCase().trim();

      if (t.includes('modo conversacion') || t.includes('modo conversación') ||
          t.includes('escuchame') || t.includes('escúchame')) {
        stopWakeWord();
        activarModoConversacion();
        break;
      }

      const matched = WAKE_WORDS.find(w => t.includes(w));
      if (matched) {
        const cmd = t.split(matched)[1]?.trim() || '';
        stopWakeWord();
        startMic(cmd);
        break;
      }
    }
  };

  wakeWordRec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
  };

  wakeWordRec.onend = () => {
    if (isWakeWordActive && !isListening) {
      try { wakeWordRec.start(); } catch (e) {}
    }
  };

  startWakeWord();
}

function startWakeWord() {
  if (!wakeWordRec) return;
  try { isWakeWordActive = true; wakeWordRec.start(); } catch (e) {}
}

function stopWakeWord() {
  isWakeWordActive = false;
  if (wakeWordRec) { try { wakeWordRec.stop(); } catch (e) {} }
}

// ── MODO CONVERSACIÓN ──
function activarModoConversacion() {
  modoConversacion = true;
  window._novaModoConversacion = true;
  window._novaReiniciarMic = iniciarEscuchaContinua;
  mostrarModoConversacion(true);
  askNova('Modo conversación activado. Te escucho.');
}

function desactivarModoConversacion() {
  modoConversacion = false;
  window._novaModoConversacion = false;
  window._novaReiniciarMic = null;
  mostrarModoConversacion(false);
  isListening = false;
  clearTimeout(silenceTimer);
  if (recognition) { try { recognition.abort(); } catch (e) {} recognition = null; }
  resetMicUI();
  setOrb('idle');
  setTargetLevel(0);
  startWakeWord();
}

function iniciarEscuchaContinua() {
  // No iniciar si NOVA está hablando
  if (window._novaHablando) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  // Limpiar recognition anterior
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  recognition = new SR();
  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    // Si NOVA empezó a hablar mientras arrancaba, abortar
    if (window._novaHablando) {
      try { recognition.abort(); } catch (e) {}
      return;
    }
    isListening = true;
    setOrb('listening');
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.add('listening');
    const txtIn = document.getElementById('txtIn');
    if (txtIn) txtIn.placeholder = '⬤ NOVA te escucha... (di "PARA" para detener)';
  };

  recognition.onresult = (event) => {
    // IGNORAR todo si NOVA está hablando — filtro anti-eco principal
    if (window._novaHablando) {
      finalTranscript = '';
      const txtIn = document.getElementById('txtIn');
      if (txtIn) txtIn.value = '';
      return;
    }

    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t + ' ';
      else interimText += t;
    }

    const current = (finalTranscript + interimText).trim();
    const txtIn = document.getElementById('txtIn');
    if (txtIn && current) txtIn.value = current;

    // Stop words
    const lower = current.toLowerCase();
    if (STOP_WORDS.some(w => lower.endsWith(w) || lower.includes(' ' + w) || lower.includes(w + ' '))) {
      clearTimeout(silenceTimer);
      desactivarModoConversacion();
      return;
    }

    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(enviarEnModoConv, SILENCE_TIMEOUT_CONV);
  };

  recognition.onerror = (e) => {
    if (e.error === 'no-speech') return;
    if (e.error === 'aborted') return;
    if (modoConversacion && !window._novaHablando) {
      setTimeout(() => {
        if (modoConversacion && !window._novaHablando) iniciarEscuchaContinua();
      }, 500);
    }
  };

  recognition.onend = () => {
    if (modoConversacion && !window._novaHablando) {
      setTimeout(() => {
        if (modoConversacion && !window._novaHablando) {
          try { recognition?.start(); } catch (e) {
            iniciarEscuchaContinua();
          }
        }
      }, 300);
    }
  };

  try {
    isListening = true;
    finalTranscript = '';
    recognition.start();
  } catch (e) {
    console.warn('Error iniciando mic:', e);
  }
}

function enviarEnModoConv() {
  clearTimeout(silenceTimer);

  // No enviar si NOVA estaba hablando
  if (window._novaHablando) {
    finalTranscript = '';
    const txtIn = document.getElementById('txtIn');
    if (txtIn) txtIn.value = '';
    return;
  }

  const txtIn = document.getElementById('txtIn');
  const text = (txtIn ? txtIn.value : finalTranscript).trim();

  // Parar escucha
  isListening = false;
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  finalTranscript = '';
  if (txtIn) txtIn.value = '';

  if (text) {
    askNova(text);
    // audio.js se encarga de reiniciar el mic cuando termina de hablar
  } else if (modoConversacion) {
    // Si no hay texto, reiniciar escucha directamente
    setTimeout(() => {
      if (modoConversacion && !window._novaHablando) iniciarEscuchaContinua();
    }, 500);
  }
}

// ── MIC NORMAL ──
export function initMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;

  recognition = new SR();
  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isListening = true;
    setOrb('listening');
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.add('listening');
    const txtIn = document.getElementById('txtIn');
    if (txtIn) txtIn.placeholder = 'NOVA te escucha...';
  };

  recognition.onresult = (event) => {
    if (window._novaHablando) return; // filtro anti-eco
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t + ' ';
      else interimText += t;
    }
    const current = (finalTranscript + interimText).trim();
    const txtIn = document.getElementById('txtIn');
    if (txtIn && current) txtIn.value = current;
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stopAndSend, SILENCE_TIMEOUT);
  };

  recognition.onerror = (e) => {
    if (e.error === 'no-speech') return;
    stopMic();
  };

  recognition.onend = () => {
    if (isListening && !modoConversacion && !window._novaHablando) {
      try { recognition.start(); } catch (e) { stopMic(); }
    }
  };

  return recognition;
}

export function toggleMic() {
  if (modoConversacion) { desactivarModoConversacion(); return; }
  if (isListening) stopAndSend();
  else startMic();
}

export function toggleModoConversacion() {
  if (modoConversacion) desactivarModoConversacion();
  else { stopWakeWord(); activarModoConversacion(); }
}

function startMic(initialText = '') {
  stopWakeWord();
  if (!recognition) recognition = initMic();
  if (!recognition) return;
  try {
    isListening = true;
    finalTranscript = initialText ? initialText + ' ' : '';
    const txtIn = document.getElementById('txtIn');
    if (txtIn) txtIn.value = finalTranscript;
    recognition.start();
    if (initialText) { clearTimeout(silenceTimer); silenceTimer = setTimeout(stopAndSend, SILENCE_TIMEOUT); }
  } catch (e) { console.warn('Error mic:', e); }
}

function stopAndSend() {
  clearTimeout(silenceTimer);
  isListening = false;
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  const txtIn = document.getElementById('txtIn');
  const text = (txtIn ? txtIn.value : finalTranscript).trim();
  resetMicUI();
  if (text) { if (txtIn) txtIn.value = ''; askNova(text); }
  else setOrb('idle');
  startWakeWord();
}

function stopMic() {
  clearTimeout(silenceTimer);
  isListening = false;
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  resetMicUI();
  setOrb('idle');
  startWakeWord();
}

function resetMicUI() {
  const micBtn = document.getElementById('micBtn');
  if (micBtn) micBtn.classList.remove('listening');
  const txtIn = document.getElementById('txtIn');
  if (txtIn) txtIn.placeholder = 'Habla con NOVA o di "Ey Nova"...';
  finalTranscript = '';
}

export { modoConversacion };