/**
 * Detección de intención de los mensajes del estudiante (sin IA, con expresiones regulares
 * sobre el texto normalizado: minúsculas y sin tildes).
 */
import { normalizar } from '../../utils/texto.js';

const MATERIAS = [
  ['matematicas', /\b(mate|matematica|matematicas|algebra|geometri|estadistic|probabilid|calculo|ecuacion|funcion|porcentaj|fraccion|pitagoras|area|perimetro)/],
  ['lectura-critica', /\b(lectura|lectura critica|texto|inferenc|argument|comprension|falacia|tesis|parrafo|autor)/],
  ['ciencias-naturales', /\b(ciencia|ciencias|biolog|fisica|quimic|ambient|celula|energia|fuerza|newton|reaccion|ecosistem|adn|genetic|ph\b)/],
  ['sociales-ciudadanas', /\b(social|sociales|historia|geograf|politic|economi|constitucion|ciudadan|tutela|derecho|estado|democracia|inflacion)/],
  ['ingles', /\b(ingles|english|grammar|vocabulary|reading|verb|tense|present perfect|past simple|phrasal)/],
];

const SUBTEMAS = [
  ['algebra', /\balgebra|ecuacion|despej|porcentaj|proporcion/],
  ['geometria', /\bgeometri|triangul|pitagoras|area|volumen|perimetro|angulo/],
  ['estadistica', /\bestadistic|promedio|media|mediana|moda|grafic[oa]s? de barras/],
  ['probabilidad', /\bprobabilid|azar|dado|evento/],
  ['calculo-basico', /\bcalculo|pendiente|tasa de cambio|razon de cambio|derivad/],
  ['comprension-textual', /\bcomprension textual|comprension literal/],
  ['inferencias', /\binferenc/],
  ['argumentacion', /\bargument|falacia|tesis/],
  ['analisis-textos', /\banalisis de textos?|tipos de texto|estructura del texto/],
  ['interpretacion', /\binterpretacion|intencion del autor|sentido global/],
  ['biologia', /\bbiolog|celula|genetic|adn|ecosistem/],
  ['fisica', /\bfisica|fuerza|velocidad|aceleracion|energia|newton|circuito/],
  ['quimica', /\bquimic|reaccion|enlace|tabla periodica|ph\b|solucion|molecula/],
  ['medio-ambiente', /\bambient|contaminacion|biodiversidad|paramo|cambio climatico|reciclaj/],
  ['metodo-cientifico', /\bmetodo cientifico|hipotesis|variable|experimento/],
  ['historia', /\bhistoria|independencia|frente nacional|colonia|siglo/],
  ['geografia', /\bgeograf|region|clima|piso termico|relieve/],
  ['economia', /\beconomi|inflacion|oferta|demanda|impuesto|desempleo/],
  ['politica', /\bpolitic|ramas del poder|congreso|presidente|estado social/],
  ['ciudadania', /\bciudadan|constitucion|tutela|derechos|participacion|convivencia/],
  ['reading', /\breading|lectura en ingles/],
  ['grammar', /\bgrammar|gramatica|present perfect|past simple|tense|tiempos verbales/],
  ['vocabulary', /\bvocabulary|vocabulario|avisos|notice/],
  ['context-understanding', /\bcontext understanding|conversacion|dialogo|dialogue/],
  ['language-use', /\blanguage use|cloze|texto incompleto/],
];

const PATRONES = [
  ['generar_pregunta', /\b(genera|generame|hazme|dame|ponme|proponme|propon|quiero|necesito|haz)\b.{0,40}\b(pregunta|preguntas|ejercicio|ejercicios|quiz|reto)\b|\bevaluame\b|\bponme a prueba\b|\botra pregunta\b|\bpregunta (parecida|similar)\b/],
  ['explicar_pregunta', /\b(explica|explicame|por que|porque)\b.{0,50}\b(error|pregunta|respuesta|falle|me equivoque|incorrect)|\b(ultimo|ultima) (error|pregunta)\b/],
  ['recomendacion', /\b(que|como|en que) (debo|deberia|puedo|tengo que|me conviene) (estudiar|repasar|practicar|mejorar|enfocar)|\brecomienda|\brecomendacion|\bpor donde empiezo\b|\ben que me enfoco\b|\bplan de estudio|\bque estudio\b/],
  ['rendimiento', /\bcomo voy\b|\bmi (rendimiento|progreso|puntaje|avance|nivel|desempeno)\b|\bmis (estadisticas|resultados|puntajes|fortalezas|debilidades)\b|\bcuanto (sacaria|saco|tengo|llevo)\b|\bpuntaje estimado\b/],
  ['estrategia', /\b(estrategia|estrategias|tecnica|tecnicas|consejo|consejos|tip|tips|truco|trucos)\b.{0,40}\b(examen|icfes|prueba|tiempo|simulacro|responder)|\bcomo (manejo|administro|organizo) (el|mi) tiempo\b|\bcomo me preparo\b/],
  ['motivacion', /\b(motivame|motivacion|animo|cansad|agotad|aburrid|no puedo|me rindo|estres|estresad|ansie|nervios|miedo|desmotiv|flojera|pereza|triste|angusti)/],
  ['ayuda', /\b(que puedes hacer|que sabes hacer|como funcionas|quien eres|ayuda|para que sirves)\b/],
  ['saludo', /^(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|que mas|quiubo|saludos)\b/],
  ['agradecimiento', /^(gracias|muchas gracias|mil gracias|listo|ok|okay|vale|genial|perfecto|excelente|chevere|bacano)\b/],
];

/**
 * @param {string} texto
 * @param {{ adjunto?: object }} opciones
 * @returns {{ intencion: string, materia: string|null, subtema: string|null, dificultad: number|null }}
 */
export function detectarIntencion(texto, { adjunto } = {}) {
  const t = normalizar(texto);
  let intencion = 'duda_academica';

  if (adjunto?.pregunta_id && !/\b(genera|otra|parecida|similar)\b/.test(t)) {
    intencion = 'explicar_pregunta';
  } else {
    for (const [nombre, patron] of PATRONES) {
      if (patron.test(t)) {
        // Saludos y agradecimientos solo si el mensaje es corto (si no, es una duda con saludo).
        if ((nombre === 'saludo' || nombre === 'agradecimiento') && t.length > 40) continue;
        intencion = nombre;
        break;
      }
    }
  }

  const materia = MATERIAS.find(([, patron]) => patron.test(t))?.[0] ?? null;
  const subtema = SUBTEMAS.find(([, patron]) => patron.test(t))?.[0] ?? null;
  let dificultad = null;
  if (/\b(facil|sencilla|basica|suave)\b/.test(t)) dificultad = 1;
  else if (/\b(media|intermedia|normal)\b/.test(t)) dificultad = 2;
  else if (/\b(dificil|avanzada|complicada|dura|exigente)\b/.test(t)) dificultad = 3;

  return { intencion, materia, subtema, dificultad };
}
