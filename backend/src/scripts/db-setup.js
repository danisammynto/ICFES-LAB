/**
 * Instalación de la base de datos:
 *   1. Crea la base de datos si no existe (requiere permisos CREATEDB).
 *   2. Aplica database/schema.sql (si las tablas aún no existen).
 *   3. Aplica database/seed.sql (catálogo, idempotente).
 *   4. Carga el contenido académico (preguntas y lecciones en JSON).
 *
 * Uso:
 *   npm run db:setup   → instala o actualiza el catálogo sin borrar datos
 *   npm run db:reset   → BORRA todo el esquema y lo recrea desde cero
 *   node backend/src/scripts/db-setup.js --solo-si-vacia
 *                      → solo instala si la base está vacía (útil al arrancar contenedores:
 *                        no sobrescribe preguntas editadas desde el panel de administración)
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { env } from '../config/env.js';
import { pool } from '../config/db.js';
import { sembrarContenido } from './db-seed.js';

const reiniciar = process.argv.includes('--reset');
const soloSiVacia = process.argv.includes('--solo-si-vacia');
const leer = (archivo) => fs.readFileSync(path.join(env.raiz, 'database', archivo), 'utf8');

async function crearBaseSiNoExiste() {
  const url = new URL(env.db.url);
  const nombre = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!nombre) return;
  url.pathname = '/postgres';
  const cliente = new pg.Client({ connectionString: url.toString(), ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined });
  try {
    await cliente.connect();
    const existe = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (!existe.rowCount) {
      await cliente.query(`CREATE DATABASE "${nombre.replace(/"/g, '""')}" ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`✔ Base de datos "${nombre}" creada.`);
    }
  } catch (error) {
    console.warn(`! No se pudo verificar o crear la base "${nombre}" (${error.message}). Se intentará usarla tal como está.`);
  } finally {
    await cliente.end().catch(() => {});
  }
}

async function main() {
  await crearBaseSiNoExiste();

  if (reiniciar) {
    console.log('! Reiniciando el esquema public (se borran todos los datos)…');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }

  const { rows } = await pool.query(`SELECT to_regclass('public.usuarios') IS NOT NULL AS existe`);
  if (rows[0].existe) {
    // Migraciones idempotentes para bases creadas con versiones anteriores del esquema.
    const carpeta = path.join(env.raiz, 'database', 'migraciones');
    const migraciones = fs.existsSync(carpeta) ? fs.readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort() : [];
    for (const archivo of migraciones) {
      await pool.query(fs.readFileSync(path.join(carpeta, archivo), 'utf8'));
    }
    if (migraciones.length) console.log(`✔ Migraciones aplicadas: ${migraciones.join(', ')}.`);
  }
  if (rows[0].existe && soloSiVacia) {
    console.log('• La base de datos ya está instalada: no se modifica el contenido (--solo-si-vacia).');
    return;
  }
  if (rows[0].existe) {
    console.log('• El esquema ya existe: se omite schema.sql (usa "npm run db:reset" para recrearlo).');
  } else {
    await pool.query(leer('schema.sql'));
    console.log('✔ Esquema creado (schema.sql).');
  }

  await pool.query(leer('seed.sql'));
  console.log('✔ Catálogo cargado (seed.sql).');

  console.log('Cargando contenido académico…');
  const resumen = await sembrarContenido();
  console.log(`✔ ${resumen.preguntas} preguntas y ${resumen.lecciones} lecciones listas.`);
  console.log('\nBase de datos lista. Siguiente paso: npm run admin:crear (opcional) y npm start');
}

main()
  .catch((error) => {
    console.error(`\n✖ Error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
