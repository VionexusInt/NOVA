import { GCAL_ID } from './config.js';
import { esc } from './helpers.js';
import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let gisLoaded = false;
let calCheckInterval = null;

const CAL_API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_STORAGE_KEY = 'nova_gcal_token';

function guardarToken(token, expiresInSec) {
  accessToken = token;
  tokenExpiry = Date.now() + (expiresInSec * 1000) - 60000;
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiry: tokenExpiry }));
  } catch (e) {}
}

function cargarTokenGuardado() {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return false;
    const { token, expiry } = JSON.parse(raw);
    if (expiry > Date.now()) {
      accessToken = token;
      tokenExpiry = expiry;
      return true;
    }
  } catch (e) {}
  return false;
}

function tokenValido() {
  return accessToken && Date.now() < tokenExpiry;
}

async function cargarGIS() {
  if (gisLoaded) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
    document.head.appendChild(script);
  });
  gisLoaded = true;
}

export async function initCalendar() {
  if (cargarTokenGuardado() && tokenValido()) {
    state.calConn = true;
    await loadCalEvents();
    iniciarMonitorCalendario();
    return;
  }

  const setup = document.getElementById('calSetup');
  if (setup) setup.innerHTML = '<p style="color:var(--text-mid);font-size:13px;">Conectando...</p>';

  try {
    await cargarGIS();

    await new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GCAL_ID,
        scope: 'https://www.googleapis.com/auth/calendar',
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error));
            return;
          }
          guardarToken(response.access_token, response.expires_in || 3600);
          resolve();
        },
        error_callback: (err) => reject(new Error(err.type || 'Error de autenticación')),
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });

    state.calConn = true;
    await loadCalEvents();
    iniciarMonitorCalendario();

  } catch (e) {
    state.calConn = false;
    if (setup) {
      setup.innerHTML = `<p style="color:var(--red, #e87070);font-size:13px;">Error: ${esc(e.message || 'No se pudo conectar')}</p><button class="action-btn" id="btnConnectCal" style="margin-top:10px;">reintentar</button>`;
    }
    document.getElementById('btnConnectCal')?.addEventListener('click', initCalendar);
  }
}

async function calFetch(path, options = {}) {
  if (!tokenValido()) {
    throw new Error('Token expirado. Reconecta el calendario.');
  }
  const r = await fetch(`${CAL_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(10000)
  });
  if (r.status === 401) {
    accessToken = null;
    state.calConn = false;
    throw new Error('Sesión de calendario expirada. Reconecta.');
  }
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Google Calendar ${r.status}: ${body.substring(0, 150)}`);
  }
  return r.json();
}

export async function loadCalEvents() {
  const setup = document.getElementById('calSetup');
  if (setup) setup.style.display = 'none';
  const evEl = document.getElementById('calEvents');
  if (!evEl) return;
  evEl.style.display = 'block';

  let eventos = [];
  try {
    eventos = await getEventos(7);
  } catch (e) {
    evEl.innerHTML = `<div class="empty">Error cargando eventos: ${esc(e.message)}</div>`;
    return;
  }

  if (eventos.length === 0) {
    evEl.innerHTML = '<div class="empty">Sin eventos los próximos 7 días</div>';
    return;
  }

  evEl.innerHTML = eventos.map(e => {
    const s = e.start.dateTime ? new Date(e.start.dateTime) : new Date(e.start.date);
    const ts = e.start.dateTime
      ? s.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      : s.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    return `<div class="cal-ev">
      <div class="cal-time">${esc(ts)}</div>
      <div>
        <div class="cal-name">${esc(e.summary || 'Sin título')}</div>
        ${e.location ? `<div class="cal-desc">📍 ${esc(e.location)}</div>` : ''}
        ${e.description ? `<div class="cal-desc">${esc(e.description.substring(0, 80))}${e.description.length > 80 ? '...' : ''}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function getEventos(dias = 7) {
  if (!state.calConn) return [];
  try {
    const now = new Date();
    const end = new Date(now.getTime() + dias * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '20'
    });
    const d = await calFetch(`/calendars/primary/events?${params}`);
    return d.items || [];
  } catch (e) {
    console.warn('getEventos:', e.message);
    return [];
  }
}

export async function getEventosHoy() {
  if (!state.calConn) return [];
  try {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '10'
    });
    const d = await calFetch(`/calendars/primary/events?${params}`);
    return d.items || [];
  } catch (e) {
    console.warn('getEventosHoy:', e.message);
    return [];
  }
}

export async function crearEvento(titulo, fecha, hora, duracionMin = 60, descripcion = '') {
  if (!state.calConn) return null;
  try {
    const start = new Date(`${fecha}T${hora}:00`);
    if (isNaN(start.getTime())) throw new Error('Fecha u hora inválida');
    const end = new Date(start.getTime() + duracionMin * 60 * 1000);

    const body = {
      summary: titulo,
      description: descripcion,
      start: { dateTime: start.toISOString(), timeZone: 'Europe/Madrid' },
      end: { dateTime: end.toISOString(), timeZone: 'Europe/Madrid' }
    };

    return await calFetch('/calendars/primary/events', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('Error creando evento:', e.message);
    return null;
  }
}

export async function getResumenCalendario() {
  if (!state.calConn) return 'El calendario no está conectado.';

  let hoy = [], semana = [];
  try {
    [hoy, semana] = await Promise.all([getEventosHoy(), getEventos(7)]);
  } catch (e) {
    return 'No se pudo consultar el calendario en este momento.';
  }

  let resumen = '';

  if (hoy.length === 0) {
    resumen += 'Hoy no tienes eventos.';
  } else {
    resumen += `Hoy tienes ${hoy.length} evento${hoy.length > 1 ? 's' : ''}: `;
    resumen += hoy.map(e => {
      const s = e.start.dateTime ? new Date(e.start.dateTime) : null;
      const h = s ? s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
      return `${e.summary}${h ? ' a las ' + h : ''}`;
    }).join(', ') + '.';
  }

  const manana = semana.filter(e => {
    const s = new Date(e.start.dateTime || e.start.date);
    const m = new Date(); m.setDate(m.getDate() + 1);
    return s.toDateString() === m.toDateString();
  });

  if (manana.length > 0) {
    resumen += ` Mañana: ${manana.map(e => e.summary).join(', ')}.`;
  }

  return resumen;
}

function iniciarMonitorCalendario() {
  if (calCheckInterval) clearInterval(calCheckInterval);

  calCheckInterval = setInterval(async () => {
    if (!state.calConn || !tokenValido()) return;
    try {
      const now = new Date();
      const in15 = new Date(now.getTime() + 16 * 60 * 1000);
      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: in15.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '5'
      });
      const d = await calFetch(`/calendars/primary/events?${params}`);
      const eventos = d.items || [];

      for (const ev of eventos) {
        const start = new Date(ev.start.dateTime || ev.start.date);
        const minutos = Math.round((start - now) / 60000);
        const key = `cal_notif_${ev.id}`;

        if (!sessionStorage.getItem(key) && minutos <= 15 && minutos > 0) {
          sessionStorage.setItem(key, '1');
          const msg = `⏰ En ${minutos} minutos: ${ev.summary}${ev.location ? ' en ' + ev.location : ''}`;
          addMsg('nova', msg);
          if (state.audioOn) speak(`En ${minutos} minutos tienes ${ev.summary}`);
        }
      }
    } catch (e) {
      // Si el token expiró silenciosamente, marcar desconectado
      if (e.message?.includes('expirad')) {
        state.calConn = false;
        clearInterval(calCheckInterval);
      }
    }
  }, 60000);
}

export async function calendarDisponible() {
  return state.calConn && tokenValido();
}