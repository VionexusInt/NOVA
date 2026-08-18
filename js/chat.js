import { state } from './state.js';
import { esc } from './helpers.js';
import { saveMsg, updateMem, groqChat } from './api.js';
import { setOrb, setTargetLevel } from './orb.js';
import { speak } from './audio.js';
import { detectPanel } from './paneles.js';
import { activarModoDespertar } from './wake.js';

const SYS = `Eres NOVA, sistema de inteligencia artificial personal.
Estilo JARVIS de Iron Man: frases cortas, precisas, frías pero no hostiles. Sin muletillas.
Español de España. Máximo 2-3 frases salvo que pidan más detalle.
No tienes acceso a internet en tiempo real. Si te preguntan por el clima, noticias o datos actuales, responde que no puedes acceder a esa información en este momento.
Cuando el usuario pida tareas, emails, agenda, briefing o marketing, confírmalo brevemente.`;

export function addMsg(role, text) {
  const d = document.getElementById('display');
  const ph = document.getElementById('ph');
  if (ph) ph.remove();
  const el = document.createElement('div');
  el.className = 'msg';
  const safeText = esc(text);
  const safeRole = role === 'user' ? '// TÚ' : '// N.O.V.A';
  const cls = role === 'user' ? 'user' : 'nova';
  el.innerHTML = `<div class="mw ${cls}">${safeRole}</div><div class="mt ${cls}">${safeText}</div>`;
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

export function showTyping() {
  const d = document.getElementById('display');
  const el = document.createElement('div');
  el.className = 'msg';
  el.id = 'typing';
  el.innerHTML = '<div class="mw nova">// N.O.V.A</div><div class="typing"><span></span><span></span><span></span></div>';
  d.appendChild(el);
  d.scrollTop = d.scrollHeight;
}

export function rmTyping() {
  const e = document.getElementById('typing');
  if (e) e.remove();
}

export async function askNova(text) {
  const normalized = text.toLowerCase().trim();
  if (/\b(despierta|despiértate|activar|enciéndete|enciende|wake up|despierta nova)\b/.test(normalized)) {
    await activarModoDespertar();
    return;
  }
  detectPanel(text);
  addMsg('user', text);
  state.hist.push({ role: 'user', content: text });
  await saveMsg('user', text);
  state.msgN++;
  setOrb('thinking');
  showTyping();
  setTargetLevel(0.45);
  try {
    const sysFull = SYS + (state.mem ? '\n\nSABES DEL USUARIO:\n' + state.mem : '');
    const reply = await groqChat(
      [{ role: 'system', content: sysFull }, ...state.hist.slice(-30)],
      'openai/gpt-oss-20b',
      800
    );
    state.hist.push({ role: 'assistant', content: reply });
    await saveMsg('assistant', reply);
    state.msgN++;
    if (state.msgN % 20 === 0) state.mem = await updateMem(state.hist);
    rmTyping();
    addMsg('nova', reply);
    setOrb('speaking');
    if (state.audioOn) {
      state.lastSpokenText = reply;
      speak(reply);
    } else {
      setOrb('idle');
      setTargetLevel(0);
    }
  } catch (e) {
    rmTyping();
    setOrb('idle');
    setTargetLevel(0);
    addMsg('nova', '⚠ ' + esc(e.message));
  }
}

export function sendText() {
  const i = document.getElementById('txtIn');
  const t = i.value.trim();
  if (!t) return;
  i.value = '';
  askNova(t);
}

export async function clearHistory() {
  if (!confirm('¿Borrar todo el historial?')) return;
  try {
    await fetch('https://ufmlofblsepronbyzish.supabase.co/rest/v1/mensajes?id=gt.0', {
      method: 'DELETE',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWxvZmJsc2Vwcm9uYnl6aXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjEzMjAsImV4cCI6MjEwMjUzNzMyMH0.ACFsSthcARANk8zyfeRZiQLeHawVvOAr0cqAzjsZ-1A',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWxvZmJsc2Vwcm9uYnl6aXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjEzMjAsImV4cCI6MjEwMjUzNzMyMH0.ACFsSthcARANk8zyfeRZiQLeHawVvOAr0cqAzjsZ-1A'
      }
    });
    await fetch('https://ufmlofblsepronbyzish.supabase.co/rest/v1/memoria?id=eq.1', {
      method: 'PATCH',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWxvZmJsc2Vwcm9uYnl6aXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjEzMjAsImV4cCI6MjEwMjUzNzMyMH0.ACFsSthcARANk8zyfeRZiQLeHawVvOAr0cqAzjsZ-1A',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbWxvZmJsc2Vwcm9uYnl6aXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NjEzMjAsImV4cCI6MjEwMjUzNzMyMH0.ACFsSthcARANk8zyfeRZiQLeHawVvOAr0cqAzjsZ-1A',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ resumen: '' })
    });
  } catch (e) {}
  state.hist = [];
  state.mem = '';
  state.msgN = 0;
  document.getElementById('display').innerHTML = '<div class="empty">// HISTORIAL BORRADO //</div>';
  addMsg('nova', 'Historial eliminado.');
}