import { GCAL_ID } from './config.js';
import { esc } from './helpers.js';
import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';

let gapiLoaded = false;
let calCheckInterval = null;

export async function initCalendar() {
  if (state.calConn) { loadCalEvents(); return; }

  const setup = document.getElementById('calSetup');
  if (setup) setup.innerHTML = '<p style="color:var(--muted);font-size:13px;">Conectando...</p>';

  if (!gapiLoaded) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    gapiLoaded = true;
  }

  await new Promise((resolve, reject) => {
    gapi.load('client:auth2', { callback: resolve, onerror: reject });
  });

  try {
    await gapi.client.init({
      clientId: GCAL_ID,
      scope: 'https://www.googleapis.com/auth/calendar',
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
    });

    const auth = gapi.auth2.getAuthInstance();
    if (!auth.isSignedIn.get()) {
      await auth.signIn();
    }

    state.calConn = true;
    loadCalEvents();
    iniciarMonitorCalendario();

  } catch (e) {
    const setup = document.getElementById('calSetup');
    if (setup) setup.innerHTML = `<p style="color:var(--red);font-size:13px;">Error: ${esc(e.error || e.message || 'No se pudo conectar')}</p><button class="action-btn" id="btnConnectCal" style="margin-top:10px;">REINTENTAR</button>`;
    document.getElementById('btnConnectCal')?.addEventListener('click', initCalendar);
  }
}

export async function loadCalEvents() {
  const setup = document.getElementById('calSetup');
  if (setup) setup.style.display = 'none';
  const evEl = document.getElementById('calEvents');
  if (!evEl) return;
  evEl.style.display = 'block';

  const eventos = await getEventos(7);

  if (eventos.length === 0) {
    evEl.innerHTML = '<div class="empty">// SIN EVENTOS LOS PRÓXIMOS 7 DÍAS //</div>';
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
    const r = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20
    });
    return r.result.items || [];
  } catch (e) { return []; }
}

export async function getEventosHoy() {
  if (!state.calConn) return [];
  try {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const r = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10
    });
    return r.result.items || [];
  } catch (e) { return []; }
}

export async function crearEvento(titulo, fecha, hora, duracionMin = 60, descripcion = '') {
  if (!state.calConn) return null;
  try {
    const start = new Date(`${fecha}T${hora}:00`);
    const end = new Date(start.getTime() + duracionMin * 60 * 1000);
    const r = await gapi.client.calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: titulo,
        description: descripcion,
        start: { dateTime: start.toISOString(), timeZone: 'Europe/Madrid' },
        end: { dateTime: end.toISOString(), timeZone: 'Europe/Madrid' }
      }
    });
    return r.result;
  } catch (e) { console.error('Error creando evento:', e); return null; }
}

export async function getResumenCalendario() {
  if (!state.calConn) return 'El calendario no está conectado.';
  const hoy = await getEventosHoy();
  const semana = await getEventos(7);

  let resumen = '';

  if (hoy.length === 0) {
    resumen += 'Hoy no tienes eventos.';
  } else {
    resumen += `Hoy tienes ${hoy.length} evento${hoy.length > 1 ? 's' : ''}: `;
    resumen += hoy.map(e => {
      const s = e.start.dateTime ? new Date(e.start.dateTime) : null;
      const hora = s ? s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
      return `${e.summary}${hora ? ' a las ' + hora : ''}`;
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
    if (!state.calConn) return;
    try {
      const now = new Date();
      const in15 = new Date(now.getTime() + 16 * 60 * 1000);
      const r = await gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: in15.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 5
      });

      const eventos = r.result.items || [];
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
    } catch (e) {}
  }, 60000);
}

export async function calendarDisponible() {
  return state.calConn;
}