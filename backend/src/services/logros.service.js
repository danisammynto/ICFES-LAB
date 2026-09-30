/**
 * Motor de logros.
 *
 * Cada logro define un `criterio` (métrica) y una `meta`. Tras cada acción del estudiante
 * se calculan las métricas y se desbloquean los logros alcanzados, entregando su XP,
 * monedas e insignia. Como un logro puede subir de nivel al estudiante (y eso puede
 * desbloquear otro logro), la evaluación se repite hasta que no haya novedades.
 */
import { pool, una, varias } from '../config/db.js';
import { HORARIOS_ESPECIALES, REGLAS } from '../config/reglas.js';
import { horaLocal } from '../utils/fechas.js';
import { darInsignia, otorgar } from './gamificacion.service.js';

const CONSULTA_METRICAS = `
  SELECT
    (SELECT count(*) FROM respuestas WHERE usuario_id = $1)                        AS respuestas_total,
    (SELECT count(*) FROM respuestas WHERE usuario_id = $1 AND es_correcta)        AS correctas_total,
    (SELECT count(*) FROM lecciones_completadas WHERE usuario_id = $1)             AS lecciones_total,
    (SELECT maxima FROM rachas WHERE usuario_id = $1)                              AS racha,
    (SELECT count(*) FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
      WHERE r.usuario_id = $1 AND s.tipo IN ('completo', 'mini'))                  AS simulacros_total,
    (SELECT coalesce(max(r.puntaje_global), 0) FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
      WHERE r.usuario_id = $1 AND s.tipo = 'completo')                             AS puntaje_simulacro_completo,
    (SELECT count(*) FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
      WHERE r.usuario_id = $1 AND s.tipo = 'mini' AND r.total > 0 AND r.aciertos = r.total) AS mini_perfecto,
    (SELECT count(*) FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
      WHERE r.usuario_id = $1 AND s.tipo = 'reto' AND r.aprobado)                  AS retos_superados,
    (SELECT count(DISTINCT materia_id) FROM respuestas WHERE usuario_id = $1)      AS materias_distintas,
    (SELECT count(*) FROM progreso
      WHERE usuario_id = $1 AND dominio >= $2 AND respondidas >= $3)               AS subtemas_dominados,
    (SELECT nivel FROM perfiles WHERE usuario_id = $1)                             AS nivel,
    (SELECT count(*) FROM mensajes_vanty WHERE usuario_id = $1 AND rol = 'usuario') AS mensajes_vanty,
    (SELECT count(*) FROM historial_recompensas WHERE usuario_id = $1 AND motivo = 'compra') AS compras`;

function enHorario(hora, { desde, hasta }) {
  return desde < hasta ? hora >= desde && hora < hasta : hora >= desde || hora < hasta;
}

/** Métricas actuales del estudiante. `estudio` indica que la acción actual es de estudio. */
export async function calcularMetricas(usuarioId, { estudio = false } = {}, cliente = pool) {
  const m = await una(
    CONSULTA_METRICAS,
    [usuarioId, REGLAS.dominio.umbralDominado, REGLAS.dominio.minimoRespondidas],
    cliente,
  );
  const hora = horaLocal();
  m.estudio_madrugada = estudio && enHorario(hora, HORARIOS_ESPECIALES.madrugada) ? 1 : 0;
  m.estudio_nocturno = estudio && enHorario(hora, HORARIOS_ESPECIALES.nocturno) ? 1 : 0;
  return m;
}

/**
 * Evalúa y desbloquea logros. Devuelve eventos { tipo: 'logro' } (y 'nivel' si aplica).
 */
export async function evaluarLogros(cliente, usuarioId, { estudio = false } = {}) {
  const eventos = [];
  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    const pendientes = await varias(
      `SELECT l.id, l.codigo, l.nombre, l.descripcion, l.icono, l.criterio, l.meta,
              l.xp_recompensa, l.monedas_recompensa, l.insignia_id,
              i.nombre AS insignia_nombre, i.icono AS insignia_icono, i.color AS insignia_color
         FROM logros l
         LEFT JOIN insignias i ON i.id = l.insignia_id
        WHERE NOT EXISTS (SELECT 1 FROM usuario_logros ul WHERE ul.usuario_id = $1 AND ul.logro_id = l.id)
        ORDER BY l.orden`,
      [usuarioId],
      cliente,
    );
    if (!pendientes.length) break;

    const metricas = await calcularMetricas(usuarioId, { estudio }, cliente);
    const alcanzados = pendientes.filter((l) => (metricas[l.criterio] ?? 0) >= l.meta);
    if (!alcanzados.length) break;

    for (const logro of alcanzados) {
      const { rowCount } = await cliente.query(
        `INSERT INTO usuario_logros (usuario_id, logro_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [usuarioId, logro.id],
      );
      if (!rowCount) continue;

      const insigniaNueva = logro.insignia_id ? await darInsignia(cliente, usuarioId, logro.insignia_id) : false;
      const eventosRecompensa = await otorgar(cliente, usuarioId, {
        xp: logro.xp_recompensa,
        monedas: logro.monedas_recompensa,
        motivo: 'logro',
        referencia: logro.codigo,
      });
      eventos.push({
        tipo: 'logro',
        codigo: logro.codigo,
        nombre: logro.nombre,
        descripcion: logro.descripcion,
        icono: logro.icono,
        xp: logro.xp_recompensa,
        monedas: logro.monedas_recompensa,
        insignia: insigniaNueva
          ? { nombre: logro.insignia_nombre, icono: logro.insignia_icono, color: logro.insignia_color }
          : null,
      });
      eventos.push(...eventosRecompensa.filter((e) => e.tipo === 'nivel'));
    }
  }
  return eventos;
}

/** Lista de logros con su progreso (los secretos se ocultan hasta desbloquearse). */
export async function listarLogros(usuarioId) {
  const logros = await varias(
    `SELECT l.id, l.codigo, l.nombre, l.descripcion, l.icono, l.categoria, l.criterio, l.meta,
            l.xp_recompensa, l.monedas_recompensa, l.secreto,
            ul.desbloqueado_en,
            i.nombre AS insignia_nombre, i.icono AS insignia_icono, i.color AS insignia_color
       FROM logros l
       LEFT JOIN usuario_logros ul ON ul.logro_id = l.id AND ul.usuario_id = $1
       LEFT JOIN insignias i ON i.id = l.insignia_id
      ORDER BY l.orden`,
    [usuarioId],
  );
  const metricas = await calcularMetricas(usuarioId);

  return logros.map((l) => {
    const desbloqueado = Boolean(l.desbloqueado_en);
    const oculto = l.secreto && !desbloqueado;
    const valor = desbloqueado ? l.meta : Math.min(l.meta, Number(metricas[l.criterio] ?? 0));
    return {
      id: l.id,
      codigo: l.codigo,
      nombre: oculto ? 'Logro secreto' : l.nombre,
      descripcion: oculto ? 'Sigue estudiando para descubrirlo.' : l.descripcion,
      icono: oculto ? 'circle-help' : l.icono,
      categoria: l.categoria,
      secreto: l.secreto,
      desbloqueado,
      desbloqueado_en: l.desbloqueado_en,
      progreso: { valor, meta: l.meta, porcentaje: Math.round((100 * valor) / l.meta) },
      recompensa: { xp: l.xp_recompensa, monedas: l.monedas_recompensa },
      insignia: l.insignia_nombre && !oculto
        ? { nombre: l.insignia_nombre, icono: l.insignia_icono, color: l.insignia_color }
        : null,
    };
  });
}
