/**
 * Carga de preguntas con su contexto y opciones, en el formato que consume el frontend.
 * Por defecto NO incluye la solución (opción correcta, retroalimentación ni explicación):
 * la solución solo se envía después de responder o al revisar un simulacro finalizado.
 */
import { pool, varias } from '../config/db.js';

/**
 * @param {number[]} ids
 * @param {{ conSolucion?: boolean }} opciones
 * @returns {Promise<object[]>} preguntas en el mismo orden de `ids`
 */
export async function cargarPreguntas(ids, { conSolucion = false } = {}, cliente = pool) {
  if (!ids.length) return [];
  const filas = await varias(
    `SELECT p.id, p.codigo, p.enunciado, p.imagen_url, p.imagen_alt, p.dificultad, p.competencia,
            p.tiempo_estimado_seg, p.explicacion, p.origen,
            s.id AS subtema_id, s.slug AS subtema_slug, s.nombre AS subtema_nombre,
            m.id AS materia_id, m.slug AS materia_slug, m.nombre AS materia_nombre,
            m.color AS materia_color, m.icono AS materia_icono,
            c.id AS contexto_id, c.titulo AS contexto_titulo, c.contenido AS contexto_contenido,
            c.imagen_url AS contexto_imagen, c.imagen_alt AS contexto_imagen_alt, c.fuente AS contexto_fuente
       FROM preguntas p
       JOIN subtemas s ON s.id = p.subtema_id
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
       LEFT JOIN contextos c ON c.id = p.contexto_id
      WHERE p.id = ANY($1::int[])`,
    [ids],
    cliente,
  );
  const opciones = await varias(
    `SELECT id, pregunta_id, letra, texto, es_correcta, retroalimentacion
       FROM opciones WHERE pregunta_id = ANY($1::int[])
      ORDER BY pregunta_id, letra`,
    [ids],
    cliente,
  );

  const opcionesPorPregunta = new Map();
  for (const o of opciones) {
    if (!opcionesPorPregunta.has(o.pregunta_id)) opcionesPorPregunta.set(o.pregunta_id, []);
    opcionesPorPregunta.get(o.pregunta_id).push(o);
  }

  const porId = new Map(filas.map((p) => [p.id, formatear(p, opcionesPorPregunta.get(p.id) ?? [], conSolucion)]));
  return ids.map((id) => porId.get(id)).filter(Boolean);
}

function formatear(p, opciones, conSolucion) {
  const pregunta = {
    id: p.id,
    codigo: p.codigo,
    enunciado: p.enunciado,
    imagen: p.imagen_url ? { url: p.imagen_url, alt: p.imagen_alt || '' } : null,
    dificultad: p.dificultad,
    competencia: p.competencia,
    tiempo_estimado_seg: p.tiempo_estimado_seg,
    origen: p.origen,
    materia: { id: p.materia_id, slug: p.materia_slug, nombre: p.materia_nombre, color: p.materia_color, icono: p.materia_icono },
    subtema: { id: p.subtema_id, slug: p.subtema_slug, nombre: p.subtema_nombre },
    contexto: p.contexto_id
      ? {
        id: p.contexto_id,
        titulo: p.contexto_titulo,
        contenido: p.contexto_contenido,
        imagen: p.contexto_imagen ? { url: p.contexto_imagen, alt: p.contexto_imagen_alt || '' } : null,
        fuente: p.contexto_fuente,
      }
      : null,
    opciones: opciones.map((o) => ({
      id: o.id,
      letra: o.letra,
      texto: o.texto,
      ...(conSolucion ? { es_correcta: o.es_correcta, retroalimentacion: o.retroalimentacion } : {}),
    })),
  };
  if (conSolucion) pregunta.explicacion = p.explicacion;
  return pregunta;
}
