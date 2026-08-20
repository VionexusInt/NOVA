import { state } from './state.js';
import { esc } from './helpers.js';

export function saveTasks() {
  localStorage.setItem('nova_tasks', JSON.stringify(state.tasks));
}

// Núcleo puro — no depende de que exista ningún elemento del DOM.
// Así NOVA puede añadir tareas por voz/chat aunque el panel esté cerrado.
export function agregarTarea(texto, prioridad = 'n') {
  const t = (texto || '').trim();
  if (!t) return null;
  const p = ['u', 'h', 'n'].includes(prioridad) ? prioridad : 'n';
  const tarea = { id: Date.now(), text: t, p, done: false };
  state.tasks.unshift(tarea);
  saveTasks();
  renderTasks();
  return tarea;
}

// Wrapper de UI — lee el input del panel y delega en agregarTarea()
export function addTask() {
  const i = document.getElementById('taskIn');
  if (!i) return;
  const t = i.value.trim();
  if (!t) return;
  const pSel = document.getElementById('taskPri');
  const p = pSel ? pSel.value : 'n';
  agregarTarea(t, p);
  i.value = '';
}

export function toggleTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (t) { t.done = !t.done; saveTasks(); renderTasks(); }
}

export function delTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
}

export function renderTasks() {
  const l = document.getElementById('tasksList');
  if (!l) return;
  const pMap = { u: ['p-u', 'URGENTE'], h: ['p-h', 'ALTA'], n: ['p-n', 'NORMAL'] };
  l.innerHTML = state.tasks.length === 0
    ? '<div class="empty" style="padding:20px 0">// SIN TAREAS //</div>'
    : state.tasks.map(t => `<div class="task-item ${t.done ? 'done' : ''}">
      <div class="task-chk ${t.done ? 'on' : ''}" data-id="${t.id}"></div>
      <div class="task-txt">${esc(t.text)}</div>
      <div class="p-badge ${pMap[t.p][0]}">${pMap[t.p][1]}</div>
      <div class="task-del" data-id="${t.id}">×</div>
    </div>`).join('');

  l.querySelectorAll('.task-chk').forEach(el => {
    el.addEventListener('click', () => toggleTask(Number(el.dataset.id)));
  });
  l.querySelectorAll('.task-del').forEach(el => {
    el.addEventListener('click', () => delTask(Number(el.dataset.id)));
  });
}

export function updateBriefingTasks() {
  const el = document.getElementById('bTasks');
  if (!el) return;
  const p = state.tasks.filter(t => !t.done);
  el.textContent = p.length === 0
    ? 'Sin pendientes.'
    : `${p.length} pendiente${p.length > 1 ? 's' : ''}: ${p.slice(0, 3).map(t => t.text).join(', ')}${p.length > 3 ? '...' : ''}`;
}