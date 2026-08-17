import { setOrb, setTargetLevel } from './orb.js';

let currentAudio = null;
let waveInt = null;

// Estado global accesible desde mic.js
window._novaHablando = false;

function stopAudio() {
  if (waveInt) { clearInterval(waveInt); waveInt = null; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

export async function speak(txt) {
  if (!txt || typeof txt !== 'string' || !txt.trim()) {
    stopAudio(); setOrb('idle'); setTargetLevel(0); return;
  }

  stopAudio();
  setOrb('thinking');

  try {
    const response = await fetch('http://localhost:5000/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: txt.trim() })
    });

    if (!response.ok) throw new Error('TTS no disponible');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);

    currentAudio.onplay = () => {
      // Marcar que NOVA está hablando — mic.js ignorará resultados mientras tanto
      window._novaHablando = true;

      setOrb('speaking');
      if (waveInt) clearInterval(waveInt);
      waveInt = setInterval(() => {
        setTargetLevel(0.3 + Math.random() * 0.6);
      }, 120);
    };

    currentAudio.onended = () => {
      stopAudio();
      setOrb('idle');
      setTargetLevel(0);
      URL.revokeObjectURL(url);

      // Esperar 1.5s después de terminar para evitar eco residual
      setTimeout(() => {
        window._novaHablando = false;
        // Si estamos en modo conversación, reactivar escucha
        if (window._novaReiniciarMic && window._novaModoConversacion) {
          window._novaReiniciarMic();
        }
      }, 1500);
    };

    currentAudio.onerror = () => {
      stopAudio(); setOrb('idle'); setTargetLevel(0);
      window._novaHablando = false;
      URL.revokeObjectURL(url);
    };

    await currentAudio.play();

  } catch (err) {
    console.error('TTS error:', err);
    stopAudio(); setOrb('idle'); setTargetLevel(0);
    window._novaHablando = false;
  }
}