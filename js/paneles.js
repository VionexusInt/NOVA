import { state } from './state.js';

export function openPanel(id) {
  const ov = document.getElementById('ov-' + id);
  if (!ov) return;
  ov.classList.remove('closing');
  ov.classList.add('open');
  const fp = ov.querySelector('.fp');
  if (fp) {
    fp.style.animation = 'none';
    void fp.offsetWidth;
    fp.style.animation = '';
    initDraggable(fp);
  }
}

export function closePanel(id) {
  const ov = document.getElementById('ov-' + id);
  if (!ov || !ov.classList.contains('open')) return;

  ov.classList.add('closing');

  const onEnd = () => {
    ov.classList.remove('open', 'closing');
    ov.removeEventListener('animationend', onEnd);
  };
  ov.addEventListener('animationend', onEnd);

  setTimeout(() => {
    if (ov.classList.contains('closing')) {
      ov.classList.remove('open', 'closing');
    }
  }, 500);
}

export function closeOnBg(e, id) {
  if (e.target.classList.contains('overlay')) closePanel(id);
}

export function detectPanel(txt) {
  const t = txt.toLowerCase();
  if (t.includes('tarea') || t.includes('pendiente')) openPanel('tasks');
  else if (t.includes('email') || t.includes('correo')) openPanel('email');
  else if (t.includes('briefing') || t.includes('resumen del dia')) openPanel('briefing');
  else if (t.includes('agenda') || t.includes('calendario')) openPanel('calendar');
  else if (t.includes('marketing') || t.includes('campaña')) openPanel('marketing');
}

function initDraggable(el) {
  const header = el.querySelector('.fp-header');
  if (!header || el.dataset.draggable) return;
  el.dataset.draggable = 'true';

  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  header.addEventListener('mousedown', dragMouseDown);

  function dragMouseDown(e) {
    if (e.target.classList.contains('fp-close')) return;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.addEventListener('mouseup', closeDragElement);
    document.addEventListener('mousemove', elementDrag);
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    const newTop = el.offsetTop - pos2;
    const newLeft = el.offsetLeft - pos1;

    el.style.position = 'absolute';
    el.style.margin = '0';
    el.style.top = `${Math.max(10, newTop)}px`;
    el.style.left = `${Math.max(10, newLeft)}px`;
  }

  function closeDragElement() {
    document.removeEventListener('mouseup', closeDragElement);
    document.removeEventListener('mousemove', elementDrag);
  }
}