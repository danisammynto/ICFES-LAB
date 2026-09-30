/**
 * Puntajes tipo Saber 11.
 *
 * · Puntaje por área (0–100): porcentaje de aciertos ponderado por dificultad.
 * · Puntaje global (0–500): como el ICFES, promedio ponderado de las áreas
 *   (Matemáticas, Lectura Crítica, Sociales y Ciencias pesan 3; Inglés pesa 1) × 5:
 *       global = 5 × (3·MAT + 3·LEC + 3·SOC + 3·CIE + 1·ING) / 13
 * · Puntaje estimado: todas las respuestas recientes, ponderadas por dificultad y por
 *   antigüedad (vida media de 30 días), con un ajuste bayesiano hacia el 50 % cuando hay
 *   pocos datos. Es una estimación orientativa, no el puntaje oficial.
 */
import { pool, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { fechaLocal, inicioSemana, sumarDias, diasEntre } from '../utils/fechas.js';

/** @param {{dificultad:number, correcta:boolean}[]} items */
export function puntajeArea(items) {
  let obtenido = 0;
  let posible = 0;
  for (const item of items) {
    const peso = REGLAS.puntaje.pesoDificultad[item.dificultad] ?? 1;
    posible += peso;
    if (item.correcta) obtenido += peso;
  }
  return posible ? Math.round((100 * obtenido) / posible) : 0;
}

/** @param {{puntaje:number|null, peso:number}[]} areas */
export function puntajeGlobal(areas) {
  const validas = areas.filter((a) => a.puntaje != null);
  const pesoTotal = validas.reduce((suma, a) => suma + a.peso, 0);
  if (!pesoTotal) return 0;
  return Math.round((5 * validas.reduce((suma, a) => suma + a.puntaje * a.peso, 0)) / pesoTotal);
}

export function estrellasPara(porcentaje) {
  return REGLAS.estrellas.filter((umbral) => porcentaje >= umbral).length;
}

/** Pendiente (regresión lineal simple) de una serie [{x, y}]. */
export function pendiente(puntos) {
  if (puntos.length < 2) return 0;
  const n = puntos.length;
  const mx = puntos.reduce((s, p) => s + p.x, 0) / n;
  const my = puntos.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of puntos) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den ? num / den : 0;
}

function confianzaPara(n) {
  if (n >= 30) return 'alta';
  if (n >= 10) return 'media';
  return 'baja';
}

/**
 * Puntaje estimado por área y global, con proyección al día del examen.
 * @param {string} usuarioId
 * @param {{ fechaExamen?: string|null, meta?: number|null }} opciones
 */
export async function estimarPuntajes(usuarioId, { fechaExamen = null, meta = null } = {}, cliente = pool) {
  const { vidaMediaDias, pesoPrevio, ventanaDias } = REGLAS.puntaje;
  const pesos = REGLAS.puntaje.pesoDificultad;

  const areas = await varias(
    `SELECT m.id, m.slug, m.nombre, m.nombre_corto, m.color, m.peso_global,
            count(x.materia_id)::int AS respondidas,
            coalesce(sum(x.w), 0) AS peso,
            coalesce(sum(x.w) FILTER (WHERE x.es_correcta), 0) AS peso_aciertos
       FROM materias m
       LEFT JOIN (
         SELECT r.materia_id, r.es_correcta,
                (CASE p.dificultad WHEN 1 THEN $3::numeric WHEN 2 THEN $4::numeric ELSE $5::numeric END)
                  * power(0.5, extract(epoch FROM now() - r.creado_en) / 86400.0 / $2) AS w
           FROM respuestas r
           JOIN preguntas p ON p.id = r.pregunta_id
          WHERE r.usuario_id = $1 AND r.creado_en > now() - make_interval(days => $6)
       ) x ON x.materia_id = m.id
      GROUP BY m.id
      ORDER BY m.orden`,
    [usuarioId, vidaMediaDias, pesos[1], pesos[2], pesos[3], ventanaDias],
    cliente,
  );

  const porArea = areas.map((a) => {
    const puntaje = a.respondidas
      ? Math.round((100 * (a.peso_aciertos + pesoPrevio * 0.5)) / (a.peso + pesoPrevio))
      : null;
    return {
      slug: a.slug,
      nombre: a.nombre,
      nombre_corto: a.nombre_corto,
      color: a.color,
      peso: a.peso_global,
      respondidas: a.respondidas,
      puntaje,
      confianza: confianzaPara(a.respondidas),
    };
  });

  const conDatos = porArea.filter((a) => a.puntaje != null);
  const global = conDatos.length ? puntajeGlobal(porArea) : null;
  const totalRespondidas = porArea.reduce((s, a) => s + a.respondidas, 0);

  const proyeccion = await proyectar(usuarioId, global, fechaExamen, cliente);

  return {
    global: {
      puntaje: global,
      parcial: conDatos.length > 0 && conDatos.length < porArea.length,
      confianza: confianzaPara(totalRespondidas / 2),
      areas_con_datos: conDatos.length,
    },
    areas: porArea,
    proyeccion,
    meta,
  };
}

/**
 * Proyección: tendencia semanal de la precisión (últimas 8 semanas) extendida hasta el
 * examen con amortiguación (el progreso se desacelera), acotada a un rango razonable.
 */
async function proyectar(usuarioId, globalActual, fechaExamen, cliente) {
  const hoy = fechaLocal();
  const desde = sumarDias(inicioSemana(hoy), -7 * 7);
  const semanas = await varias(
    `SELECT date_trunc('week', fecha::timestamp)::date AS semana,
            sum(respondidas)::int AS respondidas, sum(correctas)::int AS correctas
       FROM estadisticas
      WHERE usuario_id = $1 AND fecha >= $2
      GROUP BY 1 ORDER BY 1`,
    [usuarioId, desde],
    cliente,
  );
  const puntos = semanas
    .filter((s) => s.respondidas >= 5)
    .map((s) => ({ x: diasEntre(desde, s.semana) / 7, y: (100 * s.correctas) / s.respondidas }));

  const tendencia = puntos.length >= 2 ? pendiente(puntos) : 0; // puntos porcentuales por semana
  const semanasRestantes = fechaExamen ? Math.max(0, Math.floor(diasEntre(hoy, fechaExamen) / 7)) : 0;

  if (globalActual == null) {
    return { puntaje: null, tendencia_semanal: 0, semanas_restantes: semanasRestantes, mensaje: 'Responde preguntas de varias áreas para calcular tu proyección.' };
  }

  // 1 punto porcentual de precisión ≈ 5 puntos del global (escala 0–500).
  const semanasEfectivas = Math.min(semanasRestantes, 16);
  let proyectado = globalActual;
  if (tendencia > 0) proyectado = globalActual + tendencia * 5 * semanasEfectivas * 0.5;
  proyectado = Math.round(Math.min(500, Math.max(globalActual, Math.min(proyectado, globalActual + 120))));

  let mensaje;
  if (puntos.length < 2) {
    mensaje = 'Estudia al menos dos semanas para ver tu tendencia de mejora.';
  } else if (tendencia > 0.3) {
    mensaje = `Vas mejorando ${tendencia.toFixed(1)} puntos porcentuales por semana. Si mantienes el ritmo podrías llegar a ${proyectado} puntos.`;
  } else if (tendencia < -0.3) {
    mensaje = 'Tu precisión bajó en las últimas semanas: repasa tus errores frecuentes con Vanty.';
  } else {
    mensaje = 'Tu rendimiento está estable. Sube la dificultad con retos y simulacros para seguir creciendo.';
  }

  return {
    puntaje: proyectado,
    tendencia_semanal: Math.round(tendencia * 10) / 10,
    semanas_restantes: semanasRestantes,
    mensaje,
  };
}

/** Meta de puntaje del estudiante (para comparar con la proyección). */
export async function metaPuntaje(usuarioId) {
  const fila = await una(`SELECT meta_puntaje FROM perfiles WHERE usuario_id = $1`, [usuarioId]);
  return fila?.meta_puntaje ?? null;
}
