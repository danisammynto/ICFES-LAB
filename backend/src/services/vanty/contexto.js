/**
 * Perfil de rendimiento del estudiante que analiza Vanty:
 * rendimiento por área y subtema, errores frecuentes, temas débiles, tiempos de respuesta,
 * racha, nivel, simulacros recientes y puntaje estimado.
 *
 * Se usa para: las recomendaciones automáticas, las respuestas del modo local y el
 * contexto que recibe Claude en el modo IA.
 */
import { una, varias } from '../../config/db.js';
import { porcentaje } from '../../utils/texto.js';
import { fechaLocal, diasEntre } from '../../utils/fechas.js';
import { estadoRacha } from '../racha.service.js';
import { fechaIcfes } from '../config.service.js';
import { estimarPuntajes } from '../puntaje.service.js';

export async function construirContexto(usuarioId) {
  const perfil = await una(
    `SELECT u.nombre, p.nombre_mostrar, p.grado, p.nivel, p.xp, p.monedas, p.meta_diaria_min, p.meta_puntaje,
            n.nombre AS nivel_nombre,
            sig.numero AS siguiente_nivel, sig.nombre AS siguiente_nombre, sig.xp_minimo AS siguiente_xp
       FROM usuarios u
       JOIN perfiles p ON p.usuario_id = u.id
       JOIN niveles n ON n.numero = p.nivel
       LEFT JOIN niveles sig ON sig.numero = p.nivel + 1
      WHERE u.id = $1`,
    [usuarioId],
  );
  const icfes = await fechaIcfes(usuarioId);

  const [racha, materias, subtemas, errores, simulacros, hoy, activos7, puntaje, desbloqueos, ultimoError] = await Promise.all([
    estadoRacha(usuarioId),
    varias(
      `SELECT m.slug, m.nombre, count(r.id)::int AS n,
              count(r.id) FILTER (WHERE r.es_correcta)::int AS ok,
              round(avg(r.tiempo_ms) FILTER (WHERE r.tiempo_ms > 0) / 1000.0)::int AS seg,
              round(avg(p.tiempo_estimado_seg) FILTER (WHERE r.tiempo_ms > 0))::int AS seg_esperado
         FROM materias m
         LEFT JOIN respuestas r ON r.materia_id = m.id AND r.usuario_id = $1 AND r.creado_en > now() - interval '90 days'
         LEFT JOIN preguntas p ON p.id = r.pregunta_id
        GROUP BY m.id ORDER BY m.orden`,
      [usuarioId],
    ),
    varias(
      `SELECT s.slug, s.nombre, s.nivel_requerido, m.slug AS materia_slug, m.nombre AS materia,
              count(r.id)::int AS n, count(r.id) FILTER (WHERE r.es_correcta)::int AS ok,
              coalesce(max(pr.dominio), 0) AS dominio
         FROM subtemas s
         JOIN temas t ON t.id = s.tema_id
         JOIN materias m ON m.id = t.materia_id
         LEFT JOIN respuestas r ON r.subtema_id = s.id AND r.usuario_id = $1 AND r.creado_en > now() - interval '90 days'
         LEFT JOIN progreso pr ON pr.subtema_id = s.id AND pr.usuario_id = $1
        WHERE s.activo
        GROUP BY s.id, m.id`,
      [usuarioId],
    ),
    varias(
      `SELECT p.id, p.codigo, left(p.enunciado, 140) AS enunciado, s.nombre AS subtema, m.nombre AS materia,
              count(*)::int AS fallos
         FROM respuestas r
         JOIN preguntas p ON p.id = r.pregunta_id
         JOIN subtemas s ON s.id = p.subtema_id
         JOIN materias m ON m.id = r.materia_id
        WHERE r.usuario_id = $1 AND NOT r.es_correcta AND r.creado_en > now() - interval '60 days'
        GROUP BY p.id, s.id, m.id
        ORDER BY fallos DESC, max(r.creado_en) DESC
        LIMIT 5`,
      [usuarioId],
    ),
    varias(
      `SELECT s.tipo, s.titulo, r.puntaje_global, r.porcentaje, r.creado_en
         FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
        WHERE r.usuario_id = $1 ORDER BY r.creado_en DESC LIMIT 3`,
      [usuarioId],
    ),
    una(
      `SELECT coalesce(segundos_estudio, 0) AS segundos, coalesce(preguntas_respondidas, 0) AS preguntas
         FROM actividad_diaria WHERE usuario_id = $1 AND fecha = $2`,
      [usuarioId, fechaLocal()],
    ),
    una(
      `SELECT count(*)::int AS dias FROM actividad_diaria
        WHERE usuario_id = $1 AND fecha > $2::date - 7`,
      [usuarioId, fechaLocal()],
    ),
    estimarPuntajes(usuarioId, { fechaExamen: icfes.fecha }),
    perfil.siguiente_nivel
      ? varias(
        `SELECT s.nombre FROM subtemas s WHERE s.nivel_requerido = $1 AND s.activo ORDER BY s.nombre`,
        [perfil.siguiente_nivel],
      )
      : Promise.resolve([]),
    una(
      `SELECT r.pregunta_id, r.opcion_id, r.creado_en, p.codigo, s.nombre AS subtema, m.nombre AS materia
         FROM respuestas r
         JOIN preguntas p ON p.id = r.pregunta_id
         JOIN subtemas s ON s.id = p.subtema_id
         JOIN materias m ON m.id = r.materia_id
        WHERE r.usuario_id = $1 AND NOT r.es_correcta
        ORDER BY r.creado_en DESC LIMIT 1`,
      [usuarioId],
    ),
  ]);

  // Precisiones redondeadas: se usan en textos para el estudiante ("llevas 34 % de aciertos").
  const areas = materias.map((m) => ({
    slug: m.slug,
    nombre: m.nombre,
    respondidas: m.n,
    precision: m.n ? Math.round(porcentaje(m.ok, m.n)) : null,
    tiempo_seg: m.seg,
    tiempo_esperado_seg: m.seg_esperado,
    puntaje: puntaje.areas.find((a) => a.slug === m.slug)?.puntaje ?? null,
  }));
  const temas = subtemas.map((s) => ({
    slug: s.slug,
    nombre: s.nombre,
    materia_slug: s.materia_slug,
    materia: s.materia,
    bloqueado: s.nivel_requerido > perfil.nivel,
    respondidas: s.n,
    precision: s.n ? Math.round(porcentaje(s.ok, s.n)) : null,
    dominio: Math.round(s.dominio),
  }));

  const conDatos = temas.filter((t) => t.respondidas >= 2);
  const respondidasTotal = areas.reduce((s, a) => s + a.respondidas, 0);
  const ultimoSimulacro = simulacros[0] ?? null;

  return {
    usuarioId,
    nombre: perfil.nombre_mostrar || perfil.nombre.split(' ')[0],
    nombre_completo: perfil.nombre,
    grado: perfil.grado,
    nivel: { numero: perfil.nivel, nombre: perfil.nivel_nombre, xp: perfil.xp },
    siguiente_nivel: perfil.siguiente_nivel
      ? { numero: perfil.siguiente_nivel, nombre: perfil.siguiente_nombre, faltan: perfil.siguiente_xp - perfil.xp, desbloquea: desbloqueos.map((d) => d.nombre) }
      : null,
    monedas: perfil.monedas,
    meta_diaria_min: perfil.meta_diaria_min,
    meta_puntaje: perfil.meta_puntaje,
    racha,
    icfes,
    hoy: { minutos: Math.round((hoy?.segundos ?? 0) / 60), preguntas: hoy?.preguntas ?? 0 },
    dias_activos_7: activos7?.dias ?? 0,
    respondidas_total: respondidasTotal,
    precision_global: respondidasTotal
      ? porcentaje(areas.reduce((s, a) => s + (a.precision ?? 0) * a.respondidas / 100, 0), respondidasTotal)
      : null,
    areas,
    temas,
    debilidades: conDatos.filter((t) => t.precision < 60).sort((a, b) => a.precision - b.precision).slice(0, 4),
    fortalezas: conDatos.filter((t) => t.precision >= 70 && t.respondidas >= 3).sort((a, b) => b.precision - a.precision).slice(0, 3),
    errores_frecuentes: errores,
    ultimo_error: ultimoError,
    simulacros,
    dias_desde_simulacro: ultimoSimulacro ? diasEntre(fechaLocal(new Date(ultimoSimulacro.creado_en)), fechaLocal()) : null,
    puntaje: puntaje.global,
    proyeccion: puntaje.proyeccion,
  };
}

/** Versión en texto del perfil para el prompt de Claude (solo datos, sin instrucciones). */
export function contextoComoTexto(ctx) {
  const lineas = [];
  lineas.push(`Perfil de rendimiento del estudiante (datos reales de ICFES Lab, fecha ${fechaLocal()}):`);
  lineas.push(`- Nombre: ${ctx.nombre}. Grado: ${ctx.grado ?? 'no indicado'}. Nivel ${ctx.nivel.numero} (${ctx.nivel.nombre}) con ${ctx.nivel.xp} XP.`);
  if (ctx.siguiente_nivel) {
    lineas.push(`- Para el nivel ${ctx.siguiente_nivel.nombre} le faltan ${ctx.siguiente_nivel.faltan} XP, además de cumplir los requisitos de días de estudio, preguntas respondidas, porcentaje de aciertos y avance en el temario (se ven en Logros > Niveles)${ctx.siguiente_nivel.desbloquea.length ? `, que desbloquea: ${ctx.siguiente_nivel.desbloquea.join(', ')}` : ''}.`);
  }
  lineas.push(`- Racha actual: ${ctx.racha.actual} días (récord ${ctx.racha.maxima}). ${ctx.racha.estudio_hoy ? 'Ya estudió hoy' : 'Aún no ha estudiado hoy'} (${ctx.hoy.minutos} de ${ctx.meta_diaria_min} min de su meta diaria). Días activos en la última semana: ${ctx.dias_activos_7}.`);
  if (ctx.icfes.dias != null) {
    lineas.push(`- Faltan ${ctx.icfes.dias} días para su examen ${ctx.icfes.convocatoria ?? 'Saber 11'} (${ctx.icfes.fecha}, ${ctx.icfes.estado === 'citacion' ? 'fecha de su citación' : 'fecha oficial del ICFES'}).`);
  } else if (ctx.icfes.calendario) {
    lineas.push(`- Presentará el ${ctx.icfes.convocatoria}. El ICFES aún no ha publicado una fecha única de aplicación (suele presentarse ${ctx.icfes.meses}): no inventes la fecha.`);
  } else {
    lineas.push('- Aún no ha indicado en qué calendario (A o B) presentará el Saber 11.');
  }
  lineas.push(`- Preguntas respondidas (90 días): ${ctx.respondidas_total}.`);

  const areas = ctx.areas.filter((a) => a.respondidas > 0);
  if (areas.length) {
    lineas.push('- Rendimiento por área (90 días):');
    for (const a of areas) {
      const tiempo = a.tiempo_seg ? `, ${a.tiempo_seg} s por pregunta (esperado ≈ ${a.tiempo_esperado_seg} s)` : '';
      lineas.push(`  · ${a.nombre}: ${a.precision} % de aciertos en ${a.respondidas} preguntas${tiempo}${a.puntaje != null ? `, puntaje estimado ${a.puntaje}/100` : ''}.`);
    }
  }
  const sinPractica = ctx.areas.filter((a) => a.respondidas === 0).map((a) => a.nombre);
  if (sinPractica.length) lineas.push(`- Áreas sin práctica todavía: ${sinPractica.join(', ')}.`);
  if (ctx.debilidades.length) lineas.push(`- Temas débiles: ${ctx.debilidades.map((t) => `${t.nombre} de ${t.materia} (${t.precision} %)`).join('; ')}.`);
  if (ctx.fortalezas.length) lineas.push(`- Temas fuertes: ${ctx.fortalezas.map((t) => `${t.nombre} (${t.precision} %)`).join('; ')}.`);
  if (ctx.errores_frecuentes.length) {
    lineas.push('- Preguntas que más ha fallado:');
    ctx.errores_frecuentes.forEach((e) => lineas.push(`  · [${e.materia} · ${e.subtema}] ${e.enunciado} (falló ${e.fallos} ${e.fallos === 1 ? 'vez' : 'veces'})`));
  }
  if (ctx.simulacros.length) {
    lineas.push(`- Últimos simulacros: ${ctx.simulacros.map((s) => `${s.titulo}: ${s.puntaje_global}/500 (${s.porcentaje} %)`).join('; ')}.`);
  }
  if (ctx.puntaje.puntaje != null) {
    lineas.push(`- Puntaje global estimado: ${ctx.puntaje.puntaje}/500 (confianza ${ctx.puntaje.confianza}${ctx.puntaje.parcial ? ', parcial: faltan áreas' : ''}). Proyección al examen: ${ctx.proyeccion.puntaje ?? 'sin datos'}.`);
  }
  if (ctx.meta_puntaje) lineas.push(`- Meta de puntaje del estudiante: ${ctx.meta_puntaje}/500.`);
  return lineas.join('\n');
}
