import { state } from './state.js';
import { addMsg } from './chat.js';
import { setOrb, setTargetLevel } from './orb.js';
import { speak } from './audio.js';
import { groqChat } from './api.js';

const NVIDIA_KEY = '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';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const CODE_MODEL = 'qwen/qwen3-coder-480b-a35b-instruct';

let modoProgramacion = false;
let historialCodigo = [];
let proyectoContexto = '';

const SYS_CODER = `Eres NOVA en modo programación — un pair programmer experto estilo JARVIS.
Eres extremadamente técnico, preciso y eficiente. Sin explicaciones innecesarias.
Lenguajes: JavaScript, Python, TypeScript, HTML, CSS, SQL, y cualquier otro.
Cuando des código: siempre en bloques de código con el lenguaje especificado.
Cuando detectes bugs: explica el problema en 1 frase y da el fix directo.
Cuando revises código: señala problemas críticos primero, luego mejoras opcionales.
Hablas en español de España pero el código siempre en inglés.
Si el usuario pega código, analizalo automáticamente sin que te lo pida.`;

async function llamarNvidia(messages) {
  const r = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + NVIDIA_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      model: CODE_MODEL,
      max_tokens: 4096,
      temperature: 0.2,
      messages
    })
  });

  if (!r.ok) {
    const fallback = await groqChat(messages, 'openai/gpt-oss-20b', 2000);
    return fallback;
  }

  const d = await r.json();
  return d.choices[0].message.content;
}

export function activarModoProgramacion() {
  modoProgramacion = true;
  historialCodigo = [];
  window._novaModoProgamacion = true;

  mostrarIndicadorCodigo(true);
  addMsg('nova', 'Modo programación activo. Usando Qwen3 Coder 480B. Pega código o describe qué quieres construir.');

  if (state.audioOn) speak('Modo programación activo.');
  setTargetLevel(0.5);
}

export function desactivarModoProgramacion() {
  modoProgramacion = false;
  historialCodigo = [];
  proyectoContexto = '';
  window._novaModoProgamacion = false;
  mostrarIndicadorCodigo(false);
  addMsg('nova', 'Modo programación desactivado.');
}

export function esModoProgamacion() {
  return modoProgramacion;
}

export async function procesarCodigoConNova(texto) {
  setOrb('thinking');
  setTargetLevel(0.6);

  const messages = [
    { role: 'system', content: SYS_CODER + (proyectoContexto ? '\n\nCONTEXTO DEL PROYECTO:\n' + proyectoContexto : '') },
    ...historialCodigo.slice(-20),
    { role: 'user', content: texto }
  ];

  try {
    const respuesta = await llamarNvidia(messages);

    historialCodigo.push({ role: 'user', content: texto });
    historialCodigo.push({ role: 'assistant', content: respuesta });

    rmTypingCodigo();
    mostrarRespuestaCodigo(respuesta);

    setOrb('idle');
    setTargetLevel(0);

  } catch (e) {
    rmTypingCodigo();
    addMsg('nova', '⚠ Error en modo programación: ' + e.message);
    setOrb('idle');
    setTargetLevel(0);
  }
}

function mostrarRespuestaCodigo(texto) {
  const d = document.getElementById('display');
  if (!d) { addMsg('nova', texto); return; }

  const ph = document.getElementById('ph');
  if (ph) ph.remove();

  const el = document.createElement('div');
  el.className = 'msg';

  const partes = texto.split(/(```[\s\S]*?```)/g);
  let htmlContent = '<div class="mw nova">// N.O.V.A — CÓDIGO</div>';

  partes.forEach(parte => {
    if (parte.startsWith('```')) {
      const lines = parte.split('\n');
      const lang = lines[0].replace('```', '').trim() || 'code';
      const code = lines.slice(1, -1).join('\n');
      htmlContent += `<div class="code-block">
        <div class="code-header">
          <span class="code-lang">${lang.toUpperCase()}</span>
          <button class="code-copy-btn" onclick="navigator.clipboard.writeText(this.dataset.code).then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='COPIAR',2000)})" data-code="${code.replace(/"/g, '&quot;')}">COPIAR</button>
        </div>
        <pre class="code-content"><code>${escapeHtml(code)}</code></pre>
      </div>`;
    } else if (parte.trim()) {
      htmlContent += `<div class="mt nova" style="margin-bottom:8px;">${parte.trim().replace(/\n/g, '<br>')}</div>`;
    }
  });

  el.innerHTML = htmlContent;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function showTypingCodigo() {
  const d = document.getElementById('display');
  if (!d) return;
  const el = document.createElement('div');
  el.className = 'msg typing-indicator-msg'; el.id = 'typing-code';
  el.innerHTML = '<div class="mw nova">// N.O.V.A — ANALIZANDO CÓDIGO</div><div class="typing"><span></span><span></span><span></span></div>';
  d.appendChild(el); d.scrollTop = d.scrollHeight;
}

function rmTypingCodigo() {
  document.querySelectorAll('#typing-code').forEach(e => e.remove());
}

export function setProyectoContexto(ctx) {
  proyectoContexto = ctx;
  addMsg('nova', `Contexto del proyecto registrado: ${ctx.substring(0, 100)}${ctx.length > 100 ? '...' : ''}`);
}

function mostrarIndicadorCodigo(activo) {
  let ind = document.getElementById('code-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.id = 'code-indicator';
    ind.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);font-family:Share Tech Mono,monospace;font-size:9px;letter-spacing:3px;color:#aa66ff;background:rgba(170,102,255,0.08);border:1px solid rgba(170,102,255,0.3);border-radius:2px;padding:5px 16px;z-index:999;transition:opacity .3s;';
    document.body.appendChild(ind);
  }
  if (activo) {
    ind.textContent = '⬤ MODO PROGRAMACIÓN — Qwen3 Coder 480B — Di "salir código" para desactivar';
    ind.style.opacity = '1'; ind.style.display = 'block';
  } else {
    ind.style.opacity = '0';
    setTimeout(() => { if (ind) ind.style.display = 'none'; }, 300);
  }
}

export function initCodeStyles() {
  if (document.getElementById('code-styles')) return;
  const style = document.createElement('style');
  style.id = 'code-styles';
  style.textContent = `
    .code-block {
      margin: 8px 0;
      border: 1px solid rgba(170,102,255,0.2);
      border-radius: 3px;
      overflow: hidden;
      background: rgba(0,0,8,0.9);
    }
    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: rgba(170,102,255,0.08);
      border-bottom: 1px solid rgba(170,102,255,0.15);
    }
    .code-lang {
      font-family: 'Share Tech Mono', monospace;
      font-size: 8px;
      letter-spacing: 2px;
      color: #aa66ff;
    }
    .code-copy-btn {
      font-family: 'Share Tech Mono', monospace;
      font-size: 7px;
      letter-spacing: 1px;
      color: rgba(170,102,255,0.7);
      background: transparent;
      border: 1px solid rgba(170,102,255,0.2);
      border-radius: 2px;
      padding: 3px 8px;
      cursor: pointer;
      transition: all .2s;
    }
    .code-copy-btn:hover { background: rgba(170,102,255,0.15); color: #aa66ff; }
    .code-content {
      padding: 14px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #c8f0ff;
      overflow-x: auto;
      margin: 0;
      white-space: pre;
    }
    .code-content::-webkit-scrollbar { height: 3px; }
    .code-content::-webkit-scrollbar-thumb { background: rgba(170,102,255,0.3); }
  `;
  document.head.appendChild(style);
}