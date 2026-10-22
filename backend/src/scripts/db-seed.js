/**
 * Carga el contenido académico (database/contenido/preguntas|lecciones/*.json) en la base de datos.
 * Uso: npm run db:seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { pool, transaccion } from '../config/db.js';
import { importarLecciones, importarPreguntas } from '../services/contenido.service.js';

const DIRECTORIO = path.join(env.raiz, 'database', 'contenido');

export function leerJson(subcarpeta) {
  const carpeta = path.join(DIRECTORIO, subcarpeta);
  if (!fs.existsSync(carpeta)) return [];
  return fs.readdirSync(carpeta)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((archivo) => ({ archivo, datos: JSON.parse(fs.readFileSync(path.join(carpeta, archivo), 'utf8')) }));
}

/** Importa todo el contenido dentro de una transacción. */
export async function sembrarContenido() {
  return transaccion(async (cliente) => {
    const resumen = { preguntas: 0, nuevas: 0, lecciones: 0, retiradas: 0 };
    const codigosPreguntas = [];
    const codigosLecciones = [];
    for (const { archivo, datos } of leerJson('preguntas')) {
      try {
        const r = await importarPreguntas(cliente, datos);
        resumen.preguntas += r.total;
        resumen.nuevas += r.nuevas;
        codigosPreguntas.push(...(datos.preguntas ?? []).map((p) => p.codigo));
        console.log(`  ✔ preguntas/${archivo}: ${r.total} (${r.nuevas} nuevas)`);
      } catch (error) {
        console.error(`  ✖ preguntas/${archivo}: ${error.message}`);
        (error.errores ?? []).forEach((e) => console.error(`      - ${e}`));
        throw error;
      }
    }
    for (const { archivo, datos } of leerJson('lecciones')) {
      const r = await importarLecciones(cliente, datos);
      resumen.lecciones += r.total;
      codigosLecciones.push(...(datos.lecciones ?? []).map((l) => l.codigo));
      console.log(`  ✔ lecciones/${archivo}: ${r.total}`);
    }
    // El contenido del banco que ya no está en los JSON (temarios anteriores) se desactiva:
    // se conserva con su historial de respuestas, pero deja de mostrarse.
    if (codigosPreguntas.length) {
      const r = await cliente.query(
        `UPDATE preguntas SET activa = FALSE WHERE origen = 'banco' AND activa AND NOT (codigo = ANY($1::text[]))`,
        [codigosPreguntas],
      );
      resumen.retiradas += r.rowCount;
    }
    if (codigosLecciones.length) {
      await cliente.query(`UPDATE lecciones SET activa = FALSE WHERE activa AND NOT (codigo = ANY($1::text[]))`, [codigosLecciones]);
    }
    if (resumen.retiradas) console.log(`  • ${resumen.retiradas} preguntas de temarios anteriores quedaron inactivas.`);
    return resumen;
  });
}

// Ejecución directa: node backend/src/scripts/db-seed.js
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Cargando contenido académico…');
  sembrarContenido()
    .then((r) => console.log(`\nListo: ${r.preguntas} preguntas (${r.nuevas} nuevas) y ${r.lecciones} lecciones.`))
    .catch(() => { process.exitCode = 1; })
    .finally(() => pool.end());
}
