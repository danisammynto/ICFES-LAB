/**
 * Base de conocimiento de Vanty para el modo local (sin API de IA).
 * Se carga desde database/contenido/conocimiento/*.json al iniciar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env.js';
import { varias } from '../../config/db.js';
import { normalizar } from '../../utils/texto.js';

const DIRECTORIO = path.join(env.raiz, 'database', 'contenido', 'conocimiento');
let entradas = null;

function cargar() {
  if (entradas) return entradas;
  entradas = [];
  if (!fs.existsSync(DIRECTORIO)) return entradas;
  for (const archivo of fs.readdirSync(DIRECTORIO).filter((f) => f.endsWith('.json'))) {
    try {
      const datos = JSON.parse(fs.readFileSync(path.join(DIRECTORIO, archivo), 'utf8'));
      for (const e of datos.entradas ?? []) {
        entradas.push({
          ...e,
          materia: datos.materia,
          claves: (e.palabras_clave ?? []).map(normalizar),
          tituloNormalizado: normalizar(e.titulo),
        });
      }
    } catch (error) {
      console.warn(`[vanty] No se pudo leer ${archivo}: ${error.message}`);
    }
  }
  return entradas;
}

const PALABRAS_VACIAS = new Set(['que', 'como', 'cual', 'cuales', 'para', 'por', 'una', 'uno', 'unos', 'las', 'los', 'del', 'con', 'sobre', 'explica', 'explicame', 'es', 'el', 'la', 'de', 'en', 'y', 'a', 'me', 'mi', 'se', 'un', 'lo', 'al', 'hay', 'son', 'sirve', 'hace', 'hacer', 'dime', 'porfa', 'favor']);

/** Devuelve las entradas más relevantes para un texto (puntaje > 0). */
export function buscarConocimiento(texto, { materia = null, limite = 2 } = {}) {
  const t = normalizar(texto);
  const palabras = t.split(/[^a-z0-9ñ]+/).filter((p) => p.length > 2 && !PALABRAS_VACIAS.has(p));

  return cargar()
    .map((e) => {
      let puntaje = 0;
      for (const clave of e.claves) {
        if (clave && t.includes(clave)) puntaje += clave.includes(' ') ? 4 : 3;
      }
      if (t.includes(e.tituloNormalizado)) puntaje += 5;
      for (const p of palabras) {
        if (e.tituloNormalizado.includes(p)) puntaje += 1;
      }
      if (materia && e.materia === materia) puntaje += 0.5;
      return { entrada: e, puntaje };
    })
    .filter((r) => r.puntaje >= 3)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite)
    .map((r) => r.entrada);
}

/** Entrada de conocimiento asociada a un subtema (para tips al explicar preguntas). */
export function conocimientoDeSubtema(subtemaSlug) {
  return cargar().find((e) => e.subtema === subtemaSlug) ?? null;
}

/** Busca lecciones cuyo título o resumen coincidan con el texto. */
export async function buscarLecciones(texto, limite = 2) {
  const palabras = normalizar(texto).split(/[^a-z0-9ñ]+/).filter((p) => p.length > 3 && !PALABRAS_VACIAS.has(p));
  if (!palabras.length) return [];
  const filas = await varias(
    `SELECT l.id, l.titulo, l.resumen, s.nombre AS subtema, m.nombre AS materia
       FROM lecciones l
       JOIN subtemas s ON s.id = l.subtema_id
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
      WHERE l.activa`,
  );
  return filas
    .map((l) => {
      const campo = normalizar(`${l.titulo} ${l.resumen} ${l.subtema}`);
      return { l, puntaje: palabras.filter((p) => campo.includes(p)).length };
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, limite)
    .map((x) => x.l);
}
