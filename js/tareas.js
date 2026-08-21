import { state } from './state.js';
import { esc } from './helpers.js';

export function saveTasks() {
  localStorage.setItem('nova_tasks', JSON.stringify(state.tasks));
}

export async function agregarTarea(texto, prioridad = 'n', vencimiento = null) {
  const t = (texto || '').trim();
  if (!t) return null;
  const p = ['u', 'h', 'n'].includes(prioridad) ? prioridad : 'n';

  // Si Google Tasks está disponible, guardar ahí (sincronizado con móvil y Calendar)
  if (state.tasksConn) {
    try {
      const { crearTareaGoogle } = await import('./googleTasks.js');
      const resultado = await crearTareaGoogle(t, p, vencimiento);
      if (resultado) return { id: resultado.id, text: t, p, done: false };
    } catch(e) { console.warn('Error en Google Tasks, usando localStorage:', e.message); }
  }

  // Fallback: localStorage
  const tarea = { id: Date.now(), text: t, p, done: false };
  state.tasks.unshift(tarea);
  saveTasks();
  renderTasks();
  return tarea;
}

export function addTask() {
  const i = document.getElementById('taskIn');
  if (!i) return;
  const t = i.value.trim();
  if (!t) return;
  const pDot = document.querySelector('.task-pri-dot.active');
  const p = pDot ? pDot.dataset.p : 'n';
  agregarTarea(t, p);
  i.value = '';
}

export async function toggleTask(id) {
  if (state.tasksConn) {
    try {
      const { completarTarea } = await import('./googleTasks.js');
      await completarTarea(String(id));
      return;
    } catch(e) { console.warn('toggleTask Google Tasks error:', e.message); }
  }
  const t = state.tasks.find(t => t.id === id);
  if (t) { t.done = !t.done; saveTasks(); renderTasks(); }
}

export async function delTask(id) {
  if (state.tasksConn) {
    try {
      const { eliminarTarea } = await import('./googleTasks.js');
      await eliminarTarea(String(id));
      return;
    } catch(e) { console.warn('delTask Google Tasks error:', e.message); }
  }
  state.tasks = state.tasks.filter(t => t.id !== id);
  saveTasks();
  renderTasks();
}

export function renderTasks() {
  const l = document.getElementById('tasksList');
  if (!l) return;
  l.innerHTML = state.tasks.length === 0
    ? '<div class="empty" style="padding:40px 0; text-align:center; color:var(--text-ghost); font-family:Fraunces,serif; font-style:italic;">Sin tareas pendientes</div>'
    : state.tasks.map(t => `<div class="task-item ${t.done ? 'done' : ''}">
      <div class="task-chk ${t.done ? 'on' : ''}" data-id="${t.id}"></div>
      <div class="task-txt">${esc(t.text)}</div>
      <div class="task-pri-indicator p-${t.p}"></div>
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