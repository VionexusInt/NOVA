import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';
import { groqChat } from './api.js';
import { cargarGIS } from './googleAuth.js';

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const TOKEN_KEY = 'nova_tasks_token';
let accessToken = null;
let tokenExpiry = 0;
let gisLoaded = false;
let listaId = '@default';

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

export async function initGoogleTasks(intentarPopup = false) {
  if (cargarTokenGuardado() && tokenValido()) {
    state.tasksConn = true;
    await sincronizarTareas();
    return true;
  }
  if (!intentarPopup) {
    state.tasksConn = false;
    return false;
  }

  try {
    await cargarGIS();
    const { GCAL_ID } = await import('./config.js');
    await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GCAL_ID,
        scope: 'https://www.googleapis.com/auth/tasks',
        callback: (r) => {
          if (r.error) { reject(new Error(r.error)); return; }
          guardarToken(r.access_token, r.expires_in || 3600);
          resolve();
        },
        error_callback: (e) => reject(new Error(e.type || 'Error auth Tasks'))
      });
      client.requestAccessToken({ prompt: '' });
    });
    state.tasksConn = true;
    await sincronizarTareas();
    return true;
  } catch(e) {
    state.tasksConn = false;
    console.warn('Google Tasks auth error:', e.message);
    return false;
  }
}

async function tasksFetch(path, options = {}) {
  if (!tokenValido()) { state.tasksConn = false; throw new Error('Token Tasks expirado.'); }
  const r = await fetch(`${TASKS_API}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(10000)
  });
  if (r.status === 401) { accessToken = null; state.tasksConn = false; throw new Error('Sesión Tasks expirada.'); }
  if (!r.ok) throw new Error(`Tasks API ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}

export async function obtenerTareas() {
  if (!state.tasksConn) return [];
  try {
    const d = await tasksFetch(`/lists/${listaId}/tasks?showCompleted=false&maxResults=50`);
    return (d.items || []).map(t => ({
      id: t.id,
      text: t.title,
      notas: t.notes || '',
      vencimiento: t.due ? new Date(t.due).toLocaleDateString('es-ES') : null,
      completada: t.status === 'completed',
      p: t.title?.toLowerCase().includes('urgente') ? 'u' : t.title?.toLowerCase().includes('importante') ? 'h' : 'n',
      done: false,
    }));
  } catch(e) { console.warn('obtenerTareas:', e.message); return []; }
}

async function sincronizarTareas() {
  try {
    const tareas = await obtenerTareas();
    state.tasks = tareas;
    const { renderTasks } = await import('./tareas.js');
    renderTasks();
    console.log(`[TASKS] ${tareas.length} tareas sincronizadas desde Google Tasks`);
  } catch(e) { console.warn('sincronizarTareas:', e.message); }
}

export async function crearTareaGoogle(texto, prioridad = 'n', vencimiento = null) {
  if (!state.tasksConn) return null;
  try {
    const titulo = prioridad === 'u' ? `[URGENTE] ${texto}` : prioridad === 'h' ? `[IMPORTANTE] ${texto}` : texto;
    const body = { title: titulo };
    if (vencimiento) {
      const fecha = new Date(vencimiento);
      if (!isNaN(fecha)) body.due = fecha.toISOString();
    }
    const resultado = await tasksFetch(`/lists/${listaId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    await sincronizarTareas();
    return resultado;
  } catch(e) { console.error('crearTareaGoogle:', e.message); return null; }
}

export async function completarTarea(id) {
  if (!state.tasksConn) return false;
  try {
    await tasksFetch(`/lists/${listaId}/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' })
    });
    await sincronizarTareas();
    return true;
  } catch(e) { console.error('completarTarea:', e.message); return false; }
}

export async function eliminarTarea(id) {
  if (!state.tasksConn) return false;
  try {
    await tasksFetch(`/lists/${listaId}/tasks/${id}`, { method: 'DELETE' });
    await sincronizarTareas();
    return true;
  } catch(e) { console.error('eliminarTarea:', e.message); return false; }
}

export async function resumenTareasUrgentes() {
  if (!state.tasksConn) return null;
  try {
    const tareas = await obtenerTareas();
    if (tareas.length === 0) return null;
    const urgentes = tareas.filter(t => t.p === 'u');
    const lista = (urgentes.length > 0 ? urgentes : tareas).slice(0, 5).map(t => t.text).join(', ');
    return await groqChat([{
      role: 'user',
      content: `Tienes ${tareas.length} tareas pendientes${urgentes.length > 0 ? `, ${urgentes.length} urgentes` : ''}. Las más importantes: ${lista}. Resume en 1 frase.`
    }], 'openai/gpt-oss-20b', 80);
  } catch(e) { return null; }
}

export function tasksDisponible() { return state.tasksConn && tokenValido(); }