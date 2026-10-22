/**
 * Módulo de analítica: datos del dashboard y del análisis inteligente ("Avance").
 */
import { una, varias } from '../config/db.js';
import { fechaLocal, inicioSemana, sumarDias } from '../utils/fechas.js';
import { porcentaje } from '../utils/texto.js';
import { progresoNivel } from './gamificacion.service.js';
import { calendarioActividad, estadoRacha } from './racha.service.js';
import { fechaIcfes } from './config.service.js';
import { listarMaterias } from './catalogo.service.js';
import { leccionDelDia } from './lecciones.service.js';
import { estimarPuntajes } from './puntaje.service.js';
import { construirContexto } from './vanty/contexto.js';
import { generarRecomendaciones } from './vanty/recomendaciones.js';
import { mensajeDelDia } from './vanty/motivacion.js';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Horas estudiadas por día en la semana actual (lunes a domingo). */
async function horasSemana(usuarioId, metaDiariaMin) {
  const lunes = inicioSemana(fechaLocal());
  const filas = await varias(
    `SELECT fecha, segundos_estudio FROM actividad_diaria
      WHERE usuario_id = $1 AND fecha BETWEEN $2 AND $3`,
    [usuarioId, lunes, sumarDias(lunes, 6)],
  );
  const porFecha = new Map(filas.map((f) => [f.fecha, f.segundos_estudio]));
  const dias = DIAS.map((etiqueta, i) => {
    const fecha = sumarDias(lunes, i);
    return { fecha, etiqueta, horas: Math.round(((porFecha.get(fecha) ?? 0) / 3600) * 100) / 100 };
  });
  const total = dias.reduce((s, d) => s + d.horas, 0);
  return {
    dias,
    total_horas: Math.round(total * 10) / 10,
    meta_horas: Math.round(((metaDiariaMin * 7) / 60) * 10) / 10,
  };
}

/** Serie semanal (últimas n semanas) de precisión, preguntas y minutos. */
async function evolucionSemanal(usuarioId, semanas = 8) {
  const primerLunes = sumarDias(inicioSemana(fechaLocal()), -7 * (semanas - 1));
  const respuestas = await varias(
    `SELECT date_trunc('week', fecha::timestamp)::date AS semana,
            sum(respondidas)::int AS respondidas, sum(correctas)::int AS correctas,
            sum(tiempo_total_ms) AS tiempo_ms
       FROM estadisticas WHERE usuario_id = $1 AND fecha >= $2
      GROUP BY 1`,
    [usuarioId, primerLunes],
  );
  const actividad = await varias(
    `SELECT date_trunc('week', fecha::timestamp)::date AS semana,
            sum(segundos_estudio)::int AS segundos, sum(xp_ganado)::int AS xp
       FROM actividad_diaria WHERE usuario_id = $1 AND fecha >= $2
      GROUP BY 1`,
    [usuarioId, primerLunes],
  );
  const r = new Map(respuestas.map((x) => [x.semana, x]));
  const a = new Map(actividad.map((x) => [x.semana, x]));

  return Array.from({ length: semanas }, (_, i) => {
    const semana = sumarDias(primerLunes, 7 * i);
    const [, mes, dia] = semana.split('-');
    const fila = r.get(semana);
    return {
      semana,
      etiqueta: `${Number(dia)} ${MESES[Number(mes) - 1]}`,
      respondidas: fila?.respondidas ?? 0,
      precision: fila?.respondidas ? porcentaje(fila.correctas, fila.respondidas) : null,
      minutos: Math.round((a.get(semana)?.segundos ?? 0) / 60),
      xp: a.get(semana)?.xp ?? 0,
    };
  });
}

/** Serie mensual (últimos n meses). */
async function evolucionMensual(usuarioId, meses = 6) {
  const hoy = fechaLocal();
  const [anio, mes] = hoy.split('-').map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1 - (meses - 1), 1)).toISOString().slice(0, 10);
  const respuestas = await varias(
    `SELECT to_char(fecha, 'YYYY-MM') AS mes, sum(respondidas)::int AS respondidas, sum(correctas)::int AS correctas
       FROM estadisticas WHERE usuario_id = $1 AND fecha >= $2 GROUP BY 1`,
    [usuarioId, inicio],
  );
  const actividad = await varias(
    `SELECT to_char(fecha, 'YYYY-MM') AS mes, sum(segundos_estudio)::int AS segundos, count(*)::int AS dias
       FROM actividad_diaria WHERE usuario_id = $1 AND fecha >= $2 GROUP BY 1`,
    [usuarioId, inicio],
  );
  const r = new Map(respuestas.map((x) => [x.mes, x]));
  const a = new Map(actividad.map((x) => [x.mes, x]));
  return Array.from({ length: meses }, (_, i) => {
    const d = new Date(Date.UTC(anio, mes - 1 - (meses - 1) + i, 1));
    const clave = d.toISOString().slice(0, 7);
    const fila = r.get(clave);
    return {
      mes: clave,
      etiqueta: `${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      respondidas: fila?.respondidas ?? 0,
      precision: fila?.respondidas ? porcentaje(fila.correctas, fila.respondidas) : null,
      horas: Math.round(((a.get(clave)?.segundos ?? 0) / 3600) * 10) / 10,
      dias_activos: a.get(clave)?.dias ?? 0,
    };
  });
}

/** Rendimiento por materia (precisión y tiempos) en una ventana de días. */
async function rendimientoPorMateria(usuarioId, dias = 90) {
  return varias(
    `SELECT m.slug, m.nombre, m.nombre_corto, m.color, m.icono,
            count(r.id)::int AS respondidas,
            count(r.id) FILTER (WHERE r.es_correcta)::int AS correctas,
            round(avg(r.tiempo_ms) FILTER (WHERE r.tiempo_ms > 0))::int AS tiempo_promedio_ms,
            round(avg(p.tiempo_estimado_seg) FILTER (WHERE r.tiempo_ms > 0))::int AS tiempo_esperado_seg,
            count(r.id) FILTER (WHERE r.creado_en > now() - interval '14 days')::int AS recientes,
            count(r.id) FILTER (WHERE r.creado_en > now() - interval '14 days' AND r.es_correcta)::int AS recientes_ok,
            count(r.id) FILTER (WHERE r.creado_en <= now() - interval '14 days' AND r.creado_en > now() - interval '28 days')::int AS previas,
            count(r.id) FILTER (WHERE r.creado_en <= now() - interval '14 days' AND r.creado_en > now() - interval '28 days' AND r.es_correcta)::int AS previas_ok
       FROM materias m
       LEFT JOIN respuestas r ON r.materia_id = m.id AND r.usuario_id = $1
                              AND r.creado_en > now() - make_interval(days => $2)
       LEFT JOIN preguntas p ON p.id = r.pregunta_id
      GROUP BY m.id
      ORDER BY m.orden`,
    [usuarioId, dias],
  ).then((filas) => filas.map((f) => ({
    slug: f.slug,
    nombre: f.nombre,
    nombre_corto: f.nombre_corto,
    color: f.color,
    icono: f.icono,
    respondidas: f.respondidas,
    correctas: f.correctas,
    precision: f.respondidas ? porcentaje(f.correctas, f.respondidas) : null,
    tiempo_promedio_seg: f.tiempo_promedio_ms ? Math.round(f.tiempo_promedio_ms / 100) / 10 : null,
    tiempo_esperado_seg: f.tiempo_esperado_seg,
    // Tendencia: precisión de las últimas 2 semanas frente a las 2 anteriores (puntos porcentuales).
    tendencia: f.recientes >= 3 && f.previas >= 3
      ? Math.round(porcentaje(f.recientes_ok, f.recientes) - porcentaje(f.previas_ok, f.previas))
      : null,
  })));
}

/** Rendimiento por subtema (para fortalezas, debilidades y el árbol por tema). */
async function rendimientoPorSubtema(usuarioId, dias = 90) {
  const filas = await varias(
    `SELECT s.slug, s.nombre, s.icono, t.slug AS tema_slug, t.nombre AS tema, t.orden AS tema_orden, s.orden,
            m.slug AS materia_slug, m.nombre AS materia, m.color, m.orden AS materia_orden,
            count(r.id)::int AS respondidas,
            count(r.id) FILTER (WHERE r.es_correcta)::int AS correctas,
            round(avg(r.tiempo_ms) FILTER (WHERE r.tiempo_ms > 0))::int AS tiempo_promedio_ms,
            coalesce(pr.dominio, 0) AS dominio
       FROM subtemas s
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
       LEFT JOIN respuestas r ON r.subtema_id = s.id AND r.usuario_id = $1
                              AND r.creado_en > now() - make_interval(days => $2)
       LEFT JOIN progreso pr ON pr.subtema_id = s.id AND pr.usuario_id = $1
      WHERE s.activo
      GROUP BY s.id, t.id, m.id, pr.dominio
      ORDER BY m.orden, t.orden, s.orden`,
    [usuarioId, dias],
  );
  return filas.map((f) => ({
    ...f,
    precision: f.respondidas ? porcentaje(f.correctas, f.respondidas) : null,
    tiempo_promedio_seg: f.tiempo_promedio_ms ? Math.round(f.tiempo_promedio_ms / 1000) : null,
  }));
}

function fortalezasYDebilidades(subtemas) {
  const fortalezas = subtemas
    .filter((s) => s.respondidas >= 3 && s.precision >= 70)
    .sort((a, b) => b.precision - a.precision || b.respondidas - a.respondidas)
    .slice(0, 4);
  const debilidades = subtemas
    .filter((s) => s.respondidas >= 2 && s.precision < 60)
    .sort((a, b) => a.precision - b.precision || b.respondidas - a.respondidas)
    .slice(0, 4);
  return { fortalezas, debilidades };
}

/** Resumen general: precisión y tiempos de los últimos 30 días + totales históricos. */
async function resumenGeneral(usuarioId) {
  return una(
    `SELECT
       (SELECT count(*) FROM respuestas WHERE usuario_id = $1)::int AS respondidas_total,
       (SELECT count(*) FROM respuestas WHERE usuario_id = $1 AND es_correcta)::int AS correctas_total,
       (SELECT count(*) FROM respuestas WHERE usuario_id = $1 AND creado_en > now() - interval '30 days')::int AS respondidas_30,
       (SELECT count(*) FROM respuestas WHERE usuario_id = $1 AND es_correcta AND creado_en > now() - interval '30 days')::int AS correctas_30,
       (SELECT round(avg(tiempo_ms))::int FROM respuestas WHERE usuario_id = $1 AND tiempo_ms > 0 AND creado_en > now() - interval '30 days') AS tiempo_promedio_ms,
       (SELECT coalesce(sum(segundos_estudio), 0)::int FROM actividad_diaria WHERE usuario_id = $1) AS segundos_total,
       (SELECT count(*) FROM actividad_diaria WHERE usuario_id = $1 AND (preguntas_respondidas > 0 OR segundos_estudio > 0))::int AS dias_estudiados,
       (SELECT count(*) FROM lecciones_completadas WHERE usuario_id = $1)::int AS lecciones,
       (SELECT count(*) FROM resultados WHERE usuario_id = $1)::int AS simulacros`,
    [usuarioId],
  );
}

/** Datos del dashboard principal (Inicio). */
export async function dashboard(usuarioId) {
  const perfil = await una(
    `SELECT u.nombre, p.nombre_mostrar, p.avatar, p.meta_diaria_min, p.meta_puntaje
       FROM usuarios u JOIN perfiles p ON p.usuario_id = u.id WHERE u.id = $1`,
    [usuarioId],
  );
  const icfes = await fechaIcfes(usuarioId);

  const [nivel, racha, calendario, materias, delDia, semana, evolucion, resumen, puntaje, rendimiento, contexto] = await Promise.all([
    progresoNivel(usuarioId),
    estadoRacha(usuarioId),
    calendarioActividad(usuarioId, 16),
    listarMaterias(usuarioId),
    leccionDelDia(usuarioId),
    horasSemana(usuarioId, perfil.meta_diaria_min),
    evolucionSemanal(usuarioId, 8),
    resumenGeneral(usuarioId),
    estimarPuntajes(usuarioId, { fechaExamen: icfes.fecha, meta: perfil.meta_puntaje }),
    rendimientoPorMateria(usuarioId, 90),
    construirContexto(usuarioId),
  ]);

  const general = materias.length ? Math.round(materias.reduce((s, m) => s + m.progreso, 0) / materias.length) : 0;
  const recomendaciones = generarRecomendaciones(contexto).slice(0, 3);
  const diaDeEstudio = racha.estudio_hoy ? racha.actual : racha.actual + 1;

  return {
    usuario: { nombre: perfil.nombre, nombre_mostrar: perfil.nombre_mostrar, avatar: perfil.avatar },
    nivel,
    racha: { ...racha, calendario },
    recordatorio: {
      dia_estudio: diaDeEstudio,
      estudio_hoy: racha.estudio_hoy,
      mensaje: mensajeDelDia({ ...contexto, diaDeEstudio }),
      leccion_del_dia: delDia,
    },
    cuenta_regresiva: icfes,
    progreso: {
      general,
      materias: materias.map((m) => ({ slug: m.slug, nombre: m.nombre, nombre_corto: m.nombre_corto, color: m.color, icono: m.icono, progreso: m.progreso })),
    },
    horas_semana: semana,
    desempeno: rendimiento.map((m) => ({
      slug: m.slug,
      nombre: m.nombre,
      nombre_corto: m.nombre_corto,
      color: m.color,
      precision: m.precision,
      puntaje: puntaje.areas.find((a) => a.slug === m.slug)?.puntaje ?? null,
      tiempo_promedio_seg: m.tiempo_promedio_seg,
    })),
    estadisticas: {
      precision: resumen.respondidas_30 ? porcentaje(resumen.correctas_30, resumen.respondidas_30) : null,
      respondidas_30: resumen.respondidas_30,
      respondidas_total: resumen.respondidas_total,
      tiempo_promedio_seg: resumen.tiempo_promedio_ms ? Math.round(resumen.tiempo_promedio_ms / 100) / 10 : null,
      horas_total: Math.round((resumen.segundos_total / 3600) * 10) / 10,
      dias_estudiados: resumen.dias_estudiados,
    },
    evolucion_semanal: evolucion,
    puntaje_estimado: { global: puntaje.global, proyeccion: puntaje.proyeccion, meta: perfil.meta_puntaje },
    recomendaciones,
  };
}

/** Análisis completo para la sección "Avance". */
export async function analisisCompleto(usuarioId) {
  const perfil = await una(`SELECT meta_puntaje FROM perfiles WHERE usuario_id = $1`, [usuarioId]);
  const icfes = await fechaIcfes(usuarioId);

  const [resumen, materias, subtemas, semanal, mensual, puntaje, errores, simulacros, contexto] = await Promise.all([
    resumenGeneral(usuarioId),
    rendimientoPorMateria(usuarioId, 90),
    rendimientoPorSubtema(usuarioId, 90),
    evolucionSemanal(usuarioId, 12),
    evolucionMensual(usuarioId, 6),
    estimarPuntajes(usuarioId, { fechaExamen: icfes.fecha, meta: perfil.meta_puntaje }),
    erroresFrecuentes(usuarioId),
    varias(
      `SELECT r.intento_id, r.puntaje_global, r.porcentaje, r.creado_en, s.tipo, s.titulo
         FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
        WHERE r.usuario_id = $1 AND s.tipo IN ('completo', 'mini')
        ORDER BY r.creado_en DESC LIMIT 12`,
      [usuarioId],
    ),
    construirContexto(usuarioId),
  ]);

  // Árbol materia → tema → subtema.
  const temas = [];
  for (const s of subtemas) {
    let tema = temas.find((t) => t.slug === s.tema_slug);
    if (!tema) {
      tema = { slug: s.tema_slug, nombre: s.tema, materia_slug: s.materia_slug, materia: s.materia, color: s.color, respondidas: 0, correctas: 0, subtemas: [] };
      temas.push(tema);
    }
    tema.respondidas += s.respondidas;
    tema.correctas += s.correctas;
    tema.subtemas.push({ slug: s.slug, nombre: s.nombre, respondidas: s.respondidas, precision: s.precision, dominio: Math.round(s.dominio), tiempo_promedio_seg: s.tiempo_promedio_seg });
  }
  temas.forEach((t) => { t.precision = t.respondidas ? porcentaje(t.correctas, t.respondidas) : null; });

  return {
    resumen: {
      respondidas: resumen.respondidas_total,
      precision: resumen.respondidas_total ? porcentaje(resumen.correctas_total, resumen.respondidas_total) : null,
      precision_30: resumen.respondidas_30 ? porcentaje(resumen.correctas_30, resumen.respondidas_30) : null,
      tiempo_promedio_seg: resumen.tiempo_promedio_ms ? Math.round(resumen.tiempo_promedio_ms / 100) / 10 : null,
      horas: Math.round((resumen.segundos_total / 3600) * 10) / 10,
      dias_estudiados: resumen.dias_estudiados,
      lecciones: resumen.lecciones,
      simulacros: resumen.simulacros,
    },
    ...fortalezasYDebilidades(subtemas),
    materias: materias.map((m) => ({ ...m, puntaje: puntaje.areas.find((a) => a.slug === m.slug)?.puntaje ?? null })),
    temas,
    evolucion_semanal: semanal,
    evolucion_mensual: mensual,
    puntaje_estimado: puntaje,
    errores_frecuentes: errores,
    simulacros: simulacros.reverse(),
    recomendaciones: generarRecomendaciones(contexto),
    fecha_examen: icfes,
  };
}

/** Preguntas falladas dos o más veces y áreas de error más comunes. */
async function erroresFrecuentes(usuarioId) {
  const preguntas = await varias(
    `SELECT p.id, p.codigo, left(p.enunciado, 160) AS enunciado, s.nombre AS subtema, s.slug AS subtema_slug,
            m.nombre AS materia, m.color,
            count(*) FILTER (WHERE NOT r.es_correcta)::int AS fallos,
            count(*)::int AS intentos,
            bool_or(r.es_correcta) FILTER (WHERE r.creado_en = (SELECT max(r2.creado_en) FROM respuestas r2
                                                              WHERE r2.usuario_id = $1 AND r2.pregunta_id = p.id)) AS ultima_correcta
       FROM respuestas r
       JOIN preguntas p ON p.id = r.pregunta_id
       JOIN subtemas s ON s.id = p.subtema_id
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
      WHERE r.usuario_id = $1 AND r.creado_en > now() - interval '90 days'
      GROUP BY p.id, s.id, m.id
     HAVING count(*) FILTER (WHERE NOT r.es_correcta) >= 2
      ORDER BY fallos DESC, intentos DESC
      LIMIT 8`,
    [usuarioId],
  );
  const competencias = await varias(
    `SELECT p.competencia, m.nombre AS materia, count(*)::int AS fallos
       FROM respuestas r
       JOIN preguntas p ON p.id = r.pregunta_id
       JOIN materias m ON m.id = r.materia_id
      WHERE r.usuario_id = $1 AND NOT r.es_correcta AND r.creado_en > now() - interval '90 days'
        AND p.competencia IS NOT NULL
      GROUP BY p.competencia, m.nombre
      ORDER BY fallos DESC
      LIMIT 5`,
    [usuarioId],
  );
  return { preguntas, competencias };
}
