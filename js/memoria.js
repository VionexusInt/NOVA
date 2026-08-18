import { loadMemoriaEstructurada, setMemoria, delMemoria } from './api.js';
import { state } from './state.js';
import { esc } from './helpers.js';

const CATEGORIAS = {
  persona: { label: 'PERSONAS', icon: '👤', color: '#00d4ff' },
  proyecto: { label: 'PROYECTOS', icon: '📁', color: '#ffc200' },
  preferencia: { label: 'PREFERENCIAS', icon: '⭐', color: '#aa66ff' },
  decision: { label: 'DECISIONES', icon: '✅', color: '#00ffaa' },
  dato: { label: 'DATOS PERSONALES', icon: '📌', color: '#00d4ff' },
  habito: { label: 'HÁBITOS', icon: '🔄', color: '#ff9944' },
  contacto: { label: 'CONTACTOS', icon: '📞', color: '#ff6688' },
};

export async function abrirPanelMemoria() {
  let panel = document.getElementById('ov-memoria');
  if (!panel) crearPanelHTML();
  document.getElementById('ov-memoria').classList.add('open');
  await renderMemoria();
}

function crearPanelHTML() {
  const div = document.createElement('div');
  div.className = 'overlay';
  div.id = 'ov-memoria';
  div.innerHTML = `
    <div class="fp" style="max-width:860px;">
      <div class="fp-header">
        <div class="fp-title">🧠 MEMORIA DE NOVA</div>
        <div style="display:flex;gap:10px;align-items:center;">
          <div id="memStatus" style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--muted);"></div>
          <div class="fp-close" onclick="document.getElementById('ov-memoria').classList.remove('open')">✕ CERRAR</div>
        </div>
      </div>
      <div class="fp-body" id="memoriaBody">
        <div class="empty">Cargando memoria...</div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
        <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:140px;">
          <div class="label">CATEGORÍA</div>
          <select class="fi-sel" id="newMemCat" style="width:100%;">
            ${Object.entries(CATEGORIAS).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:140px;">
          <div class="label">CLAVE</div>
          <input class="fi" type="text" id="newMemKey" placeholder="Ej: nombre, empresa...">
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;flex:2;min-width:200px;">
          <div class="label">VALOR</div>
          <input class="fi" type="text" id="newMemVal" placeholder="Ej: Juan García, Vionexus Interactive...">
        </div>
        <button class="action-btn" id="btnAddMem" style="white-space:nowrap;padding:11px 16px;">+ AÑADIR</button>
      </div>
    </div>`;
  document.body.appendChild(div);

  div.addEventListener('click', e => { if (e.target === div) div.classList.remove('open'); });
  document.getElementById('btnAddMem').addEventListener('click', addMemoria);
  document.getElementById('newMemVal').addEventListener('keydown', e => { if (e.key === 'Enter') addMemoria(); });
}

async function renderMemoria() {
  const body = document.getElementById('memoriaBody');
  if (!body) return;

  body.innerHTML = '<div class="empty">Cargando...</div>';

  const mem = await loadMemoriaEstructurada();
  state.memEstructurada = mem;

  const total = Object.values(mem).reduce((acc, cat) => acc + Object.keys(cat).length, 0);
  const statusEl = document.getElementById('memStatus');
  if (statusEl) statusEl.textContent = `${total} dato${total !== 1 ? 's' : ''} almacenado${total !== 1 ? 's' : ''}`;

  if (total === 0) {
    body.innerHTML = `<div style="text-align:center;padding:40px 20px;">
      <div style="font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;color:var(--muted);margin-bottom:12px;">SIN DATOS EN MEMORIA</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.7;">NOVA irá aprendiendo sobre ti según habléis.<br>También puedes añadir datos manualmente abajo.</div>
    </div>`;
    return;
  }

  const html = Object.entries(CATEGORIAS)
    .filter(([cat]) => mem[cat] && Object.keys(mem[cat]).length > 0)
    .map(([cat, info]) => {
      const items = mem[cat];
      const rows = Object.entries(items).map(([clave, { valor, confianza }]) => `
        <div class="mem-row" data-cat="${esc(cat)}" data-key="${esc(clave)}">
          <div class="mem-key">${esc(clave)}</div>
          <div class="mem-val" id="mval-${esc(cat)}-${esc(clave.replace(/\s/g,'_'))}">${esc(valor)}</div>
          <div class="mem-conf" title="Confianza">${'●'.repeat(confianza)}${'○'.repeat(Math.max(0,5-confianza))}</div>
          <button class="mem-edit-btn" onclick="editarMemoria('${esc(cat)}','${esc(clave)}',this)">✏</button>
          <button class="mem-del-btn" onclick="borrarMemoria('${esc(cat)}','${esc(clave)}')">×</button>
        </div>`).join('');

      return `<div class="mem-section">
        <div class="mem-section-header" style="color:${info.color};">
          <span>${info.icon} ${info.label}</span>
          <span style="color:var(--muted);font-size:8px;">${Object.keys(items).length} dato${Object.keys(items).length !== 1 ? 's' : ''}</span>
        </div>
        <div class="mem-rows">${rows}</div>
      </div>`;
    }).join('');

  body.innerHTML = html || '<div class="empty">Sin datos</div>';
}

async function addMemoria() {
  const cat = document.getElementById('newMemCat').value;
  const key = document.getElementById('newMemKey').value.trim();
  const val = document.getElementById('newMemVal').value.trim();
  if (!key || !val) return;

  const btn = document.getElementById('btnAddMem');
  btn.textContent = '...';
  btn.disabled = true;

  await setMemoria(cat, key, val, 5);
  state.memEstructurada = await loadMemoriaEstructurada();

  document.getElementById('newMemKey').value = '';
  document.getElementById('newMemVal').value = '';
  btn.textContent = '+ AÑADIR';
  btn.disabled = false;

  await renderMemoria();
}

window.editarMemoria = async function(cat, clave, btn) {
  const valEl = document.getElementById(`mval-${cat}-${clave.replace(/\s/g,'_')}`);
  if (!valEl) return;

  if (btn.dataset.editing) {
    const input = valEl.querySelector('input');
    const nuevoValor = input ? input.value.trim() : '';
    if (nuevoValor) {
      await setMemoria(cat, clave, nuevoValor, 5);
      state.memEstructurada = await loadMemoriaEstructurada();
    }
    delete btn.dataset.editing;
    btn.textContent = '✏';
    await renderMemoria();
  } else {
    const valorActual = valEl.textContent;
    valEl.innerHTML = `<input class="fi" type="text" value="${esc(valorActual)}" style="padding:4px 8px;font-size:12px;width:100%;" onkeydown="if(event.key==='Enter')document.querySelector('[data-editing]').click()">`;
    btn.dataset.editing = '1';
    btn.textContent = '✓';
    valEl.querySelector('input')?.focus();
  }
};

window.borrarMemoria = async function(cat, clave) {
  if (!confirm(`¿Borrar "${clave}" de la memoria?`)) return;
  await delMemoria(cat, clave);
  state.memEstructurada = await loadMemoriaEstructurada();
  await renderMemoria();
};

export function initMemoriaStyles() {
  if (document.getElementById('mem-styles')) return;
  const style = document.createElement('style');
  style.id = 'mem-styles';
  style.textContent = `
    .mem-section { margin-bottom: 20px; }
    .mem-section-header {
      display:flex;justify-content:space-between;align-items:center;
      font-family:'Share Tech Mono',monospace;font-size:9px;letter-spacing:3px;
      padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:8px;
    }
    .mem-rows { display:flex;flex-direction:column;gap:4px; }
    .mem-row {
      display:grid;grid-template-columns:1fr 2fr auto auto auto;
      align-items:center;gap:10px;
      padding:9px 12px;
      background:rgba(0,6,16,0.5);border:1px solid var(--border);border-radius:2px;
      transition:border-color .2s;
    }
    .mem-row:hover { border-color:var(--border2); }
    .mem-key {
      font-family:'Share Tech Mono',monospace;font-size:9px;
      letter-spacing:1px;color:var(--arc);
    }
    .mem-val { font-size:12px;color:var(--text); }
    .mem-conf {
      font-size:8px;color:var(--muted);letter-spacing:-1px;
      white-space:nowrap;
    }
    .mem-edit-btn, .mem-del-btn {
      background:transparent;border:1px solid var(--border);
      color:var(--muted);cursor:pointer;
      padding:3px 7px;border-radius:2px;font-size:11px;
      transition:all .2s;
    }
    .mem-edit-btn:hover { color:var(--arc);border-color:var(--arc); }
    .mem-del-btn:hover { color:var(--red);border-color:var(--red); }
  `;
  document.head.appendChild(style);
}