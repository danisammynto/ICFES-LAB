/**
 * Pool de conexiones a PostgreSQL y utilidades de acceso.
 * Todas las consultas usan parámetros ($1, $2…) para prevenir inyección SQL.
 */
import pg from 'pg';
import { env } from './env.js';

const { Pool, types } = pg;

// NUMERIC → number, BIGINT/COUNT → number (los valores del proyecto caben en 2^53), DATE → 'YYYY-MM-DD'.
types.setTypeParser(1700, (v) => (v === null ? null : Number.parseFloat(v)));
types.setTypeParser(20, (v) => (v === null ? null : Number.parseInt(v, 10)));
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({
  connectionString: env.db.url,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
  max: env.db.maxConexiones,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'icfes-lab',
});

pool.on('error', (error) => {
  console.error('[db] Error inesperado en una conexión inactiva:', error.message);
});

/** Ejecuta una consulta parametrizada con el pool. */
export function query(texto, parametros = []) {
  return pool.query(texto, parametros);
}

/** Devuelve la primera fila o null. */
export async function una(texto, parametros = [], cliente = pool) {
  const { rows } = await cliente.query(texto, parametros);
  return rows[0] ?? null;
}

/** Devuelve todas las filas. */
export async function varias(texto, parametros = [], cliente = pool) {
  const { rows } = await cliente.query(texto, parametros);
  return rows;
}

/**
 * Ejecuta `fn(cliente)` dentro de una transacción.
 * Si fn lanza un error se hace ROLLBACK y el error se propaga.
 */
export async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Zona horaria validada en env.js para interpolar en SQL:
 *   `(creado_en AT TIME ZONE '${TZ}')::date`
 */
export const TZ = env.zonaHoraria;
