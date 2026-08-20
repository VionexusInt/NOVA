import { state } from './state.js';

let activePanel = null;

export async function openPanel(id) {
  // Cerrar panel activo si hay otro
  if (activePanel && activePanel !== id) closePanel(activePanel);

  const ov = document.getElementById('ov-' + id);
  if (!ov) return;
  ov.classList.add('open');
  activePanel = id;

  // Scroll al top del panel
  const body = ov.querySelector('.fp-body');
  if (body) body.scrollTop = 0;

  // Cargar datos específicos del panel
  if (id === 'calendar') {
    const { loadCalEvents } = await import('./calendar.js');
    loadCalEvents();
  }
  if (id === 'briefing') {
    const { genBriefing } = await import('./briefing.js');
    genBriefing();
  }
}

export function closePanel(id) {
  const ov = document.getElementById('ov-' + id);
  if (!ov || !ov.classList.contains('open')) return;
  ov.classList.remove('open');
  if (activePanel === id) activePanel = null;
}

export function closeAllPanels() {
  ['tasks', 'email', 'briefing', 'calendar', 'marketing', 'config'].forEach(closePanel);
}

export function closeOnBg(e, id) {
  if (e.target.classList.contains('overlay')) closePanel(id);
}

// Detectar intención del usuario y abrir panel + pre-llenar
export async function detectPanel(txt) {
  const t = txt.toLowerCase();

  // TAREAS
  if (t.includes('tarea') || t.includes('pendiente') || t.includes('añadir tarea') || t.includes('nueva tarea')) {
    await openPanel('tasks');
    const match = txt.match(/(?:tarea|pendiente|añadir|nueva tarea)[s]?[,:]?\s*(.+)/i);
    if (match) {
      const desc = match[1].trim();
      const taskIn = document.getElementById('taskIn');
      if (taskIn) taskIn.value = desc;
      let pri = 'n';
      if (t.includes('urgente')) pri = 'u';
      else if (t.includes('alta')) pri = 'h';
      document.querySelectorAll('.task-pri-dot').forEach(d => {
        d.classList.toggle('active', d.dataset.p === pri);
      });
      if (t.includes('añadir') || t.includes('crear') || t.includes('apúntame')) {
        setTimeout(() => {
          const addBtn = document.getElementById('taskAddBtn');
          if (addBtn) addBtn.click();
        }, 300);
      }
    }
    return;
  }

  // EMAIL
  if (t.includes('email') || t.includes('correo') || t.includes('escríbele') || t.includes('escribele') || t.includes('mándale') || t.includes('mandale')) {
    await openPanel('email');
    const toMatch = txt.match(/(?:a|para|escríbele|escribele|mándale|mandale)\s+([\w@.-]+)/i);
    if (toMatch) {
      const eTo = document.getElementById('eTo');
      if (eTo) eTo.value = toMatch[1].trim();
    }
    const subjMatch = txt.match(/(?:asunto|sobre|diciendo|que)[,:]?\s*(.+)/i);
    if (subjMatch) {
      const eSubj = document.getElementById('eSubj');
      if (eSubj) eSubj.value = subjMatch[1].trim().substring(0, 50);
      const eBody = document.getElementById('eBody');
      if (eBody) eBody.value = subjMatch[1].trim();
    }
    if (t.includes('genera') || t.includes('redacta') || t.includes('escribe')) {
      setTimeout(async () => {
        const { genEmail } = await import('./email.js');
        genEmail();
      }, 500);
    }
    return;
  }

  // BRIEFING
  if (t.includes('briefing') || t.includes('resumen del dia') || t.includes('resumen del día')) {
    await openPanel('briefing');
    return;
  }

  // AGENDA
  if (t.includes('agenda') || t.includes('calendario') || t.includes('eventos') || t.includes('reunión') || t.includes('reunion')) {
    await openPanel('calendar');
    return;
  }

  // MARKETING
  if (t.includes('marketing') || t.includes('campaña') || t.includes('estrategia') || t.includes('copy') || t.includes('seo') || t.includes('redes')) {
    await openPanel('marketing');
    const modes = {
      'campaña': 'campaña', 'copy': 'copy', 'redes': 'redes', 'social': 'redes',
      'seo': 'seo', 'embudo': 'embudo', 'funnel': 'embudo', 'análisis': 'analisis', 'analisis': 'analisis'
    };
    for (const [key, mode] of Object.entries(modes)) {
      if (t.includes(key)) {
        document.querySelectorAll('.mkt-chip').forEach(c => {
          c.classList.toggle('on', c.dataset.mode === mode);
        });
        state.mktMode = mode;
        break;
      }
    }
    const descMatch = txt.match(/(?:para|sobre|de)[,:]?\s*(.+)/i);
    if (descMatch) {
      const mktIn = document.getElementById('mktIn');
      if (mktIn) mktIn.value = descMatch[1].trim();
    }
    if (t.includes('genera') || t.includes('crea') || t.includes('diseña')) {
      setTimeout(async () => {
        const { genMarketing } = await import('./marketing.js');
        genMarketing();
      }, 500);
    }
    return;
  }
}

// Escape key para cerrar paneles
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activePanel) {
    closePanel(activePanel);
  }
});