/**
 * Motor local de Vanty (funciona sin API de IA).
 * Responde según la intención detectada usando los datos reales del estudiante,
 * la base de conocimiento y el banco de preguntas.
 */
import { una } from '../../config/db.js';
import { buscarConocimiento, buscarLecciones, conocimientoDeSubtema } from './conocimiento.js';
import { generarRecomendaciones } from './recomendaciones.js';
import { mensajeMotivacional } from './motivacion.js';
import { cargarPreguntas } from '../preguntas.service.js';

const ESTRATEGIAS = [
  '**Lee primero la pregunta y luego el contexto.** Así sabes qué buscar mientras lees.',
  '**Descarta antes de elegir.** Elimina las opciones claramente falsas; entre dos, busca la que responde exactamente lo que se pregunta.',
  '**Administra el tiempo:** en el Saber 11 tienes cerca de 2 minutos por pregunta. Si una te toma más de 3, márcala y vuelve al final.',
  '**Nunca dejes preguntas en blanco:** una respuesta omitida vale lo mismo que una incorrecta.',
  '**En Lectura Crítica,** justifica cada respuesta con una frase del texto; si no la encuentras, probablemente es una extrapolación.',
  '**En Matemáticas,** estima el resultado antes de calcular: te ayuda a descartar opciones absurdas.',
  '**En Inglés,** fíjate en las palabras alrededor del espacio en blanco: el tiempo verbal y las preposiciones suelen dar la pista.',
  '**Cuida tu energía:** duerme bien la semana anterior, desayuna y lleva agua el día del examen.',
];

function formatoRecomendaciones(ctx) {
  const recs = generarRecomendaciones(ctx).slice(0, 4);
  const lineas = recs.map((r, i) => `${i + 1}. **${r.titulo}.** ${r.texto}${r.accion ? ` [${r.accion.etiqueta}](${r.accion.url})` : ''}`);
  return [`Revisé tu rendimiento, ${ctx.nombre}. Esto es lo que te recomiendo ahora:`, lineas.join('\n'), 'Si quieres, te genero una pregunta de práctica de tu tema más débil: solo escribe **"genera una pregunta"**.'].join('\n\n');
}

function formatoRendimiento(ctx) {
  if (ctx.respondidas_total < 5) {
    return `Aún no tengo suficientes datos para analizar tu rendimiento, ${ctx.nombre}. Responde al menos 10 preguntas (o haz el Minisimulacro 1) y te daré un diagnóstico completo por área.`;
  }
  const conDatos = ctx.areas.filter((a) => a.respondidas > 0).sort((a, b) => b.precision - a.precision);
  const mejor = conDatos[0];
  const peor = conDatos[conDatos.length - 1];
  const lineas = [
    `Así vas, ${ctx.nombre}:`,
    `- **Precisión general:** ${ctx.precision_global} % en ${ctx.respondidas_total} preguntas (últimos 90 días).`,
    mejor ? `- **Tu mejor área:** ${mejor.nombre} (${mejor.precision} %).` : '',
    peor && peor !== mejor ? `- **Área a reforzar:** ${peor.nombre} (${peor.precision} %).` : '',
    ctx.debilidades.length ? `- **Temas débiles:** ${ctx.debilidades.map((t) => `${t.nombre} (${t.precision} %)`).join(', ')}.` : '',
    ctx.puntaje.puntaje != null
      ? `- **Puntaje global estimado:** ~${ctx.puntaje.puntaje}/500 (confianza ${ctx.puntaje.confianza})${ctx.proyeccion?.puntaje ? `; proyección al examen: ${ctx.proyeccion.puntaje}` : ''}.`
      : '',
    `- **Racha:** ${ctx.racha.actual} días · **Nivel:** ${ctx.nivel.nombre} (${ctx.nivel.xp} XP).`,
  ].filter(Boolean);
  lineas.push('', 'Tienes el detalle completo con gráficas en [Avance](/avance).');
  return lineas.join('\n');
}

async function formatoExplicacion(ctx, adjunto, usuarioId) {
  let preguntaId = adjunto?.pregunta_id ?? null;
  let opcionElegida = adjunto?.opcion_id ?? null;
  if (!preguntaId && ctx.ultimo_error) {
    preguntaId = ctx.ultimo_error.pregunta_id;
    opcionElegida = ctx.ultimo_error.opcion_id;
  }
  if (!preguntaId) {
    return 'Todavía no has fallado ninguna pregunta que pueda explicarte. ¡Buena señal! Si tienes una duda sobre un tema, escríbemela y te la explico.';
  }
  const permitida = await una(
    `SELECT 1 AS si FROM preguntas WHERE id = $1 AND activa AND (publica OR autor_id = $2)`,
    [preguntaId, usuarioId],
  );
  if (!permitida) return 'No encontré esa pregunta. ¿Puedes contarme qué parte no entendiste?';

  const [p] = await cargarPreguntas([preguntaId], { conSolucion: true });
  const correcta = p.opciones.find((o) => o.es_correcta);
  const elegida = p.opciones.find((o) => o.id === opcionElegida);
  const partes = [`Revisemos la pregunta **${p.codigo}** de ${p.materia.nombre} (${p.subtema.nombre}).`];
  if (elegida && !elegida.es_correcta) {
    partes.push(`Elegiste la **${elegida.letra}**: ${elegida.retroalimentacion ?? 'no es la respuesta correcta.'}`);
  }
  partes.push(`La respuesta correcta es la **${correcta.letra}**: ${correcta.texto}`);
  partes.push(`**¿Por qué?** ${p.explicacion}`);
  const tip = conocimientoDeSubtema(p.subtema.slug);
  if (tip?.tip_icfes) partes.push(`**Tip ICFES:** ${tip.tip_icfes}`);
  partes.push('¿Quieres intentar una pregunta parecida? Escribe **"genera una pregunta similar"**.');
  return partes.join('\n\n');
}

async function formatoDuda(ctx, texto, materia) {
  const entradas = buscarConocimiento(texto, { materia });
  if (entradas.length) {
    const e = entradas[0];
    const partes = [`**${e.titulo}**`, e.explicacion];
    if (e.ejemplo) partes.push(`**Ejemplo:** ${e.ejemplo}`);
    if (e.tip_icfes) partes.push(`**Tip ICFES:** ${e.tip_icfes}`);
    const lecciones = await buscarLecciones(`${e.titulo} ${texto}`, 1);
    if (lecciones.length) partes.push(`Profundiza con la lección [${lecciones[0].titulo}](/leccion?id=${lecciones[0].id}).`);
    if (entradas[1]) partes.push(`También te puede servir: **${entradas[1].titulo}**. Pregúntame por ese tema si quieres.`);
    return partes.join('\n\n');
  }
  const lecciones = await buscarLecciones(texto, 2);
  if (lecciones.length) {
    return [
      'Sobre eso tengo estas lecciones que te pueden ayudar:',
      lecciones.map((l) => `- [${l.titulo}](/leccion?id=${l.id}) · ${l.materia}, ${l.subtema}`).join('\n'),
      'Si me dices exactamente qué parte no entiendes, intento explicártela.',
    ].join('\n\n');
  }
  return [
    'Estoy en **modo local**, así que respondo mejor sobre los temas de mi base de conocimiento del ICFES (por ejemplo: teorema de Pitágoras, probabilidad, inferencias, falacias, leyes de Newton, pH, Constitución de 1991, present perfect…).',
    'Prueba preguntándome por un concepto concreto, o pídeme:',
    '- **"¿Qué debo estudiar?"** para recomendaciones personalizadas.\n- **"Genera una pregunta de geometría"** para practicar.\n- **"Explícame mi último error"** para repasar.',
  ].join('\n\n');
}

function formatoAyuda(ctx) {
  return [
    `¡Hola, ${ctx.nombre}! Soy **Vanty**, tu tutora de ICFES Lab. Puedo:`,
    '- Resolver dudas de las 5 áreas del ICFES.\n- Explicarte las preguntas que fallaste.\n- Recomendarte qué estudiar según tu rendimiento.\n- Generarte preguntas de práctica personalizadas.\n- Darte estrategias para el examen y ánimo cuando lo necesites.',
    '¿Por dónde empezamos?',
  ].join('\n\n');
}

function formatoSaludo(ctx) {
  const extra = ctx.racha.actual >= 2
    ? `Llevas **${ctx.racha.actual} días** de racha. ¡Vamos por uno más!`
    : ctx.icfes.dias > 0 ? `Faltan **${ctx.icfes.dias} días** para el ICFES: aprovechemos cada uno.` : '¿Listo para estudiar?';
  return `¡Hola, ${ctx.nombre}! ${extra}\n\nPuedes preguntarme una duda, pedirme una recomendación o decirme **"genera una pregunta"** para practicar.`;
}

/**
 * @returns {Promise<{ texto: string, tipo: string }>}
 */
export async function responderLocal({ intencion, texto, materia, ctx, adjunto, usuarioId }) {
  switch (intencion) {
    case 'saludo':
      return { texto: formatoSaludo(ctx), tipo: 'texto' };
    case 'ayuda':
      return { texto: formatoAyuda(ctx), tipo: 'texto' };
    case 'agradecimiento':
      return { texto: `¡Con gusto, ${ctx.nombre}! Aquí estaré cuando me necesites. Recuerda: un poco cada día suma mucho.`, tipo: 'texto' };
    case 'recomendacion':
      return { texto: formatoRecomendaciones(ctx), tipo: 'recomendacion' };
    case 'rendimiento':
      return { texto: formatoRendimiento(ctx), tipo: 'texto' };
    case 'motivacion':
      return { texto: mensajeMotivacional(ctx, texto), tipo: 'texto' };
    case 'estrategia':
      return { texto: ['Estas son mis mejores estrategias para el ICFES:', ESTRATEGIAS.map((e) => `- ${e}`).join('\n')].join('\n\n'), tipo: 'texto' };
    case 'explicar_pregunta':
      return { texto: await formatoExplicacion(ctx, adjunto, usuarioId), tipo: 'explicacion' };
    default:
      return { texto: await formatoDuda(ctx, texto, materia), tipo: 'texto' };
  }
}
