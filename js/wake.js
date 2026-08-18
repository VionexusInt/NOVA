import { state } from './state.js';
import { addMsg } from './chat.js';
import { speak } from './audio.js';
import { generateBriefing } from './briefing.js';
import { openPanel } from './paneles.js';

export async function activarModoDespertar() {
  const hora = new Date().getHours();
  const momento = hora < 12 ? 'mañana' : hora < 20 ? 'tarde' : 'noche';

  const saludo = `Buen ${momento}, señor. Sistemas en línea. Iniciando protocolo de despertar.`;
  addMsg('nova', saludo);
  state.hist.push({ role: 'assistant', content: saludo });
  state.lastSpokenText = saludo;
  await speak(saludo);

  await new Promise(r => setTimeout(r, 800));

  const estado = 'Núcleo estable. Memoria sincronizada. Módulos operativos.';
  addMsg('nova', estado);
  state.hist.push({ role: 'assistant', content: estado });
  state.lastSpokenText = estado;
  await speak(estado);

  await new Promise(r => setTimeout(r, 800));

  const briefingText = await generateBriefing();
  if (briefingText) {
    openPanel('briefing');
    addMsg('nova', briefingText);
    state.hist.push({ role: 'assistant', content: briefingText });
    state.lastSpokenText = briefingText;
    await speak(briefingText);
  } else {
    addMsg('nova', 'No he podido generar el briefing.');
    state.lastSpokenText = 'No he podido generar el briefing.';
    await speak(state.lastSpokenText);
  }
}