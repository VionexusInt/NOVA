import { briefingAutomatico } from './briefing.js';
import { setOrb, setTargetLevel, triggerCinematicSequence } from './orb.js';
import { addMsg } from './chat.js';

let wakeMusic = null;
let wakeActive = false;

export async function activarModoDespertar() {
  if (wakeActive) return;
  wakeActive = true;
  
  console.log('🎬 Iniciando secuencia cinematográfica...');
  
  triggerCinematicSequence();
  
  wakeMusic = new Audio('/wake.mp3');
  wakeMusic.volume = 0;
  wakeMusic.loop = false;
  
  try {
    await wakeMusic.play();
  } catch (e) {
    console.warn('No se pudo reproducir wake.mp3:', e);
  }
  
  fadeIn(wakeMusic, 0.25, 2500);
  
  await new Promise(r => setTimeout(r, 2000));
  
  addMsg('nova', '// SISTEMAS EN LÍNEA — INICIANDO BRIEFING //');
  
  await new Promise(r => setTimeout(r, 500));
  
  await briefingAutomatico();
  
  fadeOut(wakeMusic, 3000, () => {
    wakeMusic.pause();
    wakeMusic = null;
    wakeActive = false;
    setOrb('idle');
    setTargetLevel(0);
  });
}

function fadeIn(audio, targetVol, ms) {
  const steps = 40;
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
  const steps = 40;
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