import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak, speakAndWait } from './audio.js';
import { groqChat } from './api.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TOKEN_KEY = 'nova_gmail_token';
let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let gisLoaded = false;

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
  if (gisLoaded || window.google?.accounts?.oauth2) { gisLoaded = true; return; }
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No se pudo cargar GIS'));
    document.head.appendChild(script);
  });
  gisLoaded = true;
}

export async function initGmail() {
  if (cargarTokenGuardado() && tokenValido()) {
    state.gmailConn = true;
    return true;
  }
  try {
    await cargarGIS();
    const { GCAL_ID } = await import('./config.js');
    await new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GCAL_ID,
        scope: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/gmail.modify'
        ].join(' '),
        callback: (r) => {
          if (r.error) { reject(new Error(r.error)); return; }
          guardarToken(r.access_token, r.expires_in || 3600);
          resolve();
        },
        error_callback: (e) => reject(new Error(e.type || 'Error auth Gmail'))
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
    state.gmailConn = true;
    return true;
  } catch(e) {
    state.gmailConn = false;
    console.warn('Gmail auth error:', e.message);
    return false;
  }
}

async function gmailFetch(path, options = {}) {
  if (!tokenValido()) {
    state.gmailConn = false;
    throw new Error('Token de Gmail expirado. Di "conecta Gmail" para reconectar.');
  }
  const r = await fetch(`${GMAIL_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });
  if (r.status === 401) { accessToken = null; state.gmailConn = false; throw new Error('Sesión Gmail expirada.'); }
  if (!r.ok) throw new Error(`Gmail API ${r.status}`);
  return r.json();
}

function decodeBase64(str) {
  try {
    return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch(e) { return ''; }
}

function extraerCuerpo(payload) {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64(part.body.data);
    }
    for (const part of payload.parts) {
      const sub = extraerCuerpo(part);
      if (sub) return sub;
    }
  }
  return '';
}

function getHeader(headers, name) {
  return headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

export async function getEmailsNoLeidos(maxResults = 10) {
  if (!state.gmailConn) return [];
  try {
    const lista = await gmailFetch(`/messages?q=is:unread&maxResults=${maxResults}`);
    if (!lista.messages?.length) return [];
    const emails = await Promise.all(
      lista.messages.slice(0, maxResults).map(async m => {
        try {
          const msg = await gmailFetch(`/messages/${m.id}?format=full`);
          const headers = msg.payload?.headers || [];
          return {
            id: m.id,
            threadId: m.threadId,
            de: getHeader(headers, 'From'),
            asunto: getHeader(headers, 'Subject'),
            fecha: getHeader(headers, 'Date'),
            cuerpo: extraerCuerpo(msg.payload).substring(0, 800),
            snippet: msg.snippet || '',
          };
        } catch(e) { return null; }
      })
    );
    return emails.filter(Boolean);
  } catch(e) { console.warn('getEmailsNoLeidos:', e.message); return []; }
}

export async function resumenEmailsUrgentes() {
  if (!state.gmailConn) return null;
  try {
    const emails = await getEmailsNoLeidos(15);
    if (emails.length === 0) return null;

    const lista = emails.slice(0, 8).map(e =>
      `De: ${e.de} | Asunto: ${e.asunto} | Snippet: ${e.snippet.substring(0, 100)}`
    ).join('\n');

    return await groqChat([{
      role: 'user',
      content: `Tienes ${emails.length} emails sin leer. Estos son los más recientes:\n${lista}\n\nEn 1-2 frases en español, di si hay algo urgente o importante que requiera atención inmediata. Si no hay nada urgente, di simplemente que el correo está tranquilo.`
    }], 'openai/gpt-oss-20b', 100);
  } catch(e) { return null; }
}

export async function leerEmailsRecientes() {
  if (!state.gmailConn) {
    addMsg('nova', 'Gmail no conectado. Di "conecta Gmail" para autorizarlo.');
    return;
  }
  addMsg('nova', '📧 Consultando bandeja de entrada...');
  const emails = await getEmailsNoLeidos(5);
  if (emails.length === 0) {
    const msg = 'No tienes emails sin leer.';
    addMsg('nova', msg);
    if (state.audioOn) speak(msg);
    return;
  }

  mostrarEmailsUI(emails);

  const resumen = await groqChat([{
    role: 'user',
    content: `Tienes ${emails.length} emails sin leer. Asuntos: ${emails.map(e => e.asunto).join(', ')}. Resume en 1 frase qué tienes pendiente.`
  }], 'openai/gpt-oss-20b', 80);

  addMsg('nova', resumen);
  if (state.audioOn) speak(resumen);
}

export async function leerEmail(indice = 0) {
  if (!state.gmailConn) return;
  const emails = await getEmailsNoLeidos(10);
  if (!emails[indice]) { addMsg('nova', 'No encontré ese email.'); return; }
  const e = emails[indice];
  const resumen = await groqChat([{
    role: 'user',
    content: `Resume este email en 2-3 frases en español:\nDe: ${e.de}\nAsunto: ${e.asunto}\nContenido: ${e.cuerpo.substring(0, 600)}`
  }], 'openai/gpt-oss-20b', 120);
  addMsg('nova', `📧 ${e.asunto} — ${resumen}`);
  if (state.audioOn) await speakAndWait(resumen);
}

export async function responderEmail(emailId, cuerpoRespuesta) {
  if (!state.gmailConn) return false;
  try {
    const msg = await gmailFetch(`/messages/${emailId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-Id`);
    const headers = msg.payload?.headers || [];
    const asunto = getHeader(headers, 'Subject');
    const de = getHeader(headers, 'From');
    const messageId = getHeader(headers, 'Message-Id');
    const emailTo = de.match(/<(.+)>/) ? de.match(/<(.+)>/)[1] : de;

    const meInfo = await gmailFetch('/profile');
    const miFetch = meInfo.emailAddress;

    const rawEmail = [
      `From: ${miFetch}`,
      `To: ${emailTo}`,
      `Subject: Re: ${asunto.startsWith('Re:') ? asunto : 'Re: ' + asunto}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      cuerpoRespuesta
    ].join('\r\n');

    const encoded = btoa(unescape(encodeURIComponent(rawEmail))).replace(/\+/g, '-').replace(/\//g, '_');

    await gmailFetch(`/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ raw: encoded, threadId: msg.threadId })
    });

    return true;
  } catch(e) {
    console.error('Error respondiendo email:', e);
    return false;
  }
}

export async function redactarEmail(para, asunto, cuerpo) {
  if (!state.gmailConn) return false;
  try {
    const meInfo = await gmailFetch('/profile');
    const rawEmail = [
      `From: ${meInfo.emailAddress}`,
      `To: ${para}`,
      `Subject: ${asunto}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      cuerpo
    ].join('\r\n');

    const encoded = btoa(unescape(encodeURIComponent(rawEmail))).replace(/\+/g, '-').replace(/\//g, '_');
    await gmailFetch(`/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ raw: encoded })
    });
    return true;
  } catch(e) {
    console.error('Error enviando email:', e);
    return false;
  }
}

export async function redactarConIA(instruccion, contexto = '') {
  if (!state.gmailConn) {
    addMsg('nova', 'Gmail no conectado. Di "conecta Gmail" para autorizarlo.');
    return;
  }
  addMsg('nova', '✍️ Redactando el email...');
  try {
    const raw = await groqChat([{
      role: 'system',
      content: `Eres NOVA, asistente de Andrés. Redactas emails profesionales en español de España. Formato:\nPARA: email@destino.com\nASUNTO: Asunto del email\nCUERPO:\n[El cuerpo del email]\n\nSi no sabes el email del destinatario, pon PARA: [especificar]\nSé conciso y profesional.`
    }, {
      role: 'user',
      content: instruccion + (contexto ? '\nContexto adicional: ' + contexto : '')
    }], 'openai/gpt-oss-20b', 400);

    const paraMatch = raw.match(/PARA:\s*(.+)/i);
    const asuntoMatch = raw.match(/ASUNTO:\s*(.+)/i);
    const cuerpoMatch = raw.match(/CUERPO:\s*([\s\S]+)/i);

    const para = paraMatch?.[1]?.trim() || '';
    const asunto = asuntoMatch?.[1]?.trim() || 'Sin asunto';
    const cuerpo = cuerpoMatch?.[1]?.trim() || raw;

    mostrarBorradorUI(para, asunto, cuerpo);
  } catch(e) {
    addMsg('nova', '⚠ No pude redactar el email: ' + e.message);
  }
}

function mostrarEmailsUI(emails) {
  initGmailStyles();
  const d = document.getElementById('display');
  if (!d) return;
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = `
    <div class="mw nova">// N.O.V.A — GMAIL · ${emails.length} sin leer</div>
    <div class="gmail-card">
      ${emails.slice(0, 5).map((e) => `
        <div class="gmail-item" onclick="window.open('https://mail.google.com/mail/#inbox/${e.id}','_blank')">
          <div class="gmail-de">${escHtml(e.de.replace(/<.*>/, '').trim() || e.de)}</div>
          <div class="gmail-asunto">${escHtml(e.asunto)}</div>
          <div class="gmail-snippet">${escHtml(e.snippet)}</div>
          <div class="gmail-abrir">abrir en Gmail →</div>
        </div>
      `).join('')}
    </div>`;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

function mostrarBorradorUI(para, asunto, cuerpo) {
  // Abrir Gmail directamente con el compose pre-rellenado — nada de ventanas en el chat
  const params = new URLSearchParams();
  if (para && !para.includes('[')) params.set('to', para);
  if (asunto) params.set('su', asunto);
  if (cuerpo) params.set('body', cuerpo);
  const url = `https://mail.google.com/mail/?view=cm&${params.toString()}`;
  window.open(url, '_blank');
  addMsg('nova', `He abierto Gmail con el borrador preparado.${para && !para.includes('[') ? ' Para: ' + para + '.' : ' Completa el destinatario.'}`);
  if (state.audioOn) speak('Borrador preparado en Gmail.');
}

function escHtml(t) {
  return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').substring(0,200);
}

export function gmailDisponible() { return state.gmailConn && tokenValido(); }

export function initGmailStyles() {
  if (document.getElementById('gmail-styles')) return;
  const s = document.createElement('style');
  s.id = 'gmail-styles';
  s.textContent = `
    .gmail-card { border:1px solid rgba(74,158,255,0.18); border-radius:4px; overflow:hidden; margin-top:6px; background:rgba(0,4,14,0.85); max-width:560px; }
    .gmail-item { padding:12px 16px; border-bottom:1px solid rgba(74,158,255,0.08); cursor:pointer; transition:background 0.2s; }
    .gmail-item:hover { background:rgba(74,158,255,0.05); }
    .gmail-item:last-child { border-bottom:none; }
    .gmail-de { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:0.1em; color:rgba(74,158,255,0.6); margin-bottom:3px; }
    .gmail-asunto { font-family:'Fraunces',serif; font-size:13px; font-weight:400; color:rgba(235,242,255,0.92); margin-bottom:4px; }
    .gmail-snippet { font-size:11px; font-weight:300; color:rgba(160,190,230,0.55); line-height:1.5; }
    .gmail-abrir { font-family:'DM Mono',monospace; font-size:8px; letter-spacing:0.15em; color:rgba(74,158,255,0.4); margin-top:4px; }
    .gmail-item:hover .gmail-abrir { color:rgba(74,158,255,0.7); }
    .gmail-borrador { padding:16px; }
    .gmail-borrador-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
    .gmail-label { font-family:'DM Mono',monospace; font-size:9px; letter-spacing:0.15em; color:rgba(74,158,255,0.5); min-width:48px; }
    .gmail-input { flex:1; background:rgba(74,158,255,0.04); border:1px solid rgba(74,158,255,0.15); border-radius:3px; padding:7px 10px; color:rgba(235,242,255,0.9); font-family:'DM Mono',monospace; font-size:11px; outline:none; }
    .gmail-input:focus { border-color:rgba(74,158,255,0.35); background:rgba(74,158,255,0.08); }
    .gmail-textarea { width:100%; min-height:140px; background:rgba(74,158,255,0.04); border:1px solid rgba(74,158,255,0.15); border-radius:3px; padding:10px; color:rgba(235,242,255,0.88); font-family:'Fraunces',serif; font-size:13px; font-weight:300; line-height:1.7; outline:none; resize:vertical; margin-bottom:12px; box-sizing:border-box; }
    .gmail-textarea:focus { border-color:rgba(74,158,255,0.35); }
    .gmail-acciones { display:flex; gap:8px; }
    .gmail-btn { font-family:'DM Mono',monospace; font-size:8px; letter-spacing:0.2em; text-transform:uppercase; padding:8px 16px; border-radius:2px; cursor:pointer; border:1px solid; background:transparent; transition:all 0.2s; }
    .gmail-btn.enviar { color:rgba(82,214,138,0.8); border-color:rgba(82,214,138,0.3); }
    .gmail-btn.enviar:hover { background:rgba(82,214,138,0.08); }
    .gmail-btn.cancelar { color:rgba(232,112,112,0.7); border-color:rgba(232,112,112,0.25); }
    .gmail-btn.cancelar:hover { background:rgba(232,112,112,0.06); }
    .gmail-ok { font-family:'DM Mono',monospace; font-size:9px; color:rgba(82,214,138,0.7); padding:12px; }
    .gmail-err { font-family:'DM Mono',monospace; font-size:9px; color:rgba(232,112,112,0.7); padding:12px; }
  `;
  document.head.appendChild(s);
}