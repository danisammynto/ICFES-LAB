/**
 * Proveedor de IA de Vanty: Claude (API de Anthropic).
 *
 * · Chat: respuesta en streaming (el texto llega al navegador mientras se genera).
 * · Generación de preguntas: salida estructurada con JSON Schema (output_config.format).
 * · Respaldo ante rechazos: si el modelo declina una solicitud por sus políticas de
 *   seguridad, el servidor de Anthropic la reintenta con el modelo de respaldo
 *   recomendado (fallbacks: "default"). Se desactiva con VANTY_FALLBACKS=false.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { ESQUEMA_PREGUNTA, PROMPT_GENERADOR } from './prompts.js';

let cliente = null;
let fallbacksHabilitados = env.vanty.fallbacks;

function obtenerCliente() {
  if (!cliente) {
    cliente = new Anthropic({ apiKey: env.vanty.apiKey, maxRetries: 2, timeout: 120_000 });
  }
  return cliente;
}

export const claudeActivo = () => env.vanty.proveedor === 'claude';

function opcionesRespaldo() {
  return fallbacksHabilitados ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {};
}

/** Si la cuenta o el modelo no admiten el respaldo, se desactiva y se reintenta sin él. */
function esErrorDeRespaldo(error) {
  return fallbacksHabilitados && error instanceof Anthropic.BadRequestError && /fallback/i.test(error.message);
}

/**
 * Respuesta de chat en streaming.
 * @param {{ system: object[], messages: object[], onTexto: (delta: string) => void, signal?: AbortSignal }} p
 * @returns {Promise<{ texto: string, stopReason: string, uso: object, modelo: string }>}
 */
export async function responderConClaude({ system, messages, onTexto, signal }) {
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const stream = obtenerCliente().beta.messages.stream(
        {
          model: env.vanty.modelo,
          max_tokens: 16000,
          output_config: { effort: env.vanty.esfuerzo },
          system,
          messages,
          ...opcionesRespaldo(),
        },
        { signal },
      );
      stream.on('text', (delta) => onTexto(delta));
      const final = await stream.finalMessage();
      const texto = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { texto, stopReason: final.stop_reason, uso: final.usage, modelo: final.model };
    } catch (error) {
      if (esErrorDeRespaldo(error)) {
        console.warn('[vanty] El respaldo del servidor no está disponible; se continúa sin él.');
        fallbacksHabilitados = false;
        continue;
      }
      throw error;
    }
  }
  throw new Error('No fue posible obtener respuesta de Claude.');
}

/**
 * Genera una pregunta tipo ICFES personalizada con salida estructurada.
 * @returns {Promise<{ contexto, enunciado, opciones, explicacion, competencia }>}
 */
export async function generarPreguntaConClaude({ materia, subtema, descripcion, dificultad, competencias, errores }) {
  const nivel = { 1: 'baja', 2: 'media', 3: 'alta' }[dificultad] ?? 'media';
  const instrucciones = [
    'Genera una pregunta tipo ICFES para este estudiante.',
    `- Área: ${materia}`,
    `- Subtema: ${subtema}${descripcion ? ` (${descripcion})` : ''}`,
    `- Dificultad: ${nivel}`,
    competencias?.length ? `- Competencias del área: ${competencias.join('; ')}` : '',
    errores?.length
      ? `- Preguntas que el estudiante falló recientemente en este tema (inspírate en su dificultad, sin repetirlas):\n${errores.map((e) => `  · ${e}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const respuesta = await obtenerCliente().beta.messages.create({
        model: env.vanty.modelo,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA_PREGUNTA } },
        system: PROMPT_GENERADOR,
        messages: [{ role: 'user', content: instrucciones }],
        ...opcionesRespaldo(),
      });
      if (respuesta.stop_reason === 'refusal') throw new Error('El modelo declinó generar la pregunta.');
      if (respuesta.stop_reason === 'max_tokens') throw new Error('La respuesta del modelo quedó incompleta.');
      const texto = respuesta.content.find((b) => b.type === 'text')?.text ?? '';
      return validarPreguntaGenerada(JSON.parse(texto));
    } catch (error) {
      if (esErrorDeRespaldo(error)) {
        fallbacksHabilitados = false;
        continue;
      }
      throw error;
    }
  }
  throw new Error('No fue posible generar la pregunta.');
}

/** Valida la estructura (4 opciones, 1 correcta, textos no vacíos y de longitud razonable). */
export function validarPreguntaGenerada(datos) {
  const texto = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!texto(datos?.enunciado, 1500) || !texto(datos?.explicacion, 4000)) throw new Error('Pregunta generada incompleta.');
  if (!Array.isArray(datos.opciones) || datos.opciones.length !== 4) throw new Error('La pregunta generada no tiene 4 opciones.');
  if (datos.opciones.filter((o) => o.correcta === true).length !== 1) throw new Error('La pregunta generada no tiene exactamente una opción correcta.');
  if (!datos.opciones.every((o) => texto(o.texto, 600) && texto(o.retroalimentacion, 1200))) throw new Error('Opciones generadas inválidas.');
  return {
    contexto: typeof datos.contexto === 'string' ? datos.contexto.slice(0, 3000).trim() : '',
    enunciado: datos.enunciado.trim(),
    opciones: datos.opciones.map((o) => ({ texto: o.texto.trim(), correcta: o.correcta, retroalimentacion: o.retroalimentacion.trim() })),
    explicacion: datos.explicacion.trim(),
    competencia: typeof datos.competencia === 'string' ? datos.competencia.slice(0, 120) : null,
  };
}

/** Mensaje amable para errores de la API (el detalle técnico queda en el log del servidor). */
export function describirErrorClaude(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'La clave de la API de IA no es válida.';
  if (error instanceof Anthropic.RateLimitError) return 'El servicio de IA está saturado en este momento.';
  if (error instanceof Anthropic.APIConnectionError) return 'No hay conexión con el servicio de IA.';
  if (error instanceof Anthropic.APIError) return `El servicio de IA respondió con un error (${error.status}).`;
  return 'El servicio de IA no respondió como se esperaba.';
}
