/**
 * Autenticación con JWT.
 * El token viaja en una cookie httpOnly (el JavaScript del navegador no puede leerlo)
 * o, para clientes externos, en la cabecera `Authorization: Bearer <token>`.
 */
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { una } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

const EMISOR = 'icfes-lab';

export function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, rol: usuario.rol, tv: usuario.token_version },
    env.jwt.secreto,
    { algorithm: 'HS256', expiresIn: env.jwt.expira, issuer: EMISOR },
  );
}

// Secure si la app se publica por HTTPS o si la petición llegó por HTTPS (req.secure respeta TRUST_PROXY).
const opcionesCookie = (req) => ({
  httpOnly: true,
  secure: env.cookie.segura || Boolean(req?.secure),
  sameSite: 'lax',
  path: '/',
});

export function establecerCookieSesion(res, token) {
  res.cookie(env.cookie.nombre, token, { ...opcionesCookie(res.req), maxAge: env.cookie.maxAgeMs });
}

export function limpiarCookieSesion(res) {
  res.clearCookie(env.cookie.nombre, opcionesCookie(res.req));
}

function extraerToken(req) {
  const cabecera = req.get('authorization');
  if (cabecera?.startsWith('Bearer ')) return cabecera.slice(7).trim();
  return req.cookies?.[env.cookie.nombre] || null;
}

/**
 * Devuelve el usuario de la sesión o null.
 * Además de la firma, comprueba en la base de datos que la cuenta siga activa y que la
 * versión del token coincida (cambiar la contraseña invalida todas las sesiones).
 */
export async function resolverSesion(req) {
  const token = extraerToken(req);
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secreto, { algorithms: ['HS256'], issuer: EMISOR });
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.sub)) return null;

  const usuario = await una(
    `SELECT u.id, u.nombre, u.email, u.rol, u.token_version, p.nivel
       FROM usuarios u
       JOIN perfiles p ON p.usuario_id = u.id
      WHERE u.id = $1 AND u.activo`,
    [payload.sub],
  );
  if (!usuario || usuario.token_version !== payload.tv) return null;
  return usuario;
}

/** Exige una sesión válida; deja el usuario en req.usuario. */
export async function requireAuth(req, _res, next) {
  const usuario = await resolverSesion(req);
  if (!usuario) {
    throw new AppError(401, 'Tu sesión expiró o no has iniciado sesión.', { codigo: 'NO_AUTENTICADO' });
  }
  req.usuario = usuario;
  next();
}

/** Exige uno de los roles indicados (usar después de requireAuth). */
export function requireRol(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      throw new AppError(403, 'No tienes permiso para realizar esta acción.', { codigo: 'PROHIBIDO' });
    }
    next();
  };
}
