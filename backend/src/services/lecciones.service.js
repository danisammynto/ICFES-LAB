/**
 * Lecciones: contenido, finalización y "lección del día".
 */
import { transaccion, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { AppError, noEncontrado } from '../utils/AppError.js';
import { fechaLocal } from '../utils/fechas.js';
import { hashTexto } from '../utils/aleatorio.js';
import { otorgar, resumenJugador } from './gamificacion.service.js';
import { registrarEstudio } from './racha.service.js';
import { sincronizarLecciones } from './progreso.service.js';
import { evaluarLogros } from './logros.service.js';

async function nivelUsuario(usuarioId, cliente) {
  const fila = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1`, [usuarioId], cliente);
  return fila?.nivel ?? 1;
}

/** Contenido completo de una lección (verifica que el subtema esté desbloqueado). */
export async function obtenerLeccion(usuarioId, leccionId) {
  const leccion = await una(
    `SELECT l.id, l.codigo, l.titulo, l.resumen, l.contenido, l.duracion_min, l.xp_recompensa, l.monedas_recompensa,
            s.id AS subtema_id, s.slug AS subtema_slug, s.nombre AS subtema_nombre, s.nivel_requerido,
            m.slug AS materia_slug, m.nombre AS materia_nombre, m.color AS materia_color, m.icono AS materia_icono,
            lc.completada_en, lc.veces,
            (SELECT count(*) FROM preguntas q WHERE q.subtema_id = s.id AND q.activa AND q.publica)::int AS preguntas_subtema
       FROM lecciones l
       JOIN subtemas s ON s.id = l.subtema_id
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
       LEFT JOIN lecciones_completadas lc ON lc.leccion_id = l.id AND lc.usuario_id = $2
      WHERE l.id = $1 AND l.activa`,
    [leccionId, usuarioId],
  );
  if (!leccion) throw noEncontrado('La lección no existe.');
  const nivel = await nivelUsuario(usuarioId);
  if (leccion.nivel_requerido > nivel) {
    throw new AppError(403, `Esta lección se desbloquea en el nivel ${leccion.nivel_requerido}. ¡Sigue sumando XP!`, {
      codigo: 'BLOQUEADO',
    });
  }

  const hermanas = await varias(
    `SELECT id, titulo, orden FROM lecciones WHERE subtema_id = $1 AND activa ORDER BY orden`,
    [leccion.subtema_id],
  );
  const posicion = hermanas.findIndex((h) => h.id === leccion.id);

  return {
    id: leccion.id,
    codigo: leccion.codigo,
    titulo: leccion.titulo,
    resumen: leccion.resumen,
    bloques: leccion.contenido,
    duracion_min: leccion.duracion_min,
    recompensa: { xp: leccion.xp_recompensa, monedas: leccion.monedas_recompensa },
    completada: Boolean(leccion.completada_en),
    veces: leccion.veces ?? 0,
    subtema: { id: leccion.subtema_id, slug: leccion.subtema_slug, nombre: leccion.subtema_nombre, preguntas: leccion.preguntas_subtema },
    materia: { slug: leccion.materia_slug, nombre: leccion.materia_nombre, color: leccion.materia_color, icono: leccion.materia_icono },
    siguiente: hermanas[posicion + 1] ?? null,
  };
}

/**
 * Marca la lección como completada. La primera vez entrega la recompensa completa;
 * repasarla después da un poco de XP.
 */
export async function completarLeccion(usuarioId, leccionId, { tiempoSeg = 0, aciertos = 0, total = 0 }) {
  return transaccion(async (cliente) => {
    const leccion = await una(
      `SELECT l.id, l.subtema_id, l.xp_recompensa, l.monedas_recompensa, l.duracion_min, s.nivel_requerido
         FROM lecciones l JOIN subtemas s ON s.id = l.subtema_id
        WHERE l.id = $1 AND l.activa`,
      [leccionId],
      cliente,
    );
    if (!leccion) throw noEncontrado('La lección no existe.');
    if (leccion.nivel_requerido > (await nivelUsuario(usuarioId, cliente))) {
      throw new AppError(403, 'Esta lección aún está bloqueada para tu nivel.', { codigo: 'BLOQUEADO' });
    }

    const segundos = Math.min(Math.max(0, Math.round(tiempoSeg) || 0), REGLAS.topes.tiempoLeccionSeg);
    const previa = await una(
      `SELECT veces FROM lecciones_completadas WHERE usuario_id = $1 AND leccion_id = $2 FOR UPDATE`,
      [usuarioId, leccionId],
      cliente,
    );

    await cliente.query(
      `INSERT INTO lecciones_completadas (usuario_id, leccion_id, tiempo_seg, aciertos_ejercicios, total_ejercicios)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (usuario_id, leccion_id) DO UPDATE SET
         veces = lecciones_completadas.veces + 1,
         tiempo_seg = lecciones_completadas.tiempo_seg + EXCLUDED.tiempo_seg,
         aciertos_ejercicios = GREATEST(lecciones_completadas.aciertos_ejercicios, EXCLUDED.aciertos_ejercicios),
         total_ejercicios = EXCLUDED.total_ejercicios`,
      [usuarioId, leccionId, segundos, aciertos, total],
    );

    const eventos = [];
    const primeraVez = !previa;
    eventos.push(...(await otorgar(cliente, usuarioId, {
      xp: primeraVez ? leccion.xp_recompensa : REGLAS.xp.leccionRepetida,
      monedas: primeraVez ? leccion.monedas_recompensa : 0,
      motivo: primeraVez ? 'leccion' : 'leccion_repaso',
      referencia: `leccion:${leccionId}`,
    })));
    eventos.push(...(await registrarEstudio(cliente, usuarioId, { segundos, lecciones: primeraVez ? 1 : 0 })));
    eventos.push(...(await sincronizarLecciones(cliente, usuarioId, leccion.subtema_id)));
    eventos.push(...(await evaluarLogros(cliente, usuarioId, { estudio: true })));

    return { primera_vez: primeraVez, eventos, jugador: await resumenJugador(cliente, usuarioId) };
  });
}

/**
 * Lección del día: prioriza el área con menor precisión (o rota entre áreas si aún no hay
 * datos) y dentro de ella la primera lección desbloqueada sin completar. Si ya completó
 * todas, sugiere practicar su subtema más débil.
 */
export async function leccionDelDia(usuarioId) {
  const nivel = await nivelUsuario(usuarioId);

  const areas = await varias(
    `SELECT m.id, m.slug, m.nombre,
            count(r.id) AS respondidas,
            coalesce(avg(CASE WHEN r.es_correcta THEN 1.0 ELSE 0 END), 0) AS precision
       FROM materias m
       LEFT JOIN respuestas r ON r.materia_id = m.id AND r.usuario_id = $1
                              AND r.creado_en > now() - interval '60 days'
      GROUP BY m.id
      ORDER BY m.orden`,
    [usuarioId],
  );

  let orden;
  let motivo;
  const conDatos = areas.filter((a) => a.respondidas >= 3);
  if (conDatos.length) {
    orden = [...areas].sort((a, b) => {
      const pa = a.respondidas >= 3 ? a.precision : 0.5;
      const pb = b.respondidas >= 3 ? b.precision : 0.5;
      return pa - pb;
    });
    const debil = orden[0];
    motivo = debil.respondidas >= 3
      ? `${debil.nombre} es el área donde tienes más oportunidad de mejorar (${Math.round(debil.precision * 100)} % de aciertos).`
      : `Aún no has practicado ${debil.nombre}: ¡empecemos por ahí!`;
  } else {
    // Sin datos: rota el área según el día para variar.
    const desplazamiento = hashTexto(`${usuarioId}:${fechaLocal()}`) % areas.length;
    orden = [...areas.slice(desplazamiento), ...areas.slice(0, desplazamiento)];
    motivo = `Hoy toca ${orden[0].nombre}. ¡Cada día un paso más cerca del ICFES!`;
  }

  for (const area of orden) {
    const leccion = await una(
      `SELECT l.id, l.titulo, l.resumen, l.duracion_min, l.xp_recompensa, s.nombre AS subtema, s.slug AS subtema_slug
         FROM lecciones l
         JOIN subtemas s ON s.id = l.subtema_id
         JOIN temas t ON t.id = s.tema_id
        WHERE t.materia_id = $2 AND l.activa AND s.nivel_requerido <= $3
          AND NOT EXISTS (SELECT 1 FROM lecciones_completadas lc WHERE lc.leccion_id = l.id AND lc.usuario_id = $1)
        ORDER BY t.orden, s.orden, l.orden
        LIMIT 1`,
      [usuarioId, area.id, nivel],
    );
    if (leccion) {
      return {
        tipo: 'leccion',
        motivo: area === orden[0] ? motivo : `Sigue avanzando en ${area.nombre}.`,
        materia: { slug: area.slug, nombre: area.nombre },
        leccion,
        url: `/leccion?id=${leccion.id}`,
      };
    }
  }

  // Todas las lecciones desbloqueadas completadas: práctica del subtema más débil.
  const debil = await una(
    `SELECT s.slug, s.nombre, m.slug AS materia_slug, m.nombre AS materia_nombre
       FROM subtemas s
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
       LEFT JOIN progreso p ON p.subtema_id = s.id AND p.usuario_id = $1
      WHERE s.nivel_requerido <= $2
      ORDER BY coalesce(p.dominio, 0), random()
      LIMIT 1`,
    [usuarioId, nivel],
  );
  return {
    tipo: 'practica',
    motivo: `¡Completaste todas tus lecciones disponibles! Refuerza ${debil.nombre} con práctica.`,
    materia: { slug: debil.materia_slug, nombre: debil.materia_nombre },
    subtema: { slug: debil.slug, nombre: debil.nombre },
    url: `/practica?subtema=${debil.slug}`,
  };
}
