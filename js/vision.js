import { addMsg } from './chat.js';
import { setOrb, setTargetLevel } from './orb.js';
import { speak } from './audio.js';
import { state } from './state.js';

const NVIDIA_KEY = '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';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const VISION_MODEL = 'meta/llama-4-maverick-17b-128e-instruct';

let stream = null;
let videoEl = null;
let canvasEl = null;
let modoVigilanteInterval = null;
let camaraActiva = false;

export async function iniciarCamara(facingMode = 'user') {
  try {
    if (stream) pararCamara();

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });

    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.style.cssText = 'display:none;';
      document.body.appendChild(videoEl);
    }

    if (!canvasEl) {
      canvasEl = document.createElement('canvas');
      canvasEl.style.display = 'none';
      document.body.appendChild(canvasEl);
    }

    videoEl.srcObject = stream;
    await videoEl.play();
    camaraActiva = true;

    console.log('📷 Cámara activada:', facingMode);
    return true;
  } catch (e) {
    console.error('Error cámara:', e);
    addMsg('nova', '⚠ No se pudo acceder a la cámara: ' + e.message);
    return false;
  }
}

export function pararCamara() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (modoVigilanteInterval) {
    clearInterval(modoVigilanteInterval);
    modoVigilanteInterval = null;
  }
  camaraActiva = false;
  ocultarPreview();
}

function capturarFrame() {
  if (!videoEl || !canvasEl || !stream) return null;
  canvasEl.width = videoEl.videoWidth || 640;
  canvasEl.height = videoEl.videoHeight || 480;
  const ctx = canvasEl.getContext('2d');
  ctx.drawImage(videoEl, 0, 0);
  return canvasEl.toDataURL('image/jpeg', 0.85).split(',')[1];
}

async function analizarConNvidia(base64Image, prompt) {
  const messages = [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
      { type: 'text', text: `Eres NOVA, IA personal estilo JARVIS. ${prompt} Responde en español de España. Sé conciso y directo.` }
    ]
  }];

  const r = await fetch('http://localhost:4000/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: NVIDIA_KEY, model: VISION_MODEL, messages })
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Vision proxy: ${r.status} - ${err.substring(0, 100)}`);
  }

  const d = await r.json();
  return d.choices[0].message.content;
}

export async function mirarPorCamara(pregunta = null, facingMode = 'user') {
  setOrb('thinking');
  setTargetLevel(0.6);

  const yaActiva = camaraActiva;
  if (!yaActiva) {
    const ok = await iniciarCamara(facingMode);
    if (!ok) { setOrb('idle'); setTargetLevel(0); return; }
    await new Promise(r => setTimeout(r, 800));
  }

  mostrarPreview();

  const frame = capturarFrame();
  if (!frame) {
    addMsg('nova', '⚠ No se pudo capturar imagen de la cámara.');
    setOrb('idle'); setTargetLevel(0);
    if (!yaActiva) pararCamara();
    return;
  }

  addMsg('nova', '🔍 Analizando lo que veo...');

  try {
    const prompt = pregunta ||
      'Describe detalladamente lo que ves en esta imagen. Si hay personas, objetos, texto o situaciones relevantes, menciónalos.';

    const respuesta = await analizarConNvidia(frame, prompt);

    addMsg('nova', respuesta);
    if (state.audioOn) speak(respuesta);
    setOrb('speaking');

  } catch (e) {
    console.error('Vision error:', e);
    addMsg('nova', '⚠ Error analizando imagen: ' + e.message);
    setOrb('idle'); setTargetLevel(0);
  }

  if (!yaActiva) {
    setTimeout(() => {
      pararCamara();
      ocultarPreview();
    }, 3000);
  }
}

export async function leerTextoEnCamara() {
  await mirarPorCamara('Lee y transcribe todo el texto que aparezca en la imagen. Si no hay texto visible, indícalo.');
}

export async function identificarPersona() {
  await mirarPorCamara('Describe las personas que ves: cuántas hay, qué hacen, cómo van vestidas, su posición. No identifiques personas por nombre.');
}

export async function analizarEntorno() {
  await mirarPorCamara('Analiza el entorno que ves: tipo de lugar, objetos presentes, condiciones de luz, si hay algo inusual o relevante que destacar.');
}

export async function activarModoVigilante(intervaloMin = 5) {
  if (modoVigilanteInterval) {
    clearInterval(modoVigilanteInterval);
    modoVigilanteInterval = null;
    addMsg('nova', 'Modo vigilante desactivado.');
    pararCamara();
    return;
  }

  const ok = await iniciarCamara('environment');
  if (!ok) return;

  addMsg('nova', `Modo vigilante activo. Analizando cada ${intervaloMin} minutos.`);

  const analizar = async () => {
    const frame = capturarFrame();
    if (!frame) return;
    try {
      const resp = await analizarConNvidia(frame,
        'Analiza esta imagen de seguridad. Detecta si hay algo inusual, personas desconocidas, o situaciones que requieran atención. Si todo está normal, di solo "Sin novedades."');
      if (!resp.toLowerCase().includes('sin novedades')) {
        addMsg('nova', `🔔 Vigilante: ${resp}`);
        if (state.audioOn) speak(resp);
      }
    } catch (e) { console.warn('Vigilante error:', e); }
  };

  await analizar();
  modoVigilanteInterval = setInterval(analizar, intervaloMin * 60 * 1000);
}

function mostrarPreview() {
  let preview = document.getElementById('camera-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'camera-preview';
    preview.style.cssText = `
      position:fixed;bottom:80px;right:20px;
      width:200px;height:150px;
      border:1px solid rgba(0,212,255,0.4);
      border-radius:4px;
      overflow:hidden;
      z-index:100;
      background:#000;
      box-shadow:0 0 20px rgba(0,212,255,0.2);
    `;
    const lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;top:4px;left:6px;font-family:Share Tech Mono,monospace;font-size:8px;letter-spacing:2px;color:rgba(0,212,255,0.7);z-index:1;';
    lbl.textContent = '⬤ CÁMARA';
    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = 'position:absolute;top:4px;right:6px;font-size:12px;color:rgba(255,59,59,0.7);cursor:pointer;z-index:1;';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => { pararCamara(); ocultarPreview(); };
    const v = document.createElement('video');
    v.id = 'camera-preview-video';
    v.autoplay = true; v.playsInline = true; v.muted = true;
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    preview.appendChild(lbl);
    preview.appendChild(closeBtn);
    preview.appendChild(v);
    document.body.appendChild(preview);
  }
  const pv = document.getElementById('camera-preview-video');
  if (pv && stream) pv.srcObject = stream;
  preview.style.display = 'block';
}

function ocultarPreview() {
  const preview = document.getElementById('camera-preview');
  if (preview) preview.style.display = 'none';
}

export function camara() {
  return { camaraActiva, pararCamara, iniciarCamara };
}