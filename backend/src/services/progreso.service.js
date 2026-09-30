/**
 * Progreso académico: estadísticas diarias por materia y dominio por subtema.
 *
 * Dominio (0–100): promedio móvil exponencial de aciertos. Las primeras respuestas pesan
 * como un promedio simple (α = 1/n) y luego cada nueva respuesta pesa al menos 20 %,
 * de modo que el dominio refleja el rendimiento reciente.
 */
import { una } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { fechaLocal } from '../utils/fechas.js';
import { otorgar } from './gamificacion.service.js';

/** Acumula respuestas en `estadisticas` (usuario × materia × día). */
export async function registrarEstadistica(cliente, usuarioId, materiaId, { respondidas = 1, correctas = 0, tiempoMs = 0 }) {
  await cliente.query(
    `INSERT INTO estadisticas (usuario_id, materia_id, fecha, respondidas, correctas, tiempo_total_ms)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (usuario_id, materia_id, fecha) DO UPDATE SET
       respondidas     = estadisticas.respondidas + EXCLUDED.respondidas,
       correctas       = estadisticas.correctas + EXCLUDED.correctas,
       tiempo_total_ms = estadisticas.tiempo_total_ms + EXCLUDED.tiempo_total_ms`,
    [usuarioId, materiaId, fechaLocal(), respondidas, correctas, Math.round(tiempoMs)],
  );
}

/** Calcula el nuevo dominio aplicando una secuencia de resultados (true/false). */
export function aplicarDominio(dominioInicial, respondidasIniciales, resultados) {
  let dominio = Number(dominioInicial) || 0;
  let respondidas = respondidasIniciales;
  for (const acierto of resultados) {
    const alfa = Math.max(REGLAS.dominio.alfaMinimo, 1 / (respondidas + 1));
    dominio += alfa * ((acierto ? 100 : 0) - dominio);
    respondidas += 1;
  }
  return Math.round(dominio * 100) / 100;
}

/**
 * Actualiza el progreso de un subtema con nuevos resultados y comprueba si quedó completado.
 * @returns {Promise<object[]>} eventos (subtema_completado, xp…)
 */
export async function actualizarProgreso(cliente, usuarioId, subtemaId, resultados) {
  const fila = await una(
    `INSERT INTO progreso (usuario_id, subtema_id) VALUES ($1, $2)
     ON CONFLICT (usuario_id, subtema_id) DO UPDATE SET ultima_actividad = now()
     RETURNING respondidas, correctas, dominio`,
    [usuarioId, subtemaId],
    cliente,
  );
  const dominio = aplicarDominio(fila.dominio, fila.respondidas, resultados);
  const aciertos = resultados.filter(Boolean).length;

  await cliente.query(
    `UPDATE progreso
        SET respondidas = respondidas + $3, correctas = correctas + $4, dominio = $5, ultima_actividad = now()
      WHERE usuario_id = $1 AND subtema_id = $2`,
    [usuarioId, subtemaId, resultados.length, aciertos, dominio],
  );
  return verificarSubtemaCompletado(cliente, usuarioId, subtemaId);
}

/** Recalcula cuántas lecciones del subtema completó el estudiante. */
export async function sincronizarLecciones(cliente, usuarioId, subtemaId) {
  await cliente.query(
    `INSERT INTO progreso (usuario_id, subtema_id, lecciones_completadas)
     SELECT $1, $2, count(*)
       FROM lecciones_completadas lc JOIN lecciones l ON l.id = lc.leccion_id
      WHERE lc.usuario_id = $1 AND l.subtema_id = $2
     ON CONFLICT (usuario_id, subtema_id) DO UPDATE
       SET lecciones_completadas = EXCLUDED.lecciones_completadas, ultima_actividad = now()`,
    [usuarioId, subtemaId],
  );
  return verificarSubtemaCompletado(cliente, usuarioId, subtemaId);
}

/**
 * Un subtema queda completado cuando el estudiante terminó todas sus lecciones y su
 * dominio supera el umbral. Entrega una recompensa única.
 */
async function verificarSubtemaCompletado(cliente, usuarioId, subtemaId) {
  const estado = await una(
    `SELECT p.completado, p.dominio, p.respondidas, p.lecciones_completadas,
            s.slug, s.nombre,
            (SELECT count(*) FROM lecciones l WHERE l.subtema_id = s.id AND l.activa) AS total_lecciones
       FROM progreso p JOIN subtemas s ON s.id = p.subtema_id
      WHERE p.usuario_id = $1 AND p.subtema_id = $2
      FOR UPDATE OF p`,
    [usuarioId, subtemaId],
    cliente,
  );
  if (!estado || estado.completado) return [];

  const leccionesListas = estado.lecciones_completadas >= estado.total_lecciones;
  const dominioSuficiente = estado.dominio >= REGLAS.dominio.umbralCompletado
    && estado.respondidas >= REGLAS.dominio.minimoRespondidas;
  if (!leccionesListas || !dominioSuficiente) return [];

  await cliente.query(
    `UPDATE progreso SET completado = TRUE, completado_en = now() WHERE usuario_id = $1 AND subtema_id = $2`,
    [usuarioId, subtemaId],
  );
  const eventos = await otorgar(cliente, usuarioId, {
    xp: REGLAS.xp.subtemaCompletado,
    monedas: REGLAS.monedas.subtemaCompletado,
    motivo: 'subtema_completado',
    referencia: estado.slug,
  });
  return [{ tipo: 'subtema_completado', subtema: { slug: estado.slug, nombre: estado.nombre } }, ...eventos];
}
