/**
 * Panel de administración: métricas generales, banco de preguntas, usuarios y configuración.
 */
import { transaccion, una, varias } from '../config/db.js';
import { AppError, noEncontrado, solicitudInvalida } from '../utils/AppError.js';
import { esFechaValida } from '../utils/fechas.js';
import { guardarConfig, obtenerConfig } from './config.service.js';
import { cargarPreguntas } from './preguntas.service.js';
import { guardarPregunta, importarPreguntas, validarPregunta } from './contenido.service.js';

export async function resumen() {
  const [general, porMateria, actividad] = await Promise.all([
    una(
      `SELECT (SELECT count(*) FROM usuarios)::int AS usuarios,
              (SELECT count(*) FROM usuarios WHERE ultimo_acceso > now() - interval '7 days')::int AS activos_7,
              (SELECT count(*) FROM preguntas WHERE activa AND publica)::int AS preguntas,
              (SELECT count(*) FROM lecciones WHERE activa)::int AS lecciones,
              (SELECT count(*) FROM respuestas WHERE creado_en > now() - interval '1 day')::int AS respuestas_24h,
              (SELECT count(*) FROM resultados)::int AS simulacros,
              (SELECT count(*) FROM mensajes_vanty WHERE rol = 'usuario')::int AS mensajes_vanty`,
    ),
    varias(
      `SELECT m.slug, m.nombre, m.color,
              count(p.id) FILTER (WHERE p.activa AND p.publica)::int AS preguntas,
              count(p.id) FILTER (WHERE p.activa AND p.publica AND p.dificultad = 1)::int AS faciles,
              count(p.id) FILTER (WHERE p.activa AND p.publica AND p.dificultad = 2)::int AS medias,
              count(p.id) FILTER (WHERE p.activa AND p.publica AND p.dificultad = 3)::int AS dificiles
         FROM materias m
         LEFT JOIN temas t ON t.materia_id = m.id
         LEFT JOIN subtemas s ON s.tema_id = t.id
         LEFT JOIN preguntas p ON p.subtema_id = s.id
        GROUP BY m.id ORDER BY m.orden`,
    ),
    varias(
      `SELECT fecha, count(DISTINCT usuario_id)::int AS usuarios, sum(preguntas_respondidas)::int AS preguntas
         FROM actividad_diaria WHERE fecha > current_date - 14
        GROUP BY fecha ORDER BY fecha`,
    ),
  ]);
  return { general, por_materia: porMateria, actividad };
}

// ---------------------------------------------------------------------------
// Banco de preguntas
// ---------------------------------------------------------------------------

export async function listarPreguntas({ materia, subtema, q, estado = 'activas', pagina = 1, porPagina = 20 }) {
  const condiciones = [`p.origen <> 'vanty'`];
  const parametros = [];
  const agregar = (sql, valor) => { parametros.push(valor); condiciones.push(sql.replace('?', `$${parametros.length}`)); };
  if (materia) agregar('m.slug = ?', materia);
  if (subtema) agregar('s.slug = ?', subtema);
  if (q) {
    parametros.push(`%${q}%`);
    condiciones.push(`(p.codigo ILIKE $${parametros.length} OR p.enunciado ILIKE $${parametros.length})`);
  }
  if (estado === 'activas') condiciones.push('p.activa');
  if (estado === 'inactivas') condiciones.push('NOT p.activa');

  const donde = condiciones.join(' AND ');
  const total = await una(
    `SELECT count(*)::int AS n FROM preguntas p
       JOIN subtemas s ON s.id = p.subtema_id JOIN temas t ON t.id = s.tema_id JOIN materias m ON m.id = t.materia_id
      WHERE ${donde}`,
    parametros,
  );
  const filas = await varias(
    `SELECT p.id, p.codigo, left(p.enunciado, 140) AS enunciado, p.dificultad, p.activa, p.origen,
            s.nombre AS subtema, m.nombre AS materia, m.color,
            (SELECT count(*) FROM respuestas r WHERE r.pregunta_id = p.id)::int AS respuestas,
            (SELECT round(100.0 * avg(CASE WHEN r.es_correcta THEN 1 ELSE 0 END)) FROM respuestas r WHERE r.pregunta_id = p.id)::int AS acierto
       FROM preguntas p
       JOIN subtemas s ON s.id = p.subtema_id JOIN temas t ON t.id = s.tema_id JOIN materias m ON m.id = t.materia_id
      WHERE ${donde}
      ORDER BY m.orden, p.codigo
      LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    [...parametros, porPagina, (pagina - 1) * porPagina],
  );
  return { total: total.n, pagina, por_pagina: porPagina, preguntas: filas };
}

export async function obtenerPregunta(id) {
  const [pregunta] = await cargarPreguntas([id], { conSolucion: true });
  if (!pregunta) throw noEncontrado('La pregunta no existe.');
  const extra = await una(`SELECT activa, etiquetas FROM preguntas WHERE id = $1`, [id]);
  return { ...pregunta, ...extra };
}

/**
 * Crea o actualiza una pregunta desde el formulario del panel.
 * `datos` sigue el formato de contenido: { codigo, subtema, dificultad, competencia, contexto,
 * enunciado, imagen, imagen_alt, opciones[4], explicacion, tiempo_estimado_seg, etiquetas }.
 */
export async function guardarPreguntaAdmin(datos, idExistente = null) {
  return transaccion(async (cliente) => {
    const subtemas = await varias(`SELECT id, slug FROM subtemas`, [], cliente);
    const mapa = new Map(subtemas.map((s) => [s.slug, s.id]));
    const errores = validarPregunta(datos, { subtemas: new Set(mapa.keys()) });
    if (errores.length) throw solicitudInvalida(errores[0], errores);

    if (idExistente) {
      const actual = await una(`SELECT codigo FROM preguntas WHERE id = $1`, [idExistente], cliente);
      if (!actual) throw noEncontrado('La pregunta no existe.');
      if (actual.codigo !== datos.codigo) throw solicitudInvalida('El código de una pregunta existente no se puede cambiar.');
    } else {
      const duplicada = await una(`SELECT 1 AS si FROM preguntas WHERE codigo = $1`, [datos.codigo], cliente);
      if (duplicada) throw new AppError(409, 'Ya existe una pregunta con ese código.');
    }

    let contextoId = null;
    if (datos.contexto?.trim()) {
      const ctx = await una(
        `INSERT INTO contextos (codigo, contenido, titulo) VALUES ($1, $2, $3)
         ON CONFLICT (codigo) DO UPDATE SET contenido = EXCLUDED.contenido, titulo = EXCLUDED.titulo
         RETURNING id`,
        [`${datos.codigo}-CTX`, datos.contexto.trim(), datos.contexto_titulo || null],
        cliente,
      );
      contextoId = ctx.id;
    }
    // En una actualización el ON CONFLICT conserva el origen original de la pregunta.
    const { id } = await guardarPregunta(cliente, datos, { subtemaId: mapa.get(datos.subtema), contextoId, origen: 'admin' });
    return { id };
  }).then(({ id }) => obtenerPregunta(id));
}

export async function cambiarEstadoPregunta(id, activa) {
  const fila = await una(`UPDATE preguntas SET activa = $2 WHERE id = $1 AND origen <> 'vanty' RETURNING id, activa`, [id, activa]);
  if (!fila) throw noEncontrado('La pregunta no existe.');
  return fila;
}

export async function importar(datos) {
  try {
    return await transaccion((cliente) => importarPreguntas(cliente, datos, { origen: 'admin' }));
  } catch (error) {
    if (error.errores) throw solicitudInvalida(error.message, error.errores.slice(0, 50));
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export async function listarUsuarios({ q, pagina = 1, porPagina = 25 }) {
  const parametros = [];
  let donde = 'TRUE';
  if (q) {
    parametros.push(`%${q}%`);
    donde = `(u.nombre ILIKE $1 OR u.email ILIKE $1)`;
  }
  const total = await una(`SELECT count(*)::int AS n FROM usuarios u WHERE ${donde}`, parametros);
  const filas = await varias(
    `SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.creado_en, u.ultimo_acceso,
            p.nivel, p.xp, r.actual AS racha,
            (SELECT count(*) FROM respuestas x WHERE x.usuario_id = u.id)::int AS respuestas
       FROM usuarios u JOIN perfiles p ON p.usuario_id = u.id JOIN rachas r ON r.usuario_id = u.id
      WHERE ${donde}
      ORDER BY u.creado_en DESC
      LIMIT $${parametros.length + 1} OFFSET $${parametros.length + 2}`,
    [...parametros, porPagina, (pagina - 1) * porPagina],
  );
  return { total: total.n, pagina, por_pagina: porPagina, usuarios: filas };
}

export async function actualizarUsuario(adminId, id, { activo, rol }) {
  if (id === adminId && (activo === false || rol === 'estudiante')) {
    throw solicitudInvalida('No puedes desactivarte ni quitarte el rol de administrador a ti mismo.');
  }
  const fila = await una(
    `UPDATE usuarios SET
        activo = coalesce($2, activo),
        rol = coalesce($3, rol),
        token_version = CASE WHEN $2 = FALSE OR ($3 IS NOT NULL AND $3 <> rol) THEN token_version + 1 ELSE token_version END
      WHERE id = $1
      RETURNING id, nombre, email, rol, activo`,
    [id, activo ?? null, rol ?? null],
  );
  if (!fila) throw noEncontrado('El usuario no existe.');
  return fila;
}

// ---------------------------------------------------------------------------
// Configuración global
// ---------------------------------------------------------------------------

export async function obtenerConfiguracion() {
  return {
    fecha_icfes: (await obtenerConfig('fecha_icfes')) ?? {},
    vanty: (await obtenerConfig('vanty')) ?? {},
  };
}

export async function actualizarConfiguracion({ fechaIcfes, vanty }) {
  if (fechaIcfes) {
    if (!esFechaValida(fechaIcfes.fecha)) throw solicitudInvalida('La fecha del ICFES no es válida.');
    await guardarConfig('fecha_icfes', {
      fecha: fechaIcfes.fecha,
      nombre: String(fechaIcfes.nombre || 'Saber 11').slice(0, 80),
      estimada: Boolean(fechaIcfes.estimada),
    }, 'Fecha global del próximo examen.');
  }
  if (vanty) {
    const limite = Number.parseInt(vanty.limite_diario, 10);
    if (!(limite >= 1 && limite <= 1000)) throw solicitudInvalida('El límite diario de Vanty debe estar entre 1 y 1000.');
    await guardarConfig('vanty', { limite_diario: limite }, 'Límite diario de mensajes a Vanty por estudiante.');
  }
  return obtenerConfiguracion();
}
