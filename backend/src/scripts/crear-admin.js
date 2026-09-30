/**
 * Crea un administrador o promueve una cuenta existente.
 *
 * Uso:
 *   npm run admin:crear -- --email admin@colegio.edu.co --nombre "Ana Pérez" --password "Clave2026"
 *   npm run admin:crear -- --email estudiante@correo.com          (promueve una cuenta existente)
 */
import { pool, una } from '../config/db.js';
import { hashPassword } from '../services/auth.service.js';

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = argumento('email')?.trim().toLowerCase();
  const nombre = argumento('nombre')?.trim() || 'Administrador';
  const password = argumento('password');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Indica un correo válido: npm run admin:crear -- --email admin@ejemplo.com --password "Clave2026"');
  }

  const existente = await una(`SELECT id FROM usuarios WHERE lower(email) = $1`, [email]);
  if (existente) {
    await pool.query(`UPDATE usuarios SET rol = 'admin', activo = TRUE WHERE id = $1`, [existente.id]);
    console.log(`✔ La cuenta ${email} ahora es administradora.`);
    return;
  }
  if (!password || password.length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) {
    throw new Error('Para crear una cuenta nueva indica --password con 8+ caracteres, letras y números.');
  }
  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, 'admin')`,
    [nombre, email, await hashPassword(password)],
  );
  console.log(`✔ Administrador creado: ${email}`);
}

main()
  .catch((error) => {
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
