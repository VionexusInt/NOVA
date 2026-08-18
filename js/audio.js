import { setOrb, setTargetLevel } from './orb.js';

let currentAudio = null;
let waveInt = null;

window._novaHablando = false;

function stopAudio() {
  if (waveInt) { clearInterval(waveInt); waveInt = null; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

async function fetchAudio(txt) {
  const response = await fetch('http://localhost:5000/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: txt.trim() })
  });
  if (!response.ok) throw new Error('TTS no disponible');
  const blob = await response.blob();
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
      await currentAudio.play();

    } catch (err) {
      console.warn('TTS error:', err);
      stopAudio(); setOrb('idle'); setTargetLevel(0);
      window._novaHablando = false;
      resolve();
    }
  });
}