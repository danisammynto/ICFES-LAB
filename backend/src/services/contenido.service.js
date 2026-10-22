/**
 * Carga del contenido académico (formato de database/contenido/FORMATO.md).
 * Lo usan el script de siembra (`npm run db:seed`), el generador de SQL y la importación
 * desde el panel de administración. Todas las operaciones son idempotentes (upsert por código).
 */
import { una, varias } from '../config/db.js';

const LETRAS = ['A', 'B', 'C', 'D'];
const TIPOS_BLOQUE = new Set(['texto', 'subtitulo', 'concepto', 'formula', 'ejemplo', 'lista', 'tabla', 'imagen', 'tip', 'alerta', 'ejercicio']);

const textoValido = (v, max = 10_000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Valida una pregunta en formato de contenido. Devuelve la lista de errores. */
export function validarPregunta(p, { contextos = {}, subtemas = new Set() } = {}) {
  const errores = [];
  const id = p?.codigo ?? '(sin código)';
  if (!textoValido(p?.codigo, 40) || !/^[A-Za-z0-9-]+$/.test(p.codigo)) errores.push(`${id}: código inválido`);
  if (!subtemas.has(p?.subtema)) errores.push(`${id}: subtema "${p?.subtema}" no existe`);
  if (![1, 2, 3].includes(p?.dificultad)) errores.push(`${id}: dificultad debe ser 1, 2 o 3`);
  if (!textoValido(p?.enunciado, 3000)) errores.push(`${id}: falta el enunciado`);
  // La explicación es opcional (el banco puede traer solo la respuesta correcta).
  if (p?.explicacion != null && (typeof p.explicacion !== 'string' || p.explicacion.length > 6000)) errores.push(`${id}: explicación inválida`);
  if (p?.contexto_ref && p?.contexto) errores.push(`${id}: usa contexto_ref o contexto, no ambos`);
  if (p?.contexto_ref && !contextos[p.contexto_ref]) errores.push(`${id}: contexto_ref "${p.contexto_ref}" no existe`);
  if (p?.imagen && !/^(\/img\/|https:\/\/)/.test(p.imagen)) errores.push(`${id}: la imagen debe ser /img/... o https://`);
  if (p?.tiempo_estimado_seg != null && !(p.tiempo_estimado_seg >= 15 && p.tiempo_estimado_seg <= 600)) {
    errores.push(`${id}: tiempo_estimado_seg fuera de rango (15–600)`);
  }
  // 4 opciones (A–D) o, como en varias partes de la prueba de Inglés, 3 opciones (A–C).
  if (!Array.isArray(p?.opciones) || ![3, 4].includes(p.opciones.length)) {
    errores.push(`${id}: debe tener 3 o 4 opciones`);
  } else {
    if (p.opciones.map((o) => o.letra).join('') !== 'ABCD'.slice(0, p.opciones.length)) errores.push(`${id}: las letras deben ser A, B, C (y D) en orden`);
    if (p.opciones.filter((o) => o.correcta === true).length !== 1) errores.push(`${id}: debe tener exactamente 1 opción correcta`);
    if (!p.opciones.every((o) => textoValido(o.texto, 2000))) errores.push(`${id}: hay opciones sin texto`);
  }
  return errores;
}

export function validarLeccion(l, { subtemas = new Set() } = {}) {
  const errores = [];
  const id = l?.codigo ?? '(sin código)';
  if (!textoValido(l?.codigo, 30)) errores.push(`${id}: código inválido`);
  if (!subtemas.has(l?.subtema)) errores.push(`${id}: subtema "${l?.subtema}" no existe`);
  if (!textoValido(l?.titulo, 150)) errores.push(`${id}: falta el título`);
  if (!Array.isArray(l?.bloques) || !l.bloques.length) errores.push(`${id}: no tiene bloques`);
  for (const b of l?.bloques ?? []) {
    if (!TIPOS_BLOQUE.has(b?.tipo)) errores.push(`${id}: tipo de bloque desconocido "${b?.tipo}"`);
    if (b?.tipo === 'ejercicio' && (!Array.isArray(b.opciones) || b.opciones.length !== 4 || !(b.correcta >= 0 && b.correcta <= 3))) {
      errores.push(`${id}: ejercicio inválido`);
    }
    if (b?.tipo === 'tabla' && (!Array.isArray(b.filas) || !b.filas.every((f) => Array.isArray(f)))) errores.push(`${id}: tabla inválida`);
    if (b?.tipo === 'imagen' && !/^(\/img\/|https:\/\/)/.test(b.src ?? '')) errores.push(`${id}: la imagen debe ser /img/... o https://`);
  }
  return errores;
}

async function mapaSubtemas(cliente) {
  const filas = await varias(`SELECT id, slug FROM subtemas`, [], cliente);
  return new Map(filas.map((f) => [f.slug, f.id]));
}

async function guardarContexto(cliente, codigo, { titulo = null, texto, imagen = null, imagen_alt: imagenAlt = null, fuente = null }) {
  const fila = await una(
    `INSERT INTO contextos (codigo, titulo, contenido, imagen_url, imagen_alt, fuente)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (codigo) DO UPDATE SET
       titulo = EXCLUDED.titulo, contenido = EXCLUDED.contenido, imagen_url = EXCLUDED.imagen_url,
       imagen_alt = EXCLUDED.imagen_alt, fuente = EXCLUDED.fuente
     RETURNING id`,
    [codigo, titulo, texto, imagen, imagenAlt, fuente],
    cliente,
  );
  return fila.id;
}

/**
 * Inserta o actualiza una pregunta con sus opciones (3 o 4).
 * @returns {Promise<{ id: number, nueva: boolean }>}
 */
export async function guardarPregunta(cliente, p, { subtemaId, contextoId, origen = 'banco' }) {
  const fila = await una(
    `INSERT INTO preguntas (codigo, subtema_id, contexto_id, enunciado, imagen_url, imagen_alt, dificultad, competencia,
                            explicacion, tiempo_estimado_seg, etiquetas, origen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (codigo) DO UPDATE SET
       subtema_id = EXCLUDED.subtema_id, contexto_id = EXCLUDED.contexto_id, enunciado = EXCLUDED.enunciado,
       imagen_url = EXCLUDED.imagen_url, imagen_alt = EXCLUDED.imagen_alt, dificultad = EXCLUDED.dificultad,
       competencia = EXCLUDED.competencia, explicacion = EXCLUDED.explicacion,
       tiempo_estimado_seg = EXCLUDED.tiempo_estimado_seg, etiquetas = EXCLUDED.etiquetas, activa = TRUE
     RETURNING id, (xmax = 0) AS nueva`,
    [p.codigo, subtemaId, contextoId, p.enunciado, p.imagen ?? null, p.imagen_alt ?? null, p.dificultad,
      p.competencia ?? null, p.explicacion ?? '', p.tiempo_estimado_seg ?? 120, p.etiquetas ?? [], origen],
    cliente,
  );
  // Se desmarca la correcta anterior antes del upsert para no violar el índice de "una sola correcta".
  await cliente.query(`UPDATE opciones SET es_correcta = FALSE WHERE pregunta_id = $1`, [fila.id]);
  const letras = LETRAS.slice(0, p.opciones.length);
  for (const [i, o] of p.opciones.entries()) {
    await cliente.query(
      `INSERT INTO opciones (pregunta_id, letra, texto, es_correcta, retroalimentacion)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (pregunta_id, letra) DO UPDATE SET
         texto = EXCLUDED.texto, es_correcta = EXCLUDED.es_correcta, retroalimentacion = EXCLUDED.retroalimentacion`,
      [fila.id, letras[i], o.texto, o.correcta === true, o.retroalimentacion ?? null],
    );
  }
  // Si la pregunta pasó de 4 a 3 opciones, se retira la sobrante.
  await cliente.query(`DELETE FROM opciones WHERE pregunta_id = $1 AND NOT (letra = ANY($2::text[]))`, [fila.id, letras]);
  return { id: fila.id, nueva: fila.nueva };
}

/**
 * Importa un archivo de preguntas completo. Lanza un error con la lista de problemas si
 * alguna pregunta no es válida (no se importa nada parcialmente: usar dentro de una transacción).
 */
export async function importarPreguntas(cliente, datos, { origen = 'banco' } = {}) {
  const subtemas = await mapaSubtemas(cliente);
  const contextos = datos.contextos ?? {};
  const preguntas = datos.preguntas ?? [];
  const errores = preguntas.flatMap((p) => validarPregunta(p, { contextos, subtemas: new Set(subtemas.keys()) }));
  const codigos = preguntas.map((p) => p.codigo);
  const repetidos = codigos.filter((c, i) => codigos.indexOf(c) !== i);
  if (repetidos.length) errores.push(`Códigos repetidos: ${[...new Set(repetidos)].join(', ')}`);
  if (errores.length) {
    const error = new Error(`El archivo tiene ${errores.length} error(es).`);
    error.errores = errores;
    throw error;
  }

  const idsContexto = {};
  for (const [codigo, ctx] of Object.entries(contextos)) {
    idsContexto[codigo] = await guardarContexto(cliente, codigo, ctx);
  }

  let nuevas = 0;
  for (const p of preguntas) {
    let contextoId = null;
    if (p.contexto_ref) contextoId = idsContexto[p.contexto_ref];
    else if (p.contexto) contextoId = await guardarContexto(cliente, `${p.codigo}-CTX`, { texto: p.contexto });
    const { nueva } = await guardarPregunta(cliente, p, { subtemaId: subtemas.get(p.subtema), contextoId, origen });
    if (nueva) nuevas += 1;
  }
  return { total: preguntas.length, nuevas, actualizadas: preguntas.length - nuevas };
}

export async function importarLecciones(cliente, datos) {
  const subtemas = await mapaSubtemas(cliente);
  const lecciones = datos.lecciones ?? [];
  const errores = lecciones.flatMap((l) => validarLeccion(l, { subtemas: new Set(subtemas.keys()) }));
  if (errores.length) {
    const error = new Error(`El archivo de lecciones tiene ${errores.length} error(es).`);
    error.errores = errores;
    throw error;
  }
  const ordenPorSubtema = new Map();
  for (const l of lecciones) {
    const orden = (ordenPorSubtema.get(l.subtema) ?? 0) + 1;
    ordenPorSubtema.set(l.subtema, orden);
    await cliente.query(
      `INSERT INTO lecciones (subtema_id, codigo, titulo, resumen, contenido, duracion_min, xp_recompensa, monedas_recompensa, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (codigo) DO UPDATE SET
         subtema_id = EXCLUDED.subtema_id, titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen,
         contenido = EXCLUDED.contenido, duracion_min = EXCLUDED.duracion_min, activa = TRUE`,
      [subtemas.get(l.subtema), l.codigo, l.titulo, l.resumen ?? '', JSON.stringify(l.bloques),
        l.duracion_min ?? 8, l.xp ?? 30, l.monedas ?? 5, l.orden ?? orden],
    );
  }
  return { total: lecciones.length };
}
