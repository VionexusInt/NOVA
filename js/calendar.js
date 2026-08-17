import { GCAL_ID } from './config.js';
import { esc } from './helpers.js';
import { state } from './state.js';

export async function initCalendar() {
  if (state.calConn) return;
  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/api.js';
  script.onload = () => {
    gapi.load('client:auth2', () => {
      gapi.client.init({
        clientId: GCAL_ID,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest']
      }).then(() => {
        if (gapi.auth2.getAuthInstance().isSignedIn.get()) loadCalEvents();
        else gapi.auth2.getAuthInstance().signIn().then(loadCalEvents).catch(err => {
          document.getElementById('calSetup').innerHTML = `<p style="color:var(--red);font-size:13px;">Conexión cancelada</p>`;
        });
      }).catch(e => {
        document.getElementById('calSetup').innerHTML = `<p style="color:var(--red);font-size:13px;">Error: ${esc(e.error || e.message)}</p>`;
      });
    });
  };
  document.head.appendChild(script);
}

export async function loadCalEvents() {
  state.calConn = true;
  document.getElementById('calSetup').style.display = 'none';
  const evEl = document.getElementById('calEvents');
  evEl.style.display = 'block';
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  try {
    const r = await gapi.client.calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20
    });
    const evs = r.result.items;
    evEl.innerHTML = evs.length === 0
      ? '<div class="empty">// SIN EVENTOS PRÓXIMOS //</div>'
      : evs.map(e => {
          const s = e.start.dateTime ? new Date(e.start.dateTime) : new Date(e.start.date);
          const ts = e.start.dateTime
            ? s.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + s.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
            : s.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
          return `<div class="cal-ev"><div class="cal-time">${esc(ts)}</div><div><div class="cal-name">${esc(e.summary || 'Sin título')}</div>${e.location ? `<div class="cal-desc">📍 ${esc(e.location)}</div>` : ''}</div></div>`;
        }).join('');
  } catch (e) {
    evEl.innerHTML = '<div class="empty">// Error cargando eventos //</div>';
  }
}