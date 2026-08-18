import { state } from './state.js';
import { askNova, addMsg } from './chat.js';
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
const WAKE_WORDS = ['ey nova', 'hey nova', 'hola nova', 'eh nova'];
const CONV_WORDS = ['modo conversacion', 'modo conversación', 'escuchame', 'escúchame', 'conversacion continua', 'conversación continua'];
const WAKE_SEQUENCE = ['despierta', 'wake up', 'actívate', 'activate'];
const STOP_WORDS = ['para', 'detente', 'stop', 'silencio', 'deja de escuchar'];

function mostrarIndicador(activo) {
  let ind = document.getElementById('conv-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'conv-indicator';
    ind.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);font-family:Share Tech Mono,monospace;font-size:9px;letter-spacing:3px;color:#00ffaa;background:rgba(0,255,170,0.08);border:1px solid rgba(0,255,170,0.3);border-radius:2px;padding:5px 16px;z-index:999;transition:opacity .3s;';
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
      if (!event.results[i].isFinal && event.results[i][0].confidence < 0.7) continue;
      const t = event.results[i][0].transcript.toLowerCase().trim();

      const esDespertar = WAKE_SEQUENCE.some(w => t.includes(w));
      if (esDespertar) {
        stopWakeWord();
        if (window._novaDespertar) window._novaDespertar();
        setTimeout(() => startWakeWord(), 30000);
        return;
      }

      const esConv = CONV_WORDS.some(w => t.includes(w));
      if (esConv) {
        stopWakeWord();
        activarModoConversacion();
        return;
      }

      const wake = WAKE_WORDS.find(w => t.includes(w));
      if (wake) {
        const cmd = t.split(wake).pop().trim();
        if (WAKE_SEQUENCE.some(w => cmd.includes(w))) return;
        stopWakeWord();
        startMic(cmd);
        return;
      }

      if (t === 'nova' || t.startsWith('nova ')) {
        const cmd = t.replace(/^nova\s*/, '').trim();
        stopWakeWord();
        startMic(cmd);
        return;
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

function activarModoConversacion() {
  modoConversacion = true;
  window._novaModoConversacion = true;
  window._novaReiniciarMic = iniciarEscuchaContinua;
  mostrarIndicador(true);
  addMsg('nova', 'Modo conversación activo. Te escucho.');
  setTimeout(() => {
    if (modoConversacion && !window._novaHablando) iniciarEscuchaContinua();
  }, 400);
}

function desactivarModoConversacion() {
  modoConversacion = false;
  window._novaModoConversacion = false;
  window._novaReiniciarMic = null;
  mostrarIndicador(false);
  isListening = false;
  clearTimeout(silenceTimer);
  if (recognition) { try { recognition.abort(); } catch (e) {} recognition = null; }
  resetMicUI();
  setOrb('idle');
  setTargetLevel(0);
  addMsg('nova', 'Escucha continua desactivada.');
  startWakeWord();
}

function iniciarEscuchaContinua() {
  if (window._novaHablando) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  if (recognition) { try { recognition.abort(); } catch (e) {} recognition = null; }

  recognition = new SR();
  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    if (window._novaHablando) { try { recognition.abort(); } catch (e) {} return; }
    isListening = true;
    setOrb('listening');
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.classList.add('listening');
    const txtIn = document.getElementById('txtIn');
    if (txtIn) txtIn.placeholder = '⬤ Escuchando... (di "PARA" para detener)';
  };

  recognition.onresult = (event) => {
    if (window._novaHablando) {
      finalTranscript = '';
      const txtIn = document.getElementById('txtIn');
      if (txtIn) txtIn.value = '';
      return;
    }

    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t + ' ';
      else interim += t;
    }

    const current = (finalTranscript + interim).trim();
    const txtIn = document.getElementById('txtIn');
    if (txtIn && current) txtIn.value = current;

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
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    if (modoConversacion && !window._novaHablando) {
      setTimeout(() => { if (modoConversacion && !window._novaHablando) iniciarEscuchaContinua(); }, 500);
    }
  };

  recognition.onend = () => {
    if (modoConversacion && !window._novaHablando) {
      setTimeout(() => {
        if (modoConversacion && !window._novaHablando) {
          try { recognition?.start(); } catch (e) { iniciarEscuchaContinua(); }
        }
      }, 300);
    }
  };

  try {
    isListening = true;
    finalTranscript = '';
    recognition.start();
  } catch (e) {
    console.warn('Error mic:', e);
  }
}

function enviarEnModoConv() {
  clearTimeout(silenceTimer);
  if (window._novaHablando) { finalTranscript = ''; return; }

  const txtIn = document.getElementById('txtIn');
  const text = (txtIn ? txtIn.value : finalTranscript).trim();

  isListening = false;
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  finalTranscript = '';
  if (txtIn) txtIn.value = '';

  if (text) {
    askNova(text);
  } else if (modoConversacion) {
    setTimeout(() => { if (modoConversacion && !window._novaHablando) iniciarEscuchaContinua(); }, 500);
  }
}

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
    if (window._novaHablando) return;
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t + ' ';
      else interim += t;
    }
    const current = (finalTranscript + interim).trim();
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
window._novaToggleModoConversacion = toggleModoConversacion;

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
  if (txtIn) txtIn.placeholder = 'Di "Ey Nova" o escribe aquí...';
  finalTranscript = '';
}

export { modoConversacion };