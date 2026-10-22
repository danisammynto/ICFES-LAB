/**
 * Requisitos de nivel.
 *
 * Además de la XP mínima, cada nivel exige avances académicos reales (columna
 * `niveles.requisitos`, definida en database/seed.sql):
 *   dias_activos  días con actividad de estudio
 *   respondidas   preguntas respondidas (práctica, lecciones, simulacros, retos y Vanty)
 *   precision     porcentaje de aciertos sobre todas las respuestas
 *   temario_area  porcentaje de temas completados en CADA una de las 5 áreas del temario vigente
 *                 (Lectura Crítica, Matemáticas, Sociales y Ciudadanas, Ciencias Naturales, Inglés)
 *   actividades   porcentaje de todas las actividades de la plataforma completadas:
 *                 lecciones, temas, minisimulacros, simulacros completos y retos
 *
 * Un tema está completado cuando su lección está hecha y el dominio llega al 60 % (tabla `progreso`).
 */
import { pool, una, varias } from '../config/db.js';

const porcentaje = (parte, total) => (total > 0 ? Math.round((1000 * parte) / total) / 10 : 0);

/** Métricas del estudiante que usan los requisitos de nivel (y algunos logros). */
export async function metricasNivel(usuarioId, cliente = pool) {
  const [generales, areas, actividades] = await Promise.all([
    una(
      `SELECT p.xp,
              (SELECT count(*) FROM actividad_diaria WHERE usuario_id = $1)::int AS dias_activos,
              (SELECT count(*) FROM respuestas WHERE usuario_id = $1)::int AS respondidas,
              (SELECT count(*) FROM respuestas WHERE usuario_id = $1 AND es_correcta)::int AS correctas
         FROM perfiles p WHERE p.usuario_id = $1`,
      [usuarioId],
      cliente,
    ),
    varias(
      `SELECT m.slug, m.nombre,
              count(s.id)::int AS total,
              count(s.id) FILTER (WHERE pr.completado)::int AS completados
         FROM materias m
         JOIN temas t ON t.materia_id = m.id AND t.activo
         JOIN subtemas s ON s.tema_id = t.id AND s.activo
         LEFT JOIN progreso pr ON pr.subtema_id = s.id AND pr.usuario_id = $1
        GROUP BY m.id
        ORDER BY m.orden`,
      [usuarioId],
      cliente,
    ),
    una(
      `SELECT (SELECT count(*) FROM lecciones l JOIN subtemas s ON s.id = l.subtema_id AND s.activo
                WHERE l.activa)::int AS lecciones_total,
              (SELECT count(*) FROM lecciones_completadas lc
                 JOIN lecciones l ON l.id = lc.leccion_id AND l.activa
                 JOIN subtemas s ON s.id = l.subtema_id AND s.activo
                WHERE lc.usuario_id = $1)::int AS lecciones_hechas,
              (SELECT count(*) FROM simulacros WHERE activo AND tipo = 'mini')::int AS minis_total,
              (SELECT count(DISTINCT r.simulacro_id) FROM resultados r
                 JOIN simulacros s ON s.id = r.simulacro_id AND s.activo AND s.tipo = 'mini'
                WHERE r.usuario_id = $1)::int AS minis_hechos,
              (SELECT count(*) FROM simulacros WHERE activo AND tipo = 'completo')::int AS completos_total,
              (SELECT count(DISTINCT r.simulacro_id) FROM resultados r
                 JOIN simulacros s ON s.id = r.simulacro_id AND s.activo AND s.tipo = 'completo'
                WHERE r.usuario_id = $1)::int AS completos_hechos,
              (SELECT count(*) FROM simulacros WHERE activo AND tipo = 'reto')::int AS retos_total,
              (SELECT count(DISTINCT r.simulacro_id) FROM resultados r
                 JOIN simulacros s ON s.id = r.simulacro_id AND s.activo AND s.tipo = 'reto'
                WHERE r.usuario_id = $1 AND r.aprobado)::int AS retos_hechos`,
      [usuarioId],
      cliente,
    ),
  ]);

  const temario = areas.map((a) => ({ ...a, porcentaje: porcentaje(a.completados, a.total) }));
  const temasTotal = temario.reduce((s, a) => s + a.total, 0);
  const temasHechos = temario.reduce((s, a) => s + a.completados, 0);
  const detalle = [
    { clave: 'lecciones', etiqueta: 'Lecciones', hechas: actividades.lecciones_hechas, total: actividades.lecciones_total },
    { clave: 'temas', etiqueta: 'Temas completados', hechas: temasHechos, total: temasTotal },
    { clave: 'minis', etiqueta: 'Minisimulacros', hechas: actividades.minis_hechos, total: actividades.minis_total },
    { clave: 'simulacros', etiqueta: 'Simulacros completos', hechas: actividades.completos_hechos, total: actividades.completos_total },
    { clave: 'retos', etiqueta: 'Retos superados', hechas: actividades.retos_hechos, total: actividades.retos_total },
  ];
  const hechas = detalle.reduce((s, d) => s + Math.min(d.hechas, d.total), 0);
  const total = detalle.reduce((s, d) => s + d.total, 0);

  return {
    xp: generales.xp,
    dias_activos: generales.dias_activos,
    respondidas: generales.respondidas,
    correctas: generales.correctas,
    precision: porcentaje(generales.correctas, generales.respondidas),
    temario: {
      areas: temario,
      completados: temasHechos,
      total: temasTotal,
      porcentaje: porcentaje(temasHechos, temasTotal),
      // El área con menor avance es la que decide el requisito "en cada área".
      minimo_area: temario.length ? Math.min(...temario.map((a) => a.porcentaje)) : 0,
    },
    actividades: { hechas, total, porcentaje: porcentaje(hechas, total), detalle },
  };
}

const formato = (n) => new Intl.NumberFormat('es-CO').format(n);

/**
 * Lista de requisitos de un nivel con el valor actual del estudiante (si se pasan las métricas).
 * @returns {{ clave, etiqueta, meta, actual, cumplido, texto, detalle? }[]}
 */
export function requisitosDeNivel(nivel, metricas = null) {
  const r = nivel.requisitos ?? {};
  const lista = [];
  const agregar = (clave, etiqueta, meta, actual, texto, detalle) => {
    lista.push({
      clave,
      etiqueta,
      meta,
      actual: metricas ? actual : null,
      cumplido: metricas ? actual >= meta : null,
      texto,
      ...(detalle ? { detalle } : {}),
    });
  };
  agregar('xp', 'Experiencia', nivel.xp_minimo, metricas?.xp, `${formato(nivel.xp_minimo)} XP`);
  if (r.dias_activos) agregar('dias_activos', 'Días de estudio', r.dias_activos, metricas?.dias_activos, `${r.dias_activos} días con actividad de estudio`);
  if (r.respondidas) agregar('respondidas', 'Preguntas respondidas', r.respondidas, metricas?.respondidas, `${formato(r.respondidas)} preguntas respondidas`);
  if (r.precision) agregar('precision', 'Porcentaje de aciertos', r.precision, metricas?.precision, `${r.precision} % de aciertos en tus respuestas`);
  if (r.temario_area) {
    agregar('temario_area', 'Temario en cada área', r.temario_area, metricas?.temario.minimo_area,
      `${r.temario_area} % de los temas completados en cada área: Lectura Crítica, Matemáticas, Sociales y Ciudadanas, Ciencias Naturales e Inglés`,
      metricas?.temario.areas.map((a) => ({ nombre: a.nombre, completados: a.completados, total: a.total, porcentaje: a.porcentaje })));
  }
  if (r.actividades) {
    agregar('actividades', 'Actividades completadas', r.actividades, metricas?.actividades.porcentaje,
      `${r.actividades} % de todas las actividades: lecciones, temas, minisimulacros, simulacros completos y retos`,
      metricas?.actividades.detalle.map((d) => ({ nombre: d.etiqueta, completados: Math.min(d.hechas, d.total), total: d.total })));
  }
  return lista;
}

/** ¿Cumple todos los requisitos del nivel? */
export function cumpleNivel(nivel, metricas) {
  return requisitosDeNivel(nivel, metricas).every((r) => r.cumplido);
}

/** Avance hacia un nivel (0–100): promedio del avance de cada requisito, con tope del 100 %. */
export function avanceHacia(requisitos) {
  if (!requisitos.length) return 100;
  const suma = requisitos.reduce((s, r) => s + Math.min(1, r.meta > 0 ? (r.actual ?? 0) / r.meta : 1), 0);
  return Math.floor((100 * suma) / requisitos.length);
}
