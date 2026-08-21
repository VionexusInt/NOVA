import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak, speakAndWait } from './audio.js';
import { groqChat } from './api.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SPREADSHEET_ID = '1cAY6iB5nhhci9468JQPjejs8c9Ubzp71QteBHYl4hOI';
const GID_OBJETIVO = 1663155225;
const TOKEN_KEY = 'nova_sheets_token';

let accessToken = null;
let tokenExpiry = 0;
let nombreHoja = null;

const COLUMNAS = {
  ID: 0, NOMBRE: 1, CATEGORIA: 2, CONTACTO: 3, TELEFONO: 4,
  ESTADO: 5, CANAL: 6, PROXIMO_PASO: 7, NOTAS: 8
};

function guardarToken(token, expiresIn) {
  accessToken = token;
  tokenExpiry = Date.now() + (expiresIn * 1000) - 60000;
  try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiry: tokenExpiry })); } catch(e) {}
}

function cargarTokenGuardado() {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return false;
    const { token, expiry } = JSON.parse(raw);
    if (expiry > Date.now()) { accessToken = token; tokenExpiry = expiry; return true; }
  } catch(e) {}
  return false;
}

function tokenValido() { return accessToken && Date.now() < tokenExpiry; }

async function cargarGIS() {
  if (window.google?.accounts?.oauth2) return;
  await new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="accounts.google.com/gsi"]')) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar GIS'));
    document.head.appendChild(script);
  });
}

export async function initPipeline() {
  if (cargarTokenGuardado() && tokenValido()) {
    state.pipelineConn = true;
    await resolverNombreHoja();
    return true;
  }
  try {
    await cargarGIS();
    const { GCAL_ID } = await import('./config.js');
    await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GCAL_ID,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        callback: (r) => {
          if (r.error) { reject(new Error(r.error)); return; }
          guardarToken(r.access_token, r.expires_in || 3600);
          resolve();
        },
        error_callback: (e) => reject(new Error(e.type || 'Error auth Sheets'))
      });
      client.requestAccessToken({ prompt: '' });
    });
    state.pipelineConn = true;
    await resolverNombreHoja();
    return true;
  } catch(e) {
    state.pipelineConn = false;
    console.warn('Pipeline auth error:', e.message);
    return false;
  }
}

async function sheetsFetch(path, options = {}) {
  if (!tokenValido()) { state.pipelineConn = false; throw new Error('Token Sheets expirado.'); }
  const r = await fetch(`${SHEETS_API}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000)
  });
  if (r.status === 401) { accessToken = null; state.pipelineConn = false; throw new Error('Sesión Sheets expirada.'); }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Sheets API ${r.status}: ${body.substring(0,150)}`);
  }
  return r.json();
}

async function resolverNombreHoja() {
  if (nombreHoja) return nombreHoja;
  try {
    const d = await sheetsFetch(`/${SPREADSHEET_ID}?fields=sheets.properties`);
    const hoja = d.sheets?.find(s => s.properties?.sheetId === GID_OBJETIVO) || d.sheets?.[0];
    nombreHoja = hoja?.properties?.title || 'Hoja 1';
    return nombreHoja;
  } catch(e) {
    console.warn('resolverNombreHoja:', e.message);
    nombreHoja = 'Hoja 1';
    return nombreHoja;
  }
}

function filaAObjeto(fila, indice) {
  return {
    fila: indice + 2,
    id: fila[COLUMNAS.ID] || '',
    nombre: fila[COLUMNAS.NOMBRE] || '',
    categoria: fila[COLUMNAS.CATEGORIA] || '',
    contacto: fila[COLUMNAS.CONTACTO] || '',
    telefono: fila[COLUMNAS.TELEFONO] || '',
    estado: fila[COLUMNAS.ESTADO] || '',
    canal: fila[COLUMNAS.CANAL] || '',
    proximoPaso: fila[COLUMNAS.PROXIMO_PASO] || '',
    notas: fila[COLUMNAS.NOTAS] || '',
  };
}

export async function obtenerPipeline() {
  if (!state.pipelineConn) return [];
  try {
    const hoja = await resolverNombreHoja();
    const d = await sheetsFetch(`/${SPREADSHEET_ID}/values/${encodeURIComponent(hoja)}!A2:I1000`);
    const filas = d.values || [];
    return filas.filter(f => f[COLUMNAS.NOMBRE]).map(filaAObjeto);
  } catch(e) { console.warn('obtenerPipeline:', e.message); return []; }
}

export async function buscarNegocio(nombreParcial) {
  const pipeline = await obtenerPipeline();
  const q = nombreParcial.toLowerCase();
  return pipeline.find(n => n.nombre.toLowerCase().includes(q)) || null;
}

export async function actualizarCampo(nombreNegocio, campo, valor) {
  if (!state.pipelineConn) return false;
  const negocio = await buscarNegocio(nombreNegocio);
  if (!negocio) return false;

  const colIndex = COLUMNAS[campo.toUpperCase()];
  if (colIndex === undefined) return false;
  const colLetra = String.fromCharCode(65 + colIndex);

  try {
    const hoja = await resolverNombreHoja();
    await sheetsFetch(`/${SPREADSHEET_ID}/values/${encodeURIComponent(hoja)}!${colLetra}${negocio.fila}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: [[valor]] })
    });
    return true;
  } catch(e) { console.error('actualizarCampo:', e.message); return false; }
}

export async function crearNegocio({ nombre, categoria = '', contacto = '', telefono = '', estado = 'Prospecto', canal = '', proximoPaso = '', notas = '' }) {
  if (!state.pipelineConn) return false;
  try {
    const hoja = await resolverNombreHoja();
    const pipeline = await obtenerPipeline();
    const nuevoId = pipeline.length > 0 ? Math.max(...pipeline.map(p => parseInt(p.id) || 0)) + 1 : 1;

    await sheetsFetch(`/${SPREADSHEET_ID}/values/${encodeURIComponent(hoja)}!A:I:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: [[nuevoId, nombre, categoria, contacto, telefono, estado, canal, proximoPaso, notas]] })
    });
    return true;
  } catch(e) { console.error('crearNegocio:', e.message); return false; }
}

export async function resumenPipeline() {
  const pipeline = await obtenerPipeline();
  if (pipeline.length === 0) return null;

  const porEstado = {};
  pipeline.forEach(n => { porEstado[n.estado] = (porEstado[n.estado] || 0) + 1; });

  const enNegociacion = pipeline.filter(n => n.estado.toLowerCase().includes('negocia'));
  const conReunion = pipeline.filter(n => n.proximoPaso.toLowerCase().includes('reunion') || n.proximoPaso.toLowerCase().includes('reunión'));

  return { total: pipeline.length, porEstado, enNegociacion, conReunion, pipeline };
}

export async function checkInPipeline() {
  const resumen = await resumenPipeline();
  if (!resumen) return;

  const partes = [];
  partes.push(`${resumen.total} negocios en el pipeline`);
  if (resumen.porEstado['Firmado']) partes.push(`${resumen.porEstado['Firmado']} firmados`);
  if (resumen.enNegociacion.length > 0) partes.push(`${resumen.enNegociacion.length} en negociación`);
  if (resumen.conReunion.length > 0) partes.push(`${resumen.conReunion.length} con reunión pendiente`);

  const mensaje = `Pipeline: ${partes.join(', ')}.`;
  addMsg('nova', mensaje);
  if (state.audioOn) await speakAndWait(mensaje);
}

export async function verPipeline() {
  const resumen = await resumenPipeline();
  if (!resumen) {
    addMsg('nova', 'No he podido leer el pipeline. ¿Está conectado el CRM?');
    return;
  }

  initPipelineStyles();
  const d = document.getElementById('display');
  if (d) {
    const el = document.createElement('div');
    el.className = 'msg';
    el.innerHTML = `
      <div class="mw nova">// N.O.V.A — PIPELINE DE NEGOCIOS</div>
      <div class="pipe-card">
        <div class="pipe-stats">
          ${Object.entries(resumen.porEstado).map(([estado, n]) => `
            <div class="pipe-stat pipe-${estado.toLowerCase().replace(/\s/g,'')}">
              <div class="pipe-stat-num">${n}</div>
              <div class="pipe-stat-label">${escHtml(estado)}</div>
            </div>
          `).join('')}
        </div>
        <div class="pipe-lista">
          ${resumen.pipeline.slice(0, 10).map(n => `
            <div class="pipe-item">
              <span class="pipe-badge pipe-badge-${n.estado.toLowerCase().replace(/\s/g,'')}">${escHtml(n.estado)}</span>
              <span class="pipe-nombre">${escHtml(n.nombre)}</span>
              <span class="pipe-paso">${escHtml(n.proximoPaso)}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    d.appendChild(el);
    d.scrollTop = d.scrollHeight;
  }

  const mensaje = `${resumen.total} negocios en el pipeline. ${resumen.enNegociacion.length} en negociación activa.`;
  if (state.audioOn) speak(mensaje);
}

function escHtml(t) { return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export function pipelineDisponible() { return state.pipelineConn && tokenValido(); }

export function initPipelineStyles() {
  if (document.getElementById('pipe-styles')) return;
  const s = document.createElement('style');
  s.id = 'pipe-styles';
  s.textContent = `
    .pipe-card { border:1px solid rgba(74,158,255,0.18); border-radius:4px; overflow:hidden; margin-top:6px; background:rgba(0,4,14,0.85); max-width:600px; }
    .pipe-stats { display:flex; gap:0; border-bottom:1px solid rgba(74,158,255,0.1); }
    .pipe-stat { flex:1; padding:14px; text-align:center; border-right:1px solid rgba(74,158,255,0.06); }
    .pipe-stat:last-child { border-right:none; }
    .pipe-stat-num { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:rgba(235,242,255,0.92); }
    .pipe-stat-label { font-family:'DM Mono',monospace; font-size:7px; letter-spacing:0.15em; text-transform:uppercase; color:rgba(140,175,220,0.5); margin-top:3px; }
    .pipe-lista { padding:8px 0; }
    .pipe-item { display:flex; align-items:center; gap:10px; padding:9px 16px; border-bottom:1px solid rgba(74,158,255,0.05); }
    .pipe-item:last-child { border-bottom:none; }
    .pipe-badge { font-family:'DM Mono',monospace; font-size:7px; letter-spacing:0.1em; text-transform:uppercase; padding:3px 8px; border-radius:2px; white-space:nowrap; }
    .pipe-badge-firmado { background:rgba(82,214,138,0.1); color:rgba(82,214,138,0.85); }
    .pipe-badge-contactado { background:rgba(74,158,255,0.1); color:rgba(74,158,255,0.85); }
    .pipe-badge-prospecto { background:rgba(160,175,200,0.1); color:rgba(160,175,200,0.75); }
    .pipe-badge-ennegociación, .pipe-badge-ennegocia { background:rgba(230,150,90,0.1); color:rgba(230,150,90,0.85); }
    .pipe-nombre { flex:1; font-family:'Fraunces',serif; font-size:13px; color:rgba(225,235,250,0.9); }
    .pipe-paso { font-family:'DM Mono',monospace; font-size:9px; color:rgba(140,175,220,0.5); white-space:nowrap; }
  `;
  document.head.appendChild(s);
}