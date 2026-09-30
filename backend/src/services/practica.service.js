/**
 * Práctica adaptativa de preguntas tipo ICFES.
 *
 * Selección de la siguiente pregunta de un subtema:
 *   · dificultad objetivo según el dominio (< 40 → baja, < 70 → media, ≥ 70 → alta)
 *   · prioridad: nunca vista > fallada la última vez > acertada hace tiempo (repaso espaciado)
 *   · una pequeña variación aleatoria evita que la secuencia sea siempre igual
 */
import { transaccion, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { AppError, noEncontrado, solicitudInvalida } from '../utils/AppError.js';
import { cargarPreguntas } from './preguntas.service.js';
import { actualizarProgreso, registrarEstadistica } from './progreso.service.js';
import { registrarEstudio } from './racha.service.js';
import { otorgar, resumenJugador } from './gamificacion.service.js';
import { evaluarLogros } from './logros.service.js';

export function dificultadObjetivo(dominio = 0, respondidas = 0) {
  if (!respondidas) return 1;
  if (dominio < 40) return 1;
  if (dominio < 70) return 2;
  return 3;
}

/** Puntaje de prioridad de una pregunta candidata (mayor = mejor candidata). */
export function prioridadPregunta({ veces, ultima, ultima_correcta: ultimaCorrecta, dificultad }, objetivo, ahora = Date.now()) {
  let puntaje;
  if (!veces) {
    puntaje = 100;
  } else {
    const horas = (ahora - new Date(ultima).getTime()) / 3_600_000;
    puntaje = ultimaCorrecta ? 20 + Math.min(40, (horas / 24) * 5) : 70 + Math.min(20, horas);
  }
  return puntaje - 15 * Math.abs(dificultad - objetivo) + Math.random() * 10;
}

async function nivelUsuario(usuarioId) {
  const fila = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1`, [usuarioId]);
  return fila?.nivel ?? 1;
}

/** Elige el subtema a practicar: el indicado, o el más débil desbloqueado de la materia. */
async function resolverSubtema(usuarioId, { subtema, materia }) {
  const nivel = await nivelUsuario(usuarioId);
  if (subtema) {
    const s = await una(
      `SELECT s.id, s.slug, s.nombre, s.nivel_requerido, m.slug AS materia_slug, m.nombre AS materia_nombre
         FROM subtemas s JOIN temas t ON t.id = s.tema_id JOIN materias m ON m.id = t.materia_id
        WHERE s.slug = $1`,
      [subtema],
    );
    if (!s) throw noEncontrado('El subtema no existe.');
    if (s.nivel_requerido > nivel) {
      throw new AppError(403, `Este subtema se desbloquea en el nivel ${s.nivel_requerido}.`, { codigo: 'BLOQUEADO' });
    }
    return s;
  }
  if (materia) {
    const s = await una(
      `SELECT s.id, s.slug, s.nombre, s.nivel_requerido, m.slug AS materia_slug, m.nombre AS materia_nombre
         FROM subtemas s
         JOIN temas t ON t.id = s.tema_id
         JOIN materias m ON m.id = t.materia_id
         LEFT JOIN progreso p ON p.subtema_id = s.id AND p.usuario_id = $1
        WHERE m.slug = $2 AND s.nivel_requerido <= $3
          AND EXISTS (SELECT 1 FROM preguntas q WHERE q.subtema_id = s.id AND q.activa AND q.publica)
        ORDER BY coalesce(p.dominio, 50) + random() * 15
        LIMIT 1`,
      [usuarioId, materia, nivel],
    );
    if (!s) throw noEncontrado('No hay preguntas disponibles para esta materia.');
    return s;
  }
  throw solicitudInvalida('Indica un subtema o una materia para practicar.');
}

/**
 * Devuelve la siguiente pregunta (sin solución) o `pregunta: null` si ya no quedan
 * preguntas nuevas en la sesión (las de `excluir`).
 */
export async function siguientePregunta(usuarioId, { subtema, materia, excluir = [] }) {
  const sub = await resolverSubtema(usuarioId, { subtema, materia });
  const progreso = await una(
    `SELECT dominio, respondidas FROM progreso WHERE usuario_id = $1 AND subtema_id = $2`,
    [usuarioId, sub.id],
  );
  const objetivo = dificultadObjetivo(progreso?.dominio, progreso?.respondidas);

  const candidatas = await varias(
    `SELECT q.id, q.dificultad, h.veces, h.ultima, h.ultima_correcta
       FROM preguntas q
       LEFT JOIN LATERAL (
         SELECT count(*) AS veces,
                max(r.creado_en) AS ultima,
                (array_agg(r.es_correcta ORDER BY r.creado_en DESC))[1] AS ultima_correcta
           FROM respuestas r
          WHERE r.usuario_id = $1 AND r.pregunta_id = q.id
       ) h ON TRUE
      WHERE q.subtema_id = $2 AND q.activa AND q.publica
        AND NOT (q.id = ANY($3::int[]))`,
    [usuarioId, sub.id, excluir],
  );

  const base = {
    subtema: { slug: sub.slug, nombre: sub.nombre },
    materia: { slug: sub.materia_slug, nombre: sub.materia_nombre },
    dominio: progreso?.dominio ?? 0,
    dificultad_objetivo: objetivo,
  };
  if (!candidatas.length) return { ...base, pregunta: null };

  const ahora = Date.now();
  const mejor = candidatas
    .map((c) => ({ id: c.id, prioridad: prioridadPregunta(c, objetivo, ahora) }))
    .sort((a, b) => b.prioridad - a.prioridad)[0];

  const [pregunta] = await cargarPreguntas([mejor.id]);
  return { ...base, pregunta };
}

/**
 * Registra la respuesta de práctica (o de lección / Vanty) y devuelve la retroalimentación
 * completa más los eventos de gamificación. Todo ocurre en una sola transacción.
 */
export async function responderPregunta(usuarioId, { preguntaId, opcionId = null, tiempoMs = 0, origen = 'practica' }) {
  return transaccion(async (cliente) => {
    const pregunta = await una(
      `SELECT p.id, p.subtema_id, p.dificultad, p.publica, p.autor_id, p.activa,
              t.materia_id, s.nivel_requerido,
              (SELECT nivel FROM perfiles WHERE usuario_id = $2) AS nivel_usuario
         FROM preguntas p
         JOIN subtemas s ON s.id = p.subtema_id
         JOIN temas t ON t.id = s.tema_id
        WHERE p.id = $1`,
      [preguntaId, usuarioId],
      cliente,
    );
    if (!pregunta || !pregunta.activa || (!pregunta.publica && pregunta.autor_id !== usuarioId)) {
      throw noEncontrado('La pregunta no existe o no está disponible.');
    }
    if (origen !== 'vanty' && pregunta.nivel_requerido > pregunta.nivel_usuario) {
      throw new AppError(403, 'Esta pregunta pertenece a un subtema que aún no has desbloqueado.', { codigo: 'BLOQUEADO' });
    }

    const opciones = await varias(
      `SELECT id, letra, es_correcta, retroalimentacion FROM opciones WHERE pregunta_id = $1 ORDER BY letra`,
      [preguntaId],
      cliente,
    );
    const elegida = opcionId == null ? null : opciones.find((o) => o.id === opcionId);
    if (opcionId != null && !elegida) throw solicitudInvalida('La opción elegida no pertenece a la pregunta.');
    const correcta = opciones.find((o) => o.es_correcta);
    const esCorrecta = Boolean(elegida?.es_correcta);
    const tiempo = Math.min(Math.max(0, Math.round(tiempoMs) || 0), REGLAS.topes.tiempoPreguntaMs);

    // Acertar de nuevo una pregunta reciente da XP reducido (evita "farmear" XP).
    const repetida = await una(
      `SELECT 1 AS si FROM respuestas
        WHERE usuario_id = $1 AND pregunta_id = $2 AND es_correcta
          AND creado_en > now() - make_interval(hours => $3)
        LIMIT 1`,
      [usuarioId, preguntaId, REGLAS.horasPreguntaRepetida],
      cliente,
    );

    await cliente.query(
      `INSERT INTO respuestas (usuario_id, pregunta_id, opcion_id, materia_id, subtema_id, es_correcta, tiempo_ms, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [usuarioId, preguntaId, elegida?.id ?? null, pregunta.materia_id, pregunta.subtema_id, esCorrecta, tiempo, origen],
    );
    await registrarEstadistica(cliente, usuarioId, pregunta.materia_id, {
      respondidas: 1,
      correctas: esCorrecta ? 1 : 0,
      tiempoMs: tiempo,
    });

    const eventos = [];
    const xp = esCorrecta
      ? (repetida ? REGLAS.xp.repetida : REGLAS.xp.correctaPorDificultad[pregunta.dificultad])
      : REGLAS.xp.incorrecta;
    const monedas = esCorrecta && !repetida ? REGLAS.monedas.correcta : 0;
    eventos.push(...(await otorgar(cliente, usuarioId, { xp, monedas, motivo: 'respuesta', referencia: `pregunta:${preguntaId}` })));
    eventos.push(...(await registrarEstudio(cliente, usuarioId, {
      segundos: tiempo / 1000,
      preguntas: 1,
      correctas: esCorrecta ? 1 : 0,
    })));
    eventos.push(...(await actualizarProgreso(cliente, usuarioId, pregunta.subtema_id, [esCorrecta])));
    eventos.push(...(await evaluarLogros(cliente, usuarioId, { estudio: true })));

    const [solucion] = await cargarPreguntas([preguntaId], { conSolucion: true }, cliente);
    return {
      correcta: esCorrecta,
      opcion_elegida_id: elegida?.id ?? null,
      opcion_correcta_id: correcta.id,
      letra_correcta: correcta.letra,
      explicacion: solucion.explicacion,
      opciones: solucion.opciones,
      eventos,
      jugador: await resumenJugador(cliente, usuarioId),
    };
  });
}
