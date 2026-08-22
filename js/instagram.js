import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak, speakAndWait } from './audio.js';
import { groqChat } from './api.js';

const IG_API = 'https://graph.facebook.com/v26.0';
const IG_BUSINESS_ID = '17841422210669628';
const PAGE_ID = '1324101144112344';
const PAGE_TOKEN = 'EAAUIRcqEfuoBSWZA3h7ZA9ITdBLqpRVv52GulyzYhA0VFXjcMtHSZC5xnNwQc7ZBB2HE7zUNzH8idQvcNTpEZAsPHeaUuNjwvCixo06mRTPayyRjTYxyUBBsKe1DKMx0kRNZClC7IbnhT0txZCsLECSlsaTaeYYZCDkF9PZBZBqOdvCUHNKN9IfK6qpwoTotAZCEJxFkcTdomEI';

async function igFetch(path, options = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`${IG_API}${path}${sep}access_token=${PAGE_TOKEN}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Instagram API ${r.status}: ${body.substring(0, 200)}`);
  }
  return r.json();
}

export async function getInsights() {
  try {
    const d = await igFetch(`/${IG_BUSINESS_ID}?fields=followers_count,media_count,website,biography,username`);
    return d;
  } catch(e) { console.warn('getInsights:', e.message); return null; }
}

export async function getUltimasPublicaciones(limit = 5) {
  try {
    const d = await igFetch(`/${IG_BUSINESS_ID}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,permalink&limit=${limit}`);
    return d.items || d.data || [];
  } catch(e) { console.warn('getUltimasPublicaciones:', e.message); return []; }
}

export async function getComentariosSinResponder() {
  try {
    const posts = await getUltimasPublicaciones(10);
    const sinResponder = [];
    for (const post of posts.slice(0, 5)) {
      try {
        const d = await igFetch(`/${post.id}/comments?fields=id,text,username,timestamp,replies{text}`);
        const comentarios = d.data || [];
        const pendientes = comentarios.filter(c => !c.replies?.data?.length);
        if (pendientes.length > 0) sinResponder.push({ post: post.permalink, comentarios: pendientes });
      } catch(e) {}
    }
    return sinResponder;
  } catch(e) { console.warn('getComentariosSinResponder:', e.message); return []; }
}

export async function responderComentario(comentarioId, texto) {
  try {
    await igFetch(`/${comentarioId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ message: texto })
    });
    return true;
  } catch(e) { console.error('responderComentario:', e.message); return false; }
}

export async function publicarPost(imagenUrl, caption) {
  try {
    const container = await igFetch(`/${IG_BUSINESS_ID}/media`, {
      method: 'POST',
      body: JSON.stringify({ image_url: imagenUrl, caption })
    });
    if (!container.id) throw new Error('No se creó el container');
    await new Promise(r => setTimeout(r, 3000));
    const resultado = await igFetch(`/${IG_BUSINESS_ID}/media_publish`, {
      method: 'POST',
      body: JSON.stringify({ creation_id: container.id })
    });
    return resultado;
  } catch(e) { console.error('publicarPost:', e.message); return null; }
}

export async function resumenInstagram() {
  const insights = await getInsights();
  if (!insights) return null;
  return `@bajateapp: ${insights.followers_count || '?'} seguidores, ${insights.media_count || '?'} publicaciones.`;
}

export async function verEstadoInstagram() {
  addMsg('nova', '📊 Consultando @bajateapp...');
  try {
    const [insights, posts, comentarios] = await Promise.all([
      getInsights(),
      getUltimasPublicaciones(3),
      getComentariosSinResponder()
    ]);

    initInstagramStyles();
    const d = document.getElementById('display');
    if (d) {
      const el = document.createElement('div');
      el.className = 'msg';
      el.innerHTML = `
        <div class="mw nova">// N.O.V.A — INSTAGRAM · @bajateapp</div>
        <div class="ig-card">
          <div class="ig-stats">
            <div class="ig-stat">
              <div class="ig-stat-num">${insights?.followers_count || '—'}</div>
              <div class="ig-stat-label">seguidores</div>
            </div>
            <div class="ig-stat">
              <div class="ig-stat-num">${insights?.media_count || '—'}</div>
              <div class="ig-stat-label">posts</div>
            </div>
            <div class="ig-stat">
              <div class="ig-stat-num">${comentarios.reduce((a,p) => a + p.comentarios.length, 0)}</div>
              <div class="ig-stat-label">comentarios sin responder</div>
            </div>
          </div>
          ${posts.length > 0 ? `
          <div class="ig-section-label">últimas publicaciones</div>
          ${posts.map(p => `
            <div class="ig-post" onclick="window.open('${p.permalink}','_blank')">
              <div class="ig-post-meta">${new Date(p.timestamp).toLocaleDateString('es-ES')} · ❤️ ${p.like_count || 0} · 💬 ${p.comments_count || 0}</div>
              <div class="ig-post-caption">${escHtml((p.caption || 'Sin caption').substring(0, 100))}</div>
            </div>
          `).join('')}` : ''}
          ${comentarios.length > 0 ? `
          <div class="ig-section-label" style="color:rgba(230,150,90,0.7);">⚠ comentarios pendientes de respuesta</div>
          ${comentarios.slice(0,3).map(p => p.comentarios.slice(0,2).map(c => `
            <div class="ig-comment">
              <span class="ig-comment-user">@${escHtml(c.username)}</span>
              <span class="ig-comment-text">${escHtml(c.text?.substring(0,80))}</span>
            </div>
          `).join('')).join('')}` : ''}
        </div>`;
      d.appendChild(el);
      d.scrollTop = d.scrollHeight;
    }

    const seguidores = insights?.followers_count || 'desconocidos';
    const pendientes = comentarios.reduce((a,p) => a + p.comentarios.length, 0);
    const msg = `@bajateapp tiene ${seguidores} seguidores.${pendientes > 0 ? ` Hay ${pendientes} comentario${pendientes > 1 ? 's' : ''} sin responder.` : ' Sin comentarios pendientes.'}`;
    addMsg('nova', msg);
    if (state.audioOn) speak(msg);

  } catch(e) {
    addMsg('nova', '⚠ No pude consultar Instagram: ' + e.message);
  }
}

export async function generarIdeasContenido(contexto = '') {
  addMsg('nova', '💡 Generando ideas de contenido para @bajateapp...');
  try {
    const insights = await getInsights();
    const seguidores = insights?.followers_count || 'desconocidos';

    const raw = await groqChat([{
      role: 'user',
      content: `Eres el community manager de @bajateapp, una app de planes para salir en Elche/Alicante, para jóvenes de 16-28 años. Tiene ${seguidores} seguidores.
${contexto ? 'Contexto adicional: ' + contexto : ''}
Dame 5 ideas de contenido para Instagram esta semana. Para cada una indica:
- Formato (Reel, Story, Carrusel, Post)
- Idea concreta del contenido
- Caption sugerido con emojis

Enfócate en contenido hiperlocal de Elche/Alicante que conecte con jóvenes que quieren salir.`
    }], 'openai/gpt-oss-120b', 600);

    initInstagramStyles();
    const d = document.getElementById('display');
    if (d) {
      const el = document.createElement('div');
      el.className = 'msg';
      el.innerHTML = `
        <div class="mw nova">// N.O.V.A — IDEAS CONTENIDO · @bajateapp</div>
        <div class="ig-card ig-ideas">
          <div class="ig-ideas-texto">${escHtml(raw).replace(/\n/g, '<br>')}</div>
        </div>`;
      d.appendChild(el);
      d.scrollTop = d.scrollHeight;
    }

    if (state.audioOn) speak('Ideas de contenido generadas. Las tienes en pantalla.');
  } catch(e) {
    addMsg('nova', '⚠ Error generando ideas: ' + e.message);
  }
}

function escHtml(t) {
  return String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export function initInstagramStyles() {
  if (document.getElementById('ig-styles')) return;
  const s = document.createElement('style');
  s.id = 'ig-styles';
  s.textContent = `
    .ig-card { border:1px solid rgba(74,158,255,0.18); border-radius:4px; overflow:hidden; margin-top:6px; background:rgba(0,4,14,0.85); max-width:560px; }
    .ig-stats { display:flex; border-bottom:1px solid rgba(74,158,255,0.1); }
    .ig-stat { flex:1; padding:14px; text-align:center; border-right:1px solid rgba(74,158,255,0.06); }
    .ig-stat:last-child { border-right:none; }
    .ig-stat-num { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:rgba(235,242,255,0.92); }
    .ig-stat-label { font-family:'DM Mono',monospace; font-size:7px; letter-spacing:0.15em; text-transform:uppercase; color:rgba(140,175,220,0.5); margin-top:3px; }
    .ig-section-label { font-family:'DM Mono',monospace; font-size:7px; letter-spacing:0.2em; text-transform:uppercase; color:rgba(74,158,255,0.5); padding:12px 16px 6px; }
    .ig-post { padding:10px 16px; border-bottom:1px solid rgba(74,158,255,0.06); cursor:pointer; transition:background 0.2s; }
    .ig-post:hover { background:rgba(74,158,255,0.04); }
    .ig-post-meta { font-family:'DM Mono',monospace; font-size:9px; color:rgba(140,175,220,0.5); margin-bottom:4px; }
    .ig-post-caption { font-family:'Fraunces',serif; font-size:13px; color:rgba(215,228,248,0.85); line-height:1.5; }
    .ig-comment { display:flex; gap:10px; padding:8px 16px; border-bottom:1px solid rgba(74,158,255,0.04); align-items:baseline; }
    .ig-comment-user { font-family:'DM Mono',monospace; font-size:9px; color:rgba(74,158,255,0.6); white-space:nowrap; }
    .ig-comment-text { font-family:'Fraunces',serif; font-size:12px; color:rgba(200,218,245,0.75); }
    .ig-ideas { padding:16px; }
    .ig-ideas-texto { font-family:'Fraunces',serif; font-size:13px; line-height:1.8; color:rgba(215,228,248,0.88); }
  `;
  document.head.appendChild(s);
}