/**
 * Perfil, avatar, configuración de cuenta y eliminación de cuenta.
 */
import bcrypt from 'bcryptjs';
import { query, transaccion, una, varias } from '../config/db.js';
import { AppError, conflicto, noEncontrado, solicitudInvalida } from '../utils/AppError.js';
import { porcentaje } from '../utils/texto.js';
import { firmarToken } from '../middlewares/auth.js';
import { hashPassword } from './auth.service.js';
import { progresoNivel } from './gamificacion.service.js';
import { estadoRacha } from './racha.service.js';
import { fechaIcfes } from './config.service.js';

export async function obtenerPerfil(usuarioId) {
  const datos = await una(
    `SELECT u.id, u.nombre, u.email, u.rol, u.creado_en,
            p.nombre_mostrar, p.bio, p.colegio, p.ciudad, p.grado, p.avatar, p.fecha_icfes, p.meta_diaria_min,
            p.meta_puntaje, p.tema_interfaz, p.recordatorios, p.insignia_destacada_id
       FROM usuarios u JOIN perfiles p ON p.usuario_id = u.id
      WHERE u.id = $1`,
    [usuarioId],
  );
  if (!datos) throw noEncontrado('El usuario no existe.');

  const [insignias, inventario, estadisticas, nivel, racha, icfes, logros] = await Promise.all([
    varias(
      `SELECT i.id, i.codigo, i.nombre, i.descripcion, i.icono, i.color, i.rareza, i.origen, ui.obtenida_en
         FROM usuario_insignias ui JOIN insignias i ON i.id = ui.insignia_id
        WHERE ui.usuario_id = $1 ORDER BY ui.obtenida_en DESC`,
      [usuarioId],
    ),
    varias(
      `SELECT it.codigo, it.categoria, it.nombre FROM inventario inv
         JOIN items_tienda it ON it.id = inv.item_id
        WHERE inv.usuario_id = $1 ORDER BY it.categoria, it.orden`,
      [usuarioId],
    ),
    una(
      `SELECT (SELECT count(*) FROM respuestas WHERE usuario_id = $1)::int AS respondidas,
              (SELECT count(*) FROM respuestas WHERE usuario_id = $1 AND es_correcta)::int AS correctas,
              (SELECT count(*) FROM lecciones_completadas WHERE usuario_id = $1)::int AS lecciones,
              (SELECT count(*) FROM resultados WHERE usuario_id = $1)::int AS simulacros,
              (SELECT count(*) FROM actividad_diaria WHERE usuario_id = $1)::int AS dias_estudiados,
              (SELECT coalesce(sum(segundos_estudio), 0) FROM actividad_diaria WHERE usuario_id = $1)::int AS segundos`,
      [usuarioId],
    ),
    progresoNivel(usuarioId),
    estadoRacha(usuarioId),
    fechaIcfes(usuarioId),
    una(
      `SELECT count(ul.logro_id)::int AS desbloqueados, (SELECT count(*) FROM logros)::int AS total
         FROM usuario_logros ul WHERE ul.usuario_id = $1`,
      [usuarioId],
    ),
  ]);

  return {
    usuario: { id: datos.id, nombre: datos.nombre, email: datos.email, rol: datos.rol, miembro_desde: datos.creado_en },
    perfil: {
      nombre_mostrar: datos.nombre_mostrar,
      bio: datos.bio,
      colegio: datos.colegio,
      ciudad: datos.ciudad,
      grado: datos.grado,
      avatar: datos.avatar,
      insignia_destacada_id: datos.insignia_destacada_id,
    },
    configuracion: {
      fecha_icfes: datos.fecha_icfes,
      meta_diaria_min: datos.meta_diaria_min,
      meta_puntaje: datos.meta_puntaje,
      tema_interfaz: datos.tema_interfaz,
      recordatorios: datos.recordatorios,
    },
    icfes,
    nivel,
    racha,
    estadisticas: {
      ...estadisticas,
      precision: estadisticas.respondidas ? porcentaje(estadisticas.correctas, estadisticas.respondidas) : null,
      horas: Math.round((estadisticas.segundos / 3600) * 10) / 10,
      logros: logros.desbloqueados,
      logros_total: logros.total,
    },
    insignias,
    inventario,
  };
}

export async function actualizarPerfil(usuarioId, { nombre, nombreMostrar, bio, colegio, ciudad, grado }) {
  await transaccion(async (cliente) => {
    if (nombre !== undefined) await cliente.query(`UPDATE usuarios SET nombre = $2 WHERE id = $1`, [usuarioId, nombre]);
    await cliente.query(
      `UPDATE perfiles SET
         nombre_mostrar = CASE WHEN $2 THEN $3 ELSE nombre_mostrar END,
         bio            = CASE WHEN $4 THEN $5 ELSE bio END,
         colegio        = CASE WHEN $6 THEN $7 ELSE colegio END,
         ciudad         = CASE WHEN $8 THEN $9 ELSE ciudad END,
         grado          = CASE WHEN $10 THEN $11 ELSE grado END
       WHERE usuario_id = $1`,
      [usuarioId,
        nombreMostrar !== undefined, nombreMostrar || null,
        bio !== undefined, bio || null,
        colegio !== undefined, colegio || null,
        ciudad !== undefined, ciudad || null,
        grado !== undefined, grado || null],
    );
  });
  return obtenerPerfil(usuarioId);
}

/** Equipa un avatar: cada pieza debe pertenecer a su categoría y estar en el inventario. */
export async function actualizarAvatar(usuarioId, avatar) {
  const piezas = { color: avatar.color, expresion: avatar.expresion, accesorio: avatar.accesorio, fondo: avatar.fondo };
  const codigos = Object.values(piezas);
  const propias = await varias(
    `SELECT it.codigo, it.categoria FROM inventario inv JOIN items_tienda it ON it.id = inv.item_id
      WHERE inv.usuario_id = $1 AND it.codigo = ANY($2::text[])`,
    [usuarioId, codigos],
  );
  for (const [categoria, codigo] of Object.entries(piezas)) {
    const item = propias.find((p) => p.codigo === codigo);
    if (!item) throw new AppError(403, `No tienes el artículo "${codigo}". Consíguelo en la tienda.`, { codigo: 'NO_ADQUIRIDO' });
    if (item.categoria !== categoria) throw solicitudInvalida(`El artículo "${codigo}" no es de tipo ${categoria}.`);
  }
  await query(`UPDATE perfiles SET avatar = $2 WHERE usuario_id = $1`, [usuarioId, JSON.stringify(piezas)]);
  return piezas;
}

export async function destacarInsignia(usuarioId, insigniaId) {
  if (insigniaId != null) {
    const propia = await una(`SELECT 1 AS si FROM usuario_insignias WHERE usuario_id = $1 AND insignia_id = $2`, [usuarioId, insigniaId]);
    if (!propia) throw new AppError(403, 'Aún no has obtenido esa insignia.');
  }
  await query(`UPDATE perfiles SET insignia_destacada_id = $2 WHERE usuario_id = $1`, [usuarioId, insigniaId]);
  return { insignia_destacada_id: insigniaId };
}

export async function actualizarConfiguracion(usuarioId, cambios) {
  const campos = {
    fecha_icfes: cambios.fechaIcfes,
    meta_diaria_min: cambios.metaDiariaMin,
    meta_puntaje: cambios.metaPuntaje,
    tema_interfaz: cambios.temaInterfaz,
    recordatorios: cambios.recordatorios,
  };
  const presentes = Object.entries(campos).filter(([, v]) => v !== undefined);
  if (presentes.length) {
    // Los nombres de columna vienen de la lista blanca de arriba, nunca del cliente.
    const asignaciones = presentes.map(([columna], i) => `${columna} = $${i + 2}`).join(', ');
    await query(`UPDATE perfiles SET ${asignaciones} WHERE usuario_id = $1`, [usuarioId, ...presentes.map(([, v]) => v)]);
  }
  return (await obtenerPerfil(usuarioId)).configuracion;
}

async function verificarPassword(usuarioId, password) {
  const fila = await una(`SELECT password_hash FROM usuarios WHERE id = $1`, [usuarioId]);
  if (!fila || !(await bcrypt.compare(password, fila.password_hash))) {
    throw new AppError(401, 'La contraseña actual no es correcta.', { codigo: 'CREDENCIALES' });
  }
}

export async function cambiarEmail(usuarioId, { email, password }) {
  await verificarPassword(usuarioId, password);
  const ocupado = await una(`SELECT 1 AS si FROM usuarios WHERE lower(email) = lower($1) AND id <> $2`, [email, usuarioId]);
  if (ocupado) throw conflicto('Ese correo ya está registrado en otra cuenta.');
  await query(`UPDATE usuarios SET email = $2 WHERE id = $1`, [usuarioId, email]);
  return { email };
}

/** Cambia la contraseña, invalida las demás sesiones y devuelve un token nuevo. */
export async function cambiarPassword(usuarioId, { actual, nueva }) {
  await verificarPassword(usuarioId, actual);
  const hash = await hashPassword(nueva);
  const usuario = await una(
    `UPDATE usuarios SET password_hash = $2, token_version = token_version + 1 WHERE id = $1
     RETURNING id, rol, token_version`,
    [usuarioId, hash],
  );
  return firmarToken(usuario);
}

export async function eliminarCuenta(usuarioId, password) {
  await verificarPassword(usuarioId, password);
  // ON DELETE CASCADE elimina perfil, progreso, respuestas, conversaciones, etc.
  await query(`DELETE FROM usuarios WHERE id = $1`, [usuarioId]);
}
