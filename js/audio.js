import { setOrb, setTargetLevel } from './orb.js';

let currentAudio = null;
let waveInt = null;

window._novaHablando = false;

function stopAudio() {
  if (waveInt) { clearInterval(waveInt); waveInt = null; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

function limpiarParaVoz(txt) {
  if (!txt || typeof txt !== 'string') return '';
  return txt
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[\u{2600}-\u{26FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[⚡✅⚠️⚠🔍📄⏪❌📋🔧🎙️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAudio(txt) {
  const txtLimpio = limpiarParaVoz(txt);
  if (!txtLimpio) {
    console.warn('TTS: Texto vacio despues de limpiar');
    throw new Error('Texto vacio despues de limpiar');
  }
  const response = await fetch('http://localhost:5000/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: txtLimpio })
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => 'Error desconocido');
    throw new Error(`TTS error ${response.status}: ${errText}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function speak(txt) {
  if (!txt?.trim()) return;
  speakAndWait(txt).catch(e => console.warn('TTS:', e));
}

export function speakAndWait(txt) {
  if (!txt?.trim()) return Promise.resolve();
  return new Promise(async (resolve) => {
    stopAudio();
    setOrb('thinking');
    try {
      const url = await fetchAudio(txt);
      currentAudio = new Audio(url);
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
      currentAudio.onerror = () => {
        stopAudio(); setOrb('idle'); setTargetLevel(0);
        window._novaHablando = false;
        URL.revokeObjectURL(url);
        resolve();
      };
      currentAudio._url = url;
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