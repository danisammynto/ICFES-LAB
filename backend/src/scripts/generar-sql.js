/**
 * Genera database/seed_contenido.sql a partir de los JSON de contenido, para instalar la
 * base de datos solo con psql (sin Node):
 *   psql -d icfeslab -f database/schema.sql -f database/seed.sql -f database/seed_contenido.sql
 *
 * Uso: npm run db:sql   (no necesita conexión a la base de datos)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIRECTORIO = path.join(raiz, 'database', 'contenido');
const SALIDA = path.join(raiz, 'database', 'seed_contenido.sql');

const literal = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const arreglo = (lista = []) => (lista.length ? `ARRAY[${lista.map(literal).join(', ')}]::text[]` : `'{}'::text[]`);
const json = (v) => `${literal(JSON.stringify(v))}::jsonb`;
const subtema = (slug) => `(SELECT id FROM subtemas WHERE slug = ${literal(slug)})`;
const contexto = (codigo) => (codigo ? `(SELECT id FROM contextos WHERE codigo = ${literal(codigo)})` : 'NULL');

function leer(subcarpeta) {
  const carpeta = path.join(DIRECTORIO, subcarpeta);
  if (!fs.existsSync(carpeta)) return [];
  return fs.readdirSync(carpeta).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ archivo: f, datos: JSON.parse(fs.readFileSync(path.join(carpeta, f), 'utf8')) }));
}

function sqlContexto(codigo, c) {
  return `INSERT INTO contextos (codigo, titulo, contenido, imagen_url, imagen_alt, fuente)
VALUES (${literal(codigo)}, ${literal(c.titulo)}, ${literal(c.texto)}, ${literal(c.imagen)}, ${literal(c.imagen_alt)}, ${literal(c.fuente)})
ON CONFLICT (codigo) DO UPDATE SET titulo = EXCLUDED.titulo, contenido = EXCLUDED.contenido,
  imagen_url = EXCLUDED.imagen_url, imagen_alt = EXCLUDED.imagen_alt, fuente = EXCLUDED.fuente;`;
}

function sqlPregunta(p) {
  const codigoContexto = p.contexto_ref ?? (p.contexto ? `${p.codigo}-CTX` : null);
  const partes = [`-- ${p.codigo}`];
  if (p.contexto) partes.push(sqlContexto(`${p.codigo}-CTX`, { texto: p.contexto }));
  partes.push(`INSERT INTO preguntas (codigo, subtema_id, contexto_id, enunciado, imagen_url, imagen_alt, dificultad, competencia,
  explicacion, tiempo_estimado_seg, etiquetas, origen)
VALUES (${literal(p.codigo)}, ${subtema(p.subtema)}, ${contexto(codigoContexto)}, ${literal(p.enunciado)}, ${literal(p.imagen)},
  ${literal(p.imagen_alt)}, ${p.dificultad}, ${literal(p.competencia)}, ${literal(p.explicacion)}, ${p.tiempo_estimado_seg ?? 120},
  ${arreglo(p.etiquetas)}, 'banco')
ON CONFLICT (codigo) DO UPDATE SET subtema_id = EXCLUDED.subtema_id, contexto_id = EXCLUDED.contexto_id,
  enunciado = EXCLUDED.enunciado, imagen_url = EXCLUDED.imagen_url, imagen_alt = EXCLUDED.imagen_alt,
  dificultad = EXCLUDED.dificultad, competencia = EXCLUDED.competencia, explicacion = EXCLUDED.explicacion,
  tiempo_estimado_seg = EXCLUDED.tiempo_estimado_seg, etiquetas = EXCLUDED.etiquetas, activa = TRUE;`);
  const idPregunta = `(SELECT id FROM preguntas WHERE codigo = ${literal(p.codigo)})`;
  partes.push(`UPDATE opciones SET es_correcta = FALSE WHERE pregunta_id = ${idPregunta};`);
  partes.push(`INSERT INTO opciones (pregunta_id, letra, texto, es_correcta, retroalimentacion) VALUES
${p.opciones.map((o) => `  (${idPregunta}, ${literal(o.letra)}, ${literal(o.texto)}, ${o.correcta === true}, ${literal(o.retroalimentacion)})`).join(',\n')}
ON CONFLICT (pregunta_id, letra) DO UPDATE SET texto = EXCLUDED.texto, es_correcta = EXCLUDED.es_correcta,
  retroalimentacion = EXCLUDED.retroalimentacion;`);
  return partes.join('\n');
}

function sqlLeccion(l, orden) {
  return `INSERT INTO lecciones (subtema_id, codigo, titulo, resumen, contenido, duracion_min, xp_recompensa, monedas_recompensa, orden)
VALUES (${subtema(l.subtema)}, ${literal(l.codigo)}, ${literal(l.titulo)}, ${literal(l.resumen ?? '')}, ${json(l.bloques)},
  ${l.duracion_min ?? 8}, ${l.xp ?? 30}, ${l.monedas ?? 5}, ${orden})
ON CONFLICT (codigo) DO UPDATE SET subtema_id = EXCLUDED.subtema_id, titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen,
  contenido = EXCLUDED.contenido, duracion_min = EXCLUDED.duracion_min, activa = TRUE;`;
}

const bloques = [
  '-- =============================================================================',
  '--  ICFES Lab · Contenido académico (generado automáticamente con `npm run db:sql`)',
  '--  Fuente: database/contenido/*.json · No editar a mano.',
  '-- =============================================================================',
  '',
  "SET client_encoding = 'UTF8';",
  '',
  'BEGIN;',
];
let totalPreguntas = 0;
let totalLecciones = 0;

for (const { archivo, datos } of leer('preguntas')) {
  bloques.push('', `-- ---------------------------------------------------------------- ${archivo}`);
  for (const [codigo, c] of Object.entries(datos.contextos ?? {})) bloques.push(sqlContexto(codigo, c));
  for (const p of datos.preguntas ?? []) {
    bloques.push(sqlPregunta(p));
    totalPreguntas += 1;
  }
}
for (const { archivo, datos } of leer('lecciones')) {
  bloques.push('', `-- ---------------------------------------------------------------- lecciones/${archivo}`);
  const orden = new Map();
  for (const l of datos.lecciones ?? []) {
    orden.set(l.subtema, (orden.get(l.subtema) ?? 0) + 1);
    bloques.push(sqlLeccion(l, l.orden ?? orden.get(l.subtema)));
    totalLecciones += 1;
  }
}
// El contenido de temarios anteriores que ya no está en los JSON se desactiva (se conserva su historial).
const codigosPreguntas = leer('preguntas').flatMap(({ datos }) => (datos.preguntas ?? []).map((p) => p.codigo));
const codigosLecciones = leer('lecciones').flatMap(({ datos }) => (datos.lecciones ?? []).map((l) => l.codigo));
if (codigosPreguntas.length) {
  bloques.push('', '-- Preguntas y lecciones de temarios anteriores: quedan inactivas, con su historial.',
    `UPDATE preguntas SET activa = FALSE WHERE origen = 'banco' AND activa AND codigo NOT IN (${codigosPreguntas.map(literal).join(', ')});`);
}
if (codigosLecciones.length) {
  bloques.push(`UPDATE lecciones SET activa = FALSE WHERE activa AND codigo NOT IN (${codigosLecciones.map(literal).join(', ')});`);
}
bloques.push('', 'COMMIT;', '');

fs.writeFileSync(SALIDA, bloques.join('\n'), 'utf8');
console.log(`✔ ${path.relative(raiz, SALIDA)} generado: ${totalPreguntas} preguntas y ${totalLecciones} lecciones.`);
