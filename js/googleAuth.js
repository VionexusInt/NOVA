let gisPromise = null;

export function cargarGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const existente = document.querySelector('script[src*="accounts.google.com/gsi"]');

    if (existente) {
      let intentos = 0;
      const check = setInterval(() => {
        intentos++;
        if (window.google?.accounts?.oauth2) {
          clearInterval(check);
          resolve();
        } else if (intentos > 160) {
          clearInterval(check);
          reject(new Error('Timeout esperando Google Identity Services'));
        }
      }, 50);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
    document.head.appendChild(script);
  });

  return gisPromise;
}