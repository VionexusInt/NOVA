import { setOrb, setTargetLevel } from './orb.js';

let currentAudio = null;
let waveInt = null;

window._novaHablando = false;

function stopAudio() {
  if (waveInt) { clearInterval(waveInt); waveInt = null; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

// Limpia el texto antes de mandarlo a TTS
function limpiarParaVoz(txt) {
  return txt
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/⚡|✅|⚠️|⚠|🔍|📄|⏪|❌|📋|🔧|🎙️/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// === CONFIGURACIÓN TTS ===
// 'piper'  -> localhost:5000 (voz local, WAV)
// 'edge'   -> localhost:5000 (voz Azure, MP3)
// 'openai' -> localhost:3000 (voz OpenAI, MP3)
const TTS_MOTOR = 'piper';

const TTS_URLS = {
  piper:  'http://localhost:5000/tts',
  edge:   'http://localhost:5000/tts',
  openai: 'http://localhost:3000/api/tts',
};

// MIME type correcto para cada motor
const TTS_MIME_TYPES = {
  piper:  'audio/wav',
  edge:   'audio/mpeg',
  openai: 'audio/mpeg',
};

async function fetchAudio(txt) {
  const url = TTS_URLS[TTS_MOTOR];
  const mimeType = TTS_MIME_TYPES[TTS_MOTOR];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: txt.trim() })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Error desconocido');
    throw new Error(`TTS error ${response.status}: ${errText}`);
  }

  // Crear blob con el MIME type correcto para que el navegador lo reproduzca bien
  const arrayBuffer = await response.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: mimeType });
  
  return URL.createObjectURL(blob);
}

// speak — no bloquea, dispara y olvida
export async function speak(txt) {
  if (!txt?.trim()) return;
  speakAndWait(txt).catch(e => console.warn('TTS:', e));
}

// speakAndWait — bloquea hasta que el audio termina
export function speakAndWait(txt) {
  if (!txt?.trim()) return Promise.resolve();

  const txtLimpio = limpiarParaVoz(txt);
  if (!txtLimpio) return Promise.resolve();

  return new Promise(async (resolve) => {
    stopAudio();
    setOrb('thinking');

    try {
      const url = await fetchAudio(txtLimpio);
      currentAudio = new Audio(url);

      // Forzar precarga para WAV
      currentAudio.preload = 'auto';

      currentAudio.onplay = () => {
        window._novaHablando = true;
        setOrb('speaking');
        if (waveInt) clearInterval(waveInt);
        waveInt = setInterval(() => {
          setTargetLevel(0.3 + Math.random() * 0.6);
        }, 120);
      };

      currentAudio.onended = () => {
        const _url = currentAudio?._url || url;
        stopAudio();
        setOrb('idle');
        setTargetLevel(0);
        URL.revokeObjectURL(_url);
        setTimeout(() => {
          window._novaHablando = false;
          if (window._novaReiniciarMic && window._novaModoConversacion) {
            window._novaReiniciarMic();
          }
          resolve();
        }, 1200);
      };

      currentAudio.onerror = (e) => {
        console.warn('Error reproduciendo audio:', e);
        stopAudio(); setOrb('idle'); setTargetLevel(0);
        window._novaHablando = false;
        URL.revokeObjectURL(url);
        resolve();
      };

      currentAudio._url = url;
      
      // Para WAV, a veces necesita cargarse antes de play()
      await currentAudio.load();
      await currentAudio.play();

    } catch (err) {
      console.warn('TTS error:', err);
      stopAudio(); setOrb('idle'); setTargetLevel(0);
      window._novaHablando = false;
      resolve();
    }
  });
}