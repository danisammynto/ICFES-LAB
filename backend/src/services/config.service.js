/**
 * Configuración global (tabla `configuracion`) con una caché breve en memoria.
 */
import { query, una } from '../config/db.js';
import { diasEntre, fechaLocal } from '../utils/fechas.js';

const cache = new Map();
const TTL_MS = 30_000;

export async function obtenerConfig(clave) {
  const enCache = cache.get(clave);
  if (enCache && enCache.expira > Date.now()) return enCache.valor;
  const fila = await una(`SELECT valor FROM configuracion WHERE clave = $1`, [clave]);
  const valor = fila?.valor ?? null;
  cache.set(clave, { valor, expira: Date.now() + TTL_MS });
  return valor;
}

export async function guardarConfig(clave, valor, descripcion = '') {
  await query(
    `INSERT INTO configuracion (clave, valor, descripcion) VALUES ($1, $2, $3)
     ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`,
    [clave, JSON.stringify(valor), descripcion],
  );
  cache.delete(clave);
  return valor;
}

/**
 * Fecha del examen para un estudiante: la personal si la definió, o la global.
 * `dias` es negativo si la fecha ya pasó.
 */
export async function fechaIcfes(usuarioId = null) {
  const global = (await obtenerConfig('fecha_icfes')) ?? {};
  const personal = usuarioId
    ? (await una(`SELECT fecha_icfes FROM perfiles WHERE usuario_id = $1`, [usuarioId]))?.fecha_icfes
    : null;
  const fecha = personal || global.fecha || null;

  return {
    fecha,
    nombre: personal ? 'Tu fecha del Saber 11' : global.nombre || 'Saber 11',
    estimada: personal ? false : Boolean(global.estimada),
    personal: Boolean(personal),
    fecha_global: global.fecha ?? null,
    dias: fecha ? diasEntre(fechaLocal(), fecha) : null,
  };
}
