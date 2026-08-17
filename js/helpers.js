export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

export function copyTxt(id) {
  const el = document.getElementById(id);
  const txt = el.innerText || el.textContent || '';
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(() => toast('COPIADO')).catch(() => fallbackCopy(txt));
  } else {
    fallbackCopy(txt);
  }
}

export function fallbackCopy(txt) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('COPIADO');
  } catch (e) {
    toast('NO SE PUDO COPIAR');
  }
  ta.remove();
}