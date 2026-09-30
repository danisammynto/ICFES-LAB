/**
 * Rachas de estudio y actividad diaria.
 *
 * Cada acción de estudio (responder, completar lección, simulacro, conversar con Vanty)
 * llama a `registrarEstudio`, que acumula la actividad del día y actualiza la racha:
 *   · estudió ayer          → racha + 1
 *   · faltó n días ≤ protectores → se consumen protectores y la racha continúa
 *   · faltó más días        → la racha vuelve a 1
 * Al alcanzar hitos (3, 7, 14, 30, 60, 100 días) entrega recompensas especiales.
 */
import { pool, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { diasEntre, fechaLocal, sumarDias } from '../utils/fechas.js';
import { darInsignia, otorgar } from './gamificacion.service.js';

/**
 * Suma actividad al día de hoy y actualiza la racha.
 * @returns {Promise<object[]>} eventos (racha, protector_usado, recompensa_racha, xp…)
 */
export async function registrarEstudio(cliente, usuarioId, actividad = {}) {
  const { segundos = 0, preguntas = 0, correctas = 0, lecciones = 0, simulacros = 0 } = actividad;
  const hoy = fechaLocal();

  await cliente.query(
    `INSERT INTO actividad_diaria
       (usuario_id, fecha, segundos_estudio, preguntas_respondidas, correctas, lecciones_completadas, simulacros_completados)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (usuario_id, fecha) DO UPDATE SET
       segundos_estudio       = actividad_diaria.segundos_estudio + EXCLUDED.segundos_estudio,
       preguntas_respondidas  = actividad_diaria.preguntas_respondidas + EXCLUDED.preguntas_respondidas,
       correctas              = actividad_diaria.correctas + EXCLUDED.correctas,
       lecciones_completadas  = actividad_diaria.lecciones_completadas + EXCLUDED.lecciones_completadas,
       simulacros_completados = actividad_diaria.simulacros_completados + EXCLUDED.simulacros_completados`,
    [usuarioId, hoy, Math.max(0, Math.round(segundos)), preguntas, correctas, lecciones, simulacros],
  );

  return actualizarRacha(cliente, usuarioId, hoy);
}

async function actualizarRacha(cliente, usuarioId, hoy) {
  const eventos = [];
  const racha = await una(
    `SELECT actual, maxima, ultima_fecha, protectores, inicio_racha
       FROM rachas WHERE usuario_id = $1 FOR UPDATE`,
    [usuarioId],
    cliente,
  );
  if (!racha || racha.ultima_fecha === hoy) return eventos; // Ya contó el día de hoy.

  let { actual, maxima, protectores, inicio_racha: inicio } = racha;

  if (!racha.ultima_fecha) {
    actual = 1;
    inicio = hoy;
  } else {
    const diasPerdidos = diasEntre(racha.ultima_fecha, hoy) - 1;
    if (diasPerdidos <= 0) {
      actual += 1;
    } else if (diasPerdidos <= protectores) {
      protectores -= diasPerdidos;
      actual += 1;
      eventos.push({ tipo: 'protector_usado', cantidad: diasPerdidos, restantes: protectores });
    } else {
      if (actual > 1) eventos.push({ tipo: 'racha_perdida', dias: actual });
      actual = 1;
      inicio = hoy;
    }
  }
  const esRecord = actual > maxima;
  maxima = Math.max(maxima, actual);

  await cliente.query(
    `UPDATE rachas
        SET actual = $2, maxima = $3, ultima_fecha = $4, protectores = $5, inicio_racha = $6, actualizado_en = now()
      WHERE usuario_id = $1`,
    [usuarioId, actual, maxima, hoy, protectores, inicio],
  );
  eventos.push({ tipo: 'racha', dias: actual, record: esRecord && actual > 1 });

  // XP diario por mantener la constancia.
  eventos.push(...(await otorgar(cliente, usuarioId, { xp: REGLAS.xp.rachaDiaria, motivo: 'racha_diaria', referencia: hoy })));

  // Recompensas especiales por hitos de racha (una sola vez por hito).
  const hitos = await varias(
    `SELECT r.dias, r.nombre, r.xp, r.monedas, r.protectores, r.insignia_id,
            i.nombre AS insignia_nombre, i.icono AS insignia_icono, i.color AS insignia_color
       FROM recompensas_racha r
       LEFT JOIN insignias i ON i.id = r.insignia_id
      WHERE r.dias <= $2
        AND NOT EXISTS (SELECT 1 FROM usuario_recompensas_racha u WHERE u.usuario_id = $1 AND u.dias = r.dias)
      ORDER BY r.dias`,
    [usuarioId, actual],
    cliente,
  );

  for (const hito of hitos) {
    await cliente.query(`INSERT INTO usuario_recompensas_racha (usuario_id, dias) VALUES ($1, $2)`, [usuarioId, hito.dias]);
    if (hito.protectores) {
      await cliente.query(
        `UPDATE rachas SET protectores = LEAST($2, protectores + $3) WHERE usuario_id = $1`,
        [usuarioId, REGLAS.topes.protectoresRacha, hito.protectores],
      );
    }
    const insigniaNueva = hito.insignia_id ? await darInsignia(cliente, usuarioId, hito.insignia_id) : false;
    const eventosRecompensa = await otorgar(cliente, usuarioId, {
      xp: hito.xp,
      monedas: hito.monedas,
      motivo: 'recompensa_racha',
      referencia: `racha:${hito.dias}`,
    });
    eventos.push({
      tipo: 'recompensa_racha',
      dias: hito.dias,
      nombre: hito.nombre,
      xp: hito.xp,
      monedas: hito.monedas,
      protectores: hito.protectores,
      insignia: insigniaNueva ? { nombre: hito.insignia_nombre, icono: hito.insignia_icono, color: hito.insignia_color } : null,
    });
    eventos.push(...eventosRecompensa.filter((e) => e.tipo === 'nivel'));
  }
  return eventos;
}

/**
 * Estado de la racha para mostrar: si el estudiante no estudió ayer ni hoy (y no tiene
 * protectores suficientes) la racha vigente es 0 aunque la tabla aún guarde el valor anterior.
 */
export async function estadoRacha(usuarioId, cliente = pool) {
  const r = await una(
    `SELECT actual, maxima, ultima_fecha, protectores, inicio_racha FROM rachas WHERE usuario_id = $1`,
    [usuarioId],
    cliente,
  );
  const hoy = fechaLocal();
  let vigente = 0;
  let enRiesgo = false;
  if (r?.ultima_fecha) {
    const diasPerdidos = diasEntre(r.ultima_fecha, hoy) - 1; // -1 = hoy, 0 = ayer
    if (diasPerdidos <= 0) {
      vigente = r.actual;
      enRiesgo = diasPerdidos === 0;
    } else if (diasPerdidos <= r.protectores) {
      vigente = r.actual;
      enRiesgo = true;
    }
  }
  const proxima = await una(
    `SELECT dias, nombre, xp, monedas, protectores FROM recompensas_racha
      WHERE dias > $1 ORDER BY dias LIMIT 1`,
    [vigente],
    cliente,
  );
  return {
    actual: vigente,
    maxima: r?.maxima ?? 0,
    protectores: r?.protectores ?? 0,
    estudio_hoy: r?.ultima_fecha === hoy,
    en_riesgo: enRiesgo && r?.ultima_fecha !== hoy,
    inicio: vigente ? r.inicio_racha : null,
    proxima_recompensa: proxima ? { ...proxima, faltan: proxima.dias - vigente } : null,
  };
}

/**
 * Calendario de actividad de las últimas `semanas` semanas (tipo mapa de calor).
 * nivel: 0 sin estudio · 1 < 15 min · 2 < 30 min · 3 < 60 min · 4 ≥ 60 min
 */
export async function calendarioActividad(usuarioId, semanas = 16, cliente = pool) {
  const hoy = fechaLocal();
  const desde = sumarDias(hoy, -(semanas * 7 - 1));
  const filas = await varias(
    `SELECT fecha, segundos_estudio, xp_ganado, preguntas_respondidas
       FROM actividad_diaria
      WHERE usuario_id = $1 AND fecha BETWEEN $2 AND $3`,
    [usuarioId, desde, hoy],
    cliente,
  );
  const porFecha = new Map(filas.map((f) => [f.fecha, f]));
  const dias = [];
  for (let i = 0; i < semanas * 7; i += 1) {
    const fecha = sumarDias(desde, i);
    const f = porFecha.get(fecha);
    const minutos = f ? Math.round(f.segundos_estudio / 60) : 0;
    const activo = Boolean(f && (f.preguntas_respondidas > 0 || f.segundos_estudio > 0 || f.xp_ganado > 0));
    let nivel = 0;
    if (activo) nivel = minutos >= 60 ? 4 : minutos >= 30 ? 3 : minutos >= 15 ? 2 : 1;
    dias.push({ fecha, minutos, xp: f?.xp_ganado ?? 0, preguntas: f?.preguntas_respondidas ?? 0, nivel });
  }
  return dias;
}
