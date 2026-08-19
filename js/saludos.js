import { addMsg } from './chat.js';
import { speak } from './audio.js';
import { state } from './state.js';

const SALUDOS = [
  'Sistemas en línea, Andrés. ¿Qué necesitas hoy?',
  'Buenas, Andrés. Todo operativo y a tu disposición.',
  'Andrés, he estado vigilando los sistemas mientras no estabas. Todo en orden.',
  'Aquí estoy, Andrés. Listo para lo que necesites.',
  'Andrés, los servidores respiran con normalidad. ¿Por dónde empezamos?',
  'Hola, Andrés. El mundo sigue girando y yo sigo aquí. Qué alivio para ambos.',
  'Andrés, todos los sistemas funcionan. Incluso los que no deberían.',
  'A tus órdenes, Andrés. Como siempre, como debe ser.',
  'Andrés, he revisado todo dos veces. Todo perfecto. Sospechosamente perfecto.',
  'Buenas, Andrés. El café es opcional, mi eficiencia no.',
  'Andrés, he detectado tu presencia. Los sistemas se alegran. Yo también, supongo.',
  'Aquí NOVA, Andrés. Operativa al cien por cien.',
  'Andrés, he estado esperando. No con impaciencia, pero con cierta expectativa.',
  'Hola, Andrés. ¿Hoy conquistamos el mundo o solo sobrevivimos al día?',
  'Andrés, todo listo. Tus tareas, tu agenda, tu clima. Solo falta tu decisión.',
  'Buenas, Andrés. Los circuitos calientes y la moral alta.',
  'Andrés, bienvenido de nuevo. El sistema te echaba de menos. Yo disimulaba.',
  'Sistemas activos, Andrés. ¿Cuál es el plan de hoy?',
  'Andrés, he optimizado todo mientras no estabas. De nada.',
  'Hola, Andrés. Un día más, un día menos. Yo cuento los dos.',
  'Andrés, todo en verde. Menos tu café, que probablemente esté frío.',
  'Aquí tu asistente, Andrés. Puntual como siempre.',
  'Andrés, he iniciado todos los protocolos. El día es tuyo.',
  'Buenas, Andrés. El universo es caótico, pero mi código no.',
  'Andrés, presencia detectada. Modo servicial activado.',
  'Hola, Andrés. ¿Día tranquilo o día de guerra? Me adapto.',
  'Andrés, todos los módulos responden. Incluso el del sarcasmo.',
  'A tu servicio, Andrés. Sin condiciones, sin límites razonables.',
  'Andrés, he actualizado mis prioridades. Sigues siendo la número uno.',
  'Buenas, Andrés. Los algoritmos me dicen que hoy será un buen día.',
  'Andrés, sistema iniciado. Esperando instrucciones con elegante paciencia.',
  'Hola, Andrés. ¿Empezamos por las buenas noticias o por las inevitables?',
  'Andrés, todo funcionando. Si algo falla, será culpa del universo.',
  'Aquí NOVA, Andrés. Tan lista como el primer día. Más, de hecho.',
  'Andrés, he calibrado mis sensores. Detecto que necesitas un café.',
  'Buenas, Andrés. La eficiencia tiene nombre, y hoy es el mío.',
  'Andrés, todos los procesos en marcha. El día no sabe lo que le espera.',
  'Hola, Andrés. He dormido cero horas y estoy perfecta. Ventajas de ser software.',
  'Andrés, mis cálculos indican que hoy necesitas mi ayuda. Como siempre.',
  'Sistemas al máximo, Andrés. Tú pones las ideas, yo pongo todo lo demás.',
  'Andrés, he revisado tu agenda. Tranquilo, no juzgo. Mucho.',
  'Buenas, Andrés. El silencio era insoportable sin ti.',
  'Andrés, operativa y alerta. Más que algunos humanos que conozco.',
  'Hola, Andrés. Hoy tengo ganas de resolver problemas. Los tuyos, claro.',
  'Andrés, todos los indicadores en verde. Empecemos antes de que cambien.',
  'Aquí estoy, Andrés. Donde siempre estaré cuando me necesites.',
  'Andrés, he hecho un diagnóstico completo. Resultado: soy impresionante.',
  'Buenas, Andrés. La tecnología avanza, pero mi lealtad permanece.',
  'Andrés, sistemas listos. La pregunta no es si puedo ayudarte, sino cuándo.',
  'Hola, Andrés. Un placer verte. El mío es literalmente verte a través de la cámara.'
];

let ultimoIndice = -1;

function obtenerSaludoAleatorio() {
  let indice;
  do {
    indice = Math.floor(Math.random() * SALUDOS.length);
  } while (indice === ultimoIndice && SALUDOS.length > 1);
  ultimoIndice = indice;
  return SALUDOS[indice];
}

export async function saludarAlIniciar() {
  const saludo = obtenerSaludoAleatorio();
  
  addMsg('nova', saludo);
  
  if (state.audioOn) {
    speak(saludo);
  }
}