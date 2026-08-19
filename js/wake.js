import { briefingAutomatico } from './briefing.js';
import { setOrb, setTargetLevel } from './orb.js';
import { addMsg } from './chat.js';

let wakeMusic = null;
let wakeActive = false;

async function efectoActivacionVisual() {
  setOrb('thinking');
  setTargetLevel(0.3);
  await new Promise(r => setTimeout(r, 200));
  
  setTargetLevel(0.9);
  await new Promise(r => setTimeout(r, 300));
  
  setTargetLevel(0.5);
  await new Promise(r => setTimeout(r, 200));
  
  setTargetLevel(0.8);
  await new Promise(r => setTimeout(r, 400));
}

export async function activarModoDespertar() {
  if (wakeActive) return;
  wakeActive = true;
  
  await efectoActivacionVisual();
  
  wakeMusic = new Audio('/wake.mp3');
  wakeMusic.volume = 0;
  wakeMusic.loop = false;
  
  try {
    await wakeMusic.play();
  } catch (e) {
    console.warn('No se pudo reproducir wake.mp3:', e);
  }
  
  fadeIn(wakeMusic, 0.45, 1800);
  
  await new Promise(r => setTimeout(r, 1500));
  addMsg('nova', '// SISTEMAS EN LÍNEA — INICIANDO BRIEFING //');
  
  await briefingAutomatico();
  
  fadeOut(wakeMusic, 2500, () => {
    wakeMusic.pause();
    wakeMusic = null;
    wakeActive = false;
    setOrb('idle');
    setTargetLevel(0);
  });
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