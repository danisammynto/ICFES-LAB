/**
 * Punto de entrada: verifica la base de datos, levanta el servidor HTTP y lo cierra
 * ordenadamente al recibir SIGINT/SIGTERM.
 */
import { crearApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';

async function iniciar() {
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    console.error(`\n✖ No se pudo conectar a PostgreSQL: ${error.message}`);
    console.error('  Revisa DATABASE_URL en el archivo .env y que la base de datos exista (npm run db:setup).\n');
    process.exit(1);
  }

  const servidor = crearApp().listen(env.puerto, () => {
    console.log(`\n  ICFES Lab escuchando en ${env.urlPublica}`);
    console.log(`  Entorno: ${env.entorno} · Vanty: ${env.vanty.proveedor === 'claude' ? `Claude (${env.vanty.modelo})` : 'modo local'}\n`);
  });

  const cerrar = (senal) => {
    console.log(`\n${senal} recibido: cerrando el servidor…`);
    servidor.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => cerrar('SIGINT'));
  process.on('SIGTERM', () => cerrar('SIGTERM'));
}

iniciar();
