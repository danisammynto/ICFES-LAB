/**
 * Catálogo académico con el avance del estudiante.
 *
 * Avance de un subtema (0–100) = 30 % lecciones completadas + 70 % dominio.
 * Avance de una materia = promedio del avance de sus subtemas.
 */
import { una, varias } from '../config/db.js';
import { noEncontrado } from '../utils/AppError.js';

const CTE_AVANCE = `
  WITH lecciones_subtema AS (
    SELECT s.id AS subtema_id,
           count(l.id) AS total_lecciones,
           count(lc.leccion_id) AS lecciones_hechas
      FROM subtemas s
      LEFT JOIN lecciones l ON l.subtema_id = s.id AND l.activa
      LEFT JOIN lecciones_completadas lc ON lc.leccion_id = l.id AND lc.usuario_id = $1
     GROUP BY s.id
  ), avance AS (
    SELECT s.id AS subtema_id, t.materia_id, s.nivel_requerido,
           ls.total_lecciones, ls.lecciones_hechas,
           coalesce(p.dominio, 0) AS dominio,
           coalesce(p.respondidas, 0) AS respondidas,
           coalesce(p.correctas, 0) AS correctas,
           coalesce(p.completado, FALSE) AS completado,
           (CASE WHEN ls.total_lecciones > 0 THEN 30.0 * ls.lecciones_hechas / ls.total_lecciones ELSE 0 END)
             + 0.7 * coalesce(p.dominio, 0) AS avance
      FROM subtemas s
      JOIN temas t ON t.id = s.tema_id
      JOIN lecciones_subtema ls ON ls.subtema_id = s.id
      LEFT JOIN progreso p ON p.subtema_id = s.id AND p.usuario_id = $1
  )`;

/** Materias con avance, precisión y la próxima lección sugerida ("Continuar lección"). */
export async function listarMaterias(usuarioId) {
  const { nivel } = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1`, [usuarioId]);

  const materias = await varias(
    `${CTE_AVANCE}
     SELECT m.id, m.slug, m.nombre, m.nombre_corto, m.descripcion, m.color, m.icono, m.orden, m.peso_global,
            round(avg(a.avance))::int AS progreso,
            count(*) AS subtemas,
            count(*) FILTER (WHERE a.completado) AS subtemas_completados,
            count(*) FILTER (WHERE a.nivel_requerido > $2) AS subtemas_bloqueados,
            sum(a.total_lecciones)::int AS lecciones,
            sum(a.lecciones_hechas)::int AS lecciones_completadas,
            sum(a.respondidas)::int AS respondidas,
            sum(a.correctas)::int AS correctas
       FROM materias m
       JOIN avance a ON a.materia_id = m.id
      GROUP BY m.id
      ORDER BY m.orden`,
    [usuarioId, nivel],
  );

  const siguientes = await varias(
    `SELECT DISTINCT ON (t.materia_id)
            t.materia_id, l.id, l.titulo, s.nombre AS subtema, s.slug AS subtema_slug
       FROM lecciones l
       JOIN subtemas s ON s.id = l.subtema_id
       JOIN temas t ON t.id = s.tema_id
      WHERE l.activa AND s.nivel_requerido <= $2
        AND NOT EXISTS (SELECT 1 FROM lecciones_completadas lc WHERE lc.leccion_id = l.id AND lc.usuario_id = $1)
      ORDER BY t.materia_id, t.orden, s.orden, l.orden`,
    [usuarioId, nivel],
  );
  const siguientePorMateria = new Map(siguientes.map((s) => [s.materia_id, s]));

  return materias.map((m) => ({
    ...m,
    precision: m.respondidas ? Math.round((100 * m.correctas) / m.respondidas) : null,
    siguiente_leccion: siguientePorMateria.get(m.id)
      ? {
        id: siguientePorMateria.get(m.id).id,
        titulo: siguientePorMateria.get(m.id).titulo,
        subtema: siguientePorMateria.get(m.id).subtema,
      }
      : null,
  }));
}

/** Detalle de una materia: temas → subtemas → lecciones, con bloqueos y progreso. */
export async function detalleMateria(usuarioId, slug) {
  const { nivel } = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1`, [usuarioId]);
  const materia = await una(
    `SELECT id, slug, nombre, nombre_corto, descripcion, color, icono, peso_global FROM materias WHERE slug = $1`,
    [slug],
  );
  if (!materia) throw noEncontrado('La materia no existe.');

  const subtemas = await varias(
    `${CTE_AVANCE}
     SELECT t.id AS tema_id, t.slug AS tema_slug, t.nombre AS tema_nombre, t.descripcion AS tema_descripcion, t.orden AS tema_orden,
            s.id, s.slug, s.nombre, s.descripcion, s.icono, s.nivel_requerido, s.orden,
            a.total_lecciones, a.lecciones_hechas, a.dominio, a.respondidas, a.correctas, a.completado,
            round(a.avance)::int AS avance,
            (SELECT count(*) FROM preguntas q WHERE q.subtema_id = s.id AND q.activa AND q.publica)::int AS preguntas
       FROM subtemas s
       JOIN temas t ON t.id = s.tema_id
       JOIN avance a ON a.subtema_id = s.id
      WHERE t.materia_id = $2
      ORDER BY t.orden, s.orden`,
    [usuarioId, materia.id],
  );

  const lecciones = await varias(
    `SELECT l.id, l.subtema_id, l.codigo, l.titulo, l.resumen, l.duracion_min, l.xp_recompensa, l.orden,
            lc.completada_en IS NOT NULL AS completada
       FROM lecciones l
       JOIN subtemas s ON s.id = l.subtema_id
       JOIN temas t ON t.id = s.tema_id
       LEFT JOIN lecciones_completadas lc ON lc.leccion_id = l.id AND lc.usuario_id = $1
      WHERE t.materia_id = $2 AND l.activa
      ORDER BY l.orden`,
    [usuarioId, materia.id],
  );

  const temas = [];
  for (const s of subtemas) {
    let tema = temas.find((t) => t.id === s.tema_id);
    if (!tema) {
      tema = { id: s.tema_id, slug: s.tema_slug, nombre: s.tema_nombre, descripcion: s.tema_descripcion, subtemas: [] };
      temas.push(tema);
    }
    tema.subtemas.push({
      id: s.id,
      slug: s.slug,
      nombre: s.nombre,
      descripcion: s.descripcion,
      icono: s.icono,
      nivel_requerido: s.nivel_requerido,
      bloqueado: s.nivel_requerido > nivel,
      preguntas: s.preguntas,
      progreso: {
        avance: s.avance,
        dominio: Math.round(s.dominio),
        respondidas: s.respondidas,
        correctas: s.correctas,
        completado: s.completado,
        lecciones: s.total_lecciones,
        lecciones_completadas: s.lecciones_hechas,
      },
      lecciones: lecciones.filter((l) => l.subtema_id === s.id).map(({ subtema_id: _omitido, ...l }) => l),
    });
  }

  const avanceMateria = subtemas.length
    ? Math.round(subtemas.reduce((suma, s) => suma + s.avance, 0) / subtemas.length)
    : 0;

  return { ...materia, nivel_usuario: nivel, progreso: avanceMateria, temas };
}
