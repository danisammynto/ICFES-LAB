/**
 * Mensajes motivacionales personalizados (recordatorio diario y modo local de Vanty).
 */
import { hashTexto } from '../../utils/aleatorio.js';
import { fechaLocal } from '../../utils/fechas.js';

const FRASES = [
  'Cada pregunta que respondes hoy es un punto más el día del examen.',
  'La constancia le gana al talento cuando el talento no es constante.',
  'No tienes que estudiar todo hoy: solo un poco mejor que ayer.',
  'Equivocarte aquí es la mejor forma de no equivocarte en el ICFES.',
  'Tu futuro yo te va a agradecer los minutos que estudies hoy.',
  'Los grandes puntajes se construyen con pequeñas sesiones diarias.',
  'Un error bien entendido vale más que diez aciertos de suerte.',
  'Hoy es un buen día para sumar XP y acercarte a tu meta.',
  'Leer con calma también es una estrategia: el ICFES premia la comprensión.',
  'Tu cerebro es un músculo: cada lección lo hace más fuerte.',
  'Paso a paso, tema a tema: así se llega a Experto.',
  'La preparación convierte los nervios en confianza.',
];

/** Frase estable durante el día (cambia cada día y por estudiante). */
function fraseDelDia(semilla) {
  return FRASES[hashTexto(`${semilla}:${fechaLocal()}`) % FRASES.length];
}

/** Mensaje del recordatorio diario del dashboard. */
export function mensajeDelDia(ctx) {
  const nombre = ctx.nombre;
  if (ctx.racha?.estudio_hoy) {
    if (ctx.hoy.minutos >= ctx.meta_diaria_min) {
      return `¡Cumpliste tu meta de hoy, ${nombre}! ${fraseDelDia(ctx.usuarioId)}`;
    }
    return `¡Bien, ${nombre}! Te faltan ${Math.max(0, ctx.meta_diaria_min - ctx.hoy.minutos)} min para tu meta diaria.`;
  }
  if (ctx.racha?.actual >= 2) {
    return `${nombre}, llevas ${ctx.racha.actual} días seguidos. ¡No rompas la racha! ${fraseDelDia(ctx.usuarioId)}`;
  }
  if (ctx.icfes?.dias != null && ctx.icfes.dias > 0 && ctx.icfes.dias <= 60) {
    return `Faltan ${ctx.icfes.dias} días para el ICFES, ${nombre}. Cada sesión cuenta. ${fraseDelDia(ctx.usuarioId)}`;
  }
  return `Hola, ${nombre}. ${fraseDelDia(ctx.usuarioId)}`;
}

/** Respuesta motivacional para el chat (modo local). */
export function mensajeMotivacional(ctx, textoUsuario = '') {
  const partes = [];
  const cansancio = /(cansad|agotad|sueno|dormir)/.test(textoUsuario);
  const estres = /(estres|ansie|nervio|miedo|angusti|presion)/.test(textoUsuario);
  const desanimo = /(no puedo|me rindo|desmotiv|no sirvo|dificil|aburrid|flojera|pereza)/.test(textoUsuario);

  if (estres) {
    partes.push(`Es normal sentir nervios antes del ICFES, ${ctx.nombre}. Eso significa que te importa, y eso es una fortaleza.`);
    partes.push('Prueba esto: respira profundo cuatro segundos, sostén cuatro y suelta en cuatro. Después, enfócate solo en la siguiente pregunta, no en todo el examen.');
    partes.push('Si la preocupación no se va o te está afectando mucho, habla con un adulto de confianza o con el orientador de tu colegio: pedir apoyo también es parte de prepararse.');
  } else if (cansancio) {
    partes.push(`Descansar también es estudiar, ${ctx.nombre}. Tu cerebro consolida lo aprendido mientras duermes.`);
    partes.push('Hoy puedes hacer algo corto: una lección de 8 minutos o 5 preguntas. Mantienes la racha sin agotarte.');
  } else if (desanimo) {
    partes.push(`Nadie empieza sabiéndolo todo, ${ctx.nombre}. Lo importante es que sigues aquí.`);
    if (ctx.fortalezas?.length) {
      partes.push(`Mira tu progreso: en ${ctx.fortalezas[0].nombre} ya llevas ${ctx.fortalezas[0].precision} % de aciertos. Eso lo lograste tú.`);
    }
    partes.push('Divide el reto: elige un solo tema, haz la lección y 3 preguntas. Pequeñas victorias, todos los días.');
  } else {
    partes.push(`¡Vamos, ${ctx.nombre}! ${fraseDelDia(`${ctx.usuarioId}:chat`)}`);
  }

  if (ctx.racha?.actual >= 2) partes.push(`Llevas una racha de **${ctx.racha.actual} días**. ¡Eso es constancia de verdad!`);
  if (ctx.icfes?.dias > 0) partes.push(`Faltan **${ctx.icfes.dias} días** para el examen: tiempo suficiente para mejorar mucho si estudias un poco cada día.`);
  return partes.join('\n\n');
}
