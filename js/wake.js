import { setOrb, setTargetLevel } from './orb.js';
import { addMsg } from './chat.js';
import { briefingAutomatico } from './briefing.js';

let wakeMusic = null;
let wakeActive = false;

export async function activarModoDespertar() {
  if (wakeActive) return;
  wakeActive = true;

  setOrb('thinking');
  setTargetLevel(0.8);

  wakeMusic = new Audio('/wake.mp3');
  wakeMusic.volume = 0;
  wakeMusic.loop = false;

  try {
    await wakeMusic.play();
  } catch (e) {
    console.error(e);
  }

  fadeIn(wakeMusic, 0.55, 1500);

  await new Promise(r => setTimeout(r, 2000));

  addMsg('nova', '// SISTEMAS ACTIVOS — INICIANDO BRIEFING //');
  window._novaHablando = true;
  briefingAutomatico();

  const esperarAudio = setInterval(() => {
    if (!window._novaHablando) {
      clearInterval(esperarAudio);
      setTimeout(() => {
        fadeOut(wakeMusic, 2000, () => {
          wakeMusic.pause();
          wakeMusic = null;
          wakeActive = false;
          setOrb('idle');
          setTargetLevel(0);
        });
      }, 1000);
    }
  }, 500);
}

function fadeIn(audio, targetVol, ms) {
  const steps = 30;
  const interval = ms / steps;
  const increment = targetVol / steps;
  let vol = 0;
  const timer = setInterval(() => {
    vol = Math.min(vol + increment, targetVol);
    audio.volume = vol;
    if (vol >= targetVol) clearInterval(timer);
  }, interval);
}

function fadeOut(audio, ms, cb) {
  const steps = 30;
  const interval = ms / steps;
  const decrement = audio.volume / steps;
  const timer = setInterval(() => {
    audio.volume = Math.max(audio.volume - decrement, 0);
    if (audio.volume <= 0) {
      clearInterval(timer);
      if (cb) cb();
    }
  }, interval);
}