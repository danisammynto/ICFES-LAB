/**
 * Registro, inicio de sesión y recuperación de contraseña.
 * Las contraseñas se guardan con bcrypt (costo 12); nunca en texto plano.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { query, transaccion, una } from '../config/db.js';
import { AppError, conflicto } from '../utils/AppError.js';
import { firmarToken } from '../middlewares/auth.js';
import { enviarCorreoRecuperacion } from './email.service.js';
import { estadoRacha } from './racha.service.js';
import { fechaLocal } from '../utils/fechas.js';

const COSTO_HASH = 12;
// Hash de referencia: comparar contra él cuando el correo no existe iguala los tiempos de
// respuesta y evita revelar qué correos están registrados.
const HASH_REFERENCIA = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), COSTO_HASH);

const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

export const hashPassword = (password) => bcrypt.hash(password, COSTO_HASH);

export async function registrar({ nombre, email, password, grado = null, fechaIcfes = null }) {
  const existe = await una(`SELECT 1 AS si FROM usuarios WHERE lower(email) = lower($1)`, [email]);
  if (existe) throw conflicto('Ya existe una cuenta registrada con ese correo.');

  const hash = await hashPassword(password);
  return transaccion(async (cliente) => {
    const usuario = await una(
      `INSERT INTO usuarios (nombre, email, password_hash, ultimo_acceso)
       VALUES ($1, $2, $3, now())
       RETURNING id, nombre, email, rol, token_version`,
      [nombre, email, hash],
      cliente,
    );
    // El trigger de alta ya creó el perfil, la racha y el inventario inicial.
    await cliente.query(
      `UPDATE perfiles SET grado = coalesce($2, grado), fecha_icfes = coalesce($3::date, fecha_icfes) WHERE usuario_id = $1`,
      [usuario.id, grado, fechaIcfes],
    );
    return { usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }, token: firmarToken(usuario) };
  });
}

export async function iniciarSesion({ email, password }) {
  const usuario = await una(
    `SELECT id, nombre, email, rol, password_hash, token_version, activo FROM usuarios WHERE lower(email) = lower($1)`,
    [email],
  );
  const valida = await bcrypt.compare(password, usuario?.password_hash ?? HASH_REFERENCIA);
  if (!usuario || !valida) throw new AppError(401, 'Correo o contraseña incorrectos.', { codigo: 'CREDENCIALES' });
  if (!usuario.activo) throw new AppError(403, 'Tu cuenta está desactivada. Contacta al administrador.', { codigo: 'CUENTA_INACTIVA' });

  await query(`UPDATE usuarios SET ultimo_acceso = now() WHERE id = $1`, [usuario.id]);
  return {
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
    token: firmarToken(usuario),
  };
}

/** Datos de la sesión para la cabecera de todas las páginas. */
export async function sesionActual(usuarioId) {
  const datos = await una(
    `SELECT u.id, u.nombre, u.email, u.rol, u.creado_en,
            p.nombre_mostrar, p.avatar, p.xp, p.nivel, p.monedas, p.tema_interfaz, p.meta_diaria_min,
            n.nombre AS nivel_nombre, n.color AS nivel_color, n.icono AS nivel_icono, n.xp_minimo,
            sig.xp_minimo AS siguiente_xp, sig.nombre AS siguiente_nombre
       FROM usuarios u
       JOIN perfiles p ON p.usuario_id = u.id
       JOIN niveles n ON n.numero = p.nivel
       LEFT JOIN niveles sig ON sig.numero = p.nivel + 1
      WHERE u.id = $1`,
    [usuarioId],
  );
  const racha = await estadoRacha(usuarioId);
  const hoy = await una(
    `SELECT coalesce(segundos_estudio, 0) AS segundos FROM actividad_diaria WHERE usuario_id = $1 AND fecha = $2`,
    [usuarioId, fechaLocal()],
  );
  const rango = datos.siguiente_xp ? datos.siguiente_xp - datos.xp_minimo : null;
  return {
    id: datos.id,
    nombre: datos.nombre,
    nombre_mostrar: datos.nombre_mostrar || datos.nombre.split(' ')[0],
    email: datos.email,
    rol: datos.rol,
    avatar: datos.avatar,
    tema_interfaz: datos.tema_interfaz,
    xp: datos.xp,
    monedas: datos.monedas,
    nivel: {
      numero: datos.nivel,
      nombre: datos.nivel_nombre,
      color: datos.nivel_color,
      icono: datos.nivel_icono,
      progreso: rango ? Math.min(100, Math.round((100 * (datos.xp - datos.xp_minimo)) / rango)) : 100,
      siguiente: datos.siguiente_nombre ? { nombre: datos.siguiente_nombre, xp: datos.siguiente_xp } : null,
    },
    racha: { actual: racha.actual, estudio_hoy: racha.estudio_hoy, en_riesgo: racha.en_riesgo, protectores: racha.protectores },
    hoy: { minutos: Math.round((hoy?.segundos ?? 0) / 60), meta_minutos: datos.meta_diaria_min },
  };
}

/** Invalida todas las sesiones abiertas del usuario (en todos los dispositivos). */
export async function cerrarTodasLasSesiones(usuarioId) {
  await query(`UPDATE usuarios SET token_version = token_version + 1 WHERE id = $1`, [usuarioId]);
}

/**
 * Crea un token de recuperación de un solo uso (válido 1 hora). La respuesta es la misma
 * exista o no el correo, para no revelar qué cuentas están registradas.
 */
export async function solicitarRecuperacion({ email, ip }) {
  const usuario = await una(
    `SELECT id, nombre, email FROM usuarios WHERE lower(email) = lower($1) AND activo`,
    [email],
  );
  if (!usuario) return {};

  const token = crypto.randomBytes(32).toString('hex');
  await transaccion(async (cliente) => {
    await cliente.query(
      `UPDATE tokens_recuperacion SET usado_en = now() WHERE usuario_id = $1 AND usado_en IS NULL`,
      [usuario.id],
    );
    await cliente.query(
      `INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en, ip)
       VALUES ($1, $2, now() + interval '1 hour', $3)`,
      [usuario.id, sha256(token), ip?.slice(0, 45) ?? null],
    );
  });

  const enlace = `${env.urlPublica}/restablecer?token=${token}`;
  const envio = await enviarCorreoRecuperacion(usuario, enlace);
  // Solo en desarrollo y sin SMTP: se devuelve el enlace para poder probar el flujo.
  return envio.modo === 'consola' && !env.esProduccion ? { enlace_desarrollo: enlace } : {};
}

export async function restablecerPassword({ token, password }) {
  const hashNuevo = await hashPassword(password);
  return transaccion(async (cliente) => {
    const registro = await una(
      `SELECT id, usuario_id FROM tokens_recuperacion
        WHERE token_hash = $1 AND usado_en IS NULL AND expira_en > now()
        FOR UPDATE`,
      [sha256(token)],
      cliente,
    );
    if (!registro) throw new AppError(400, 'El enlace no es válido o ya expiró. Solicita uno nuevo.', { codigo: 'TOKEN_INVALIDO' });
    await cliente.query(
      `UPDATE usuarios SET password_hash = $2, token_version = token_version + 1 WHERE id = $1`,
      [registro.usuario_id, hashNuevo],
    );
    await cliente.query(`UPDATE tokens_recuperacion SET usado_en = now() WHERE id = $1`, [registro.id]);
    return { ok: true };
  });
}
