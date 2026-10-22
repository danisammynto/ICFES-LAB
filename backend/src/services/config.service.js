/**
 * Configuración global (tabla `configuracion`) con una caché breve en memoria, y la fecha del
 * examen de cada estudiante según su calendario del Saber 11 (A o B).
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

// ---------------------------------------------------------------------------
// Calendarios del Saber 11 (A y B) y fecha del examen de cada estudiante
// ---------------------------------------------------------------------------

export const CALENDARIOS = Object.freeze(['A', 'B']);

/** Valores por defecto: sin fechas. Las fechas oficiales las registra el administrador. */
const CALENDARIOS_POR_DEFECTO = Object.freeze({
  A: { convocatoria: 'Saber 11 Calendario A', meses: 'entre finales de julio y agosto', fechas: [], fuente: null },
  B: { convocatoria: 'Saber 11 Calendario B', meses: 'en marzo', fechas: [], fuente: null },
});

/** Configuración de los dos calendarios (fechas oficiales publicadas por el ICFES). */
export async function calendariosIcfes() {
  const guardada = (await obtenerConfig('calendarios_icfes')) ?? {};
  const resultado = { revisado: guardada.revisado ?? null };
  for (const letra of CALENDARIOS) {
    const c = { ...CALENDARIOS_POR_DEFECTO[letra], ...(guardada[letra] ?? {}) };
    c.fechas = (Array.isArray(c.fechas) ? c.fechas : [])
      .filter((f) => f && typeof f.fecha === 'string')
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    resultado[letra] = c;
  }
  return resultado;
}

/**
 * Estado de la fecha del examen para un calendario.
 *   oficial       el ICFES publicó una única fecha (futura)
 *   elegida       el ICFES publicó varias y el estudiante eligió la de su citación
 *   varias        el ICFES publicó varias y falta que el estudiante elija la suya
 *   citacion      no hay fecha oficial publicada; se usa la que el estudiante ingresó de su citación
 *   sin_publicar  no hay fecha oficial ni dato del estudiante: no se inventa ninguna fecha
 */
export function estadoCalendario(letra, config, personal = null, hoy = fechaLocal()) {
  const conf = config[letra];
  const opciones = conf.fechas.filter((f) => f.fecha >= hoy);
  const base = {
    calendario: letra,
    convocatoria: conf.convocatoria,
    nombre: conf.convocatoria,
    meses: conf.meses,
    fuente: conf.fuente ?? null,
    opciones,
    estimada: false,
  };
  const conFecha = (estado, fecha, oficial, mensaje) => ({
    ...base, estado, fecha, oficial, personal: !oficial, dias: diasEntre(hoy, fecha), mensaje,
  });

  if (opciones.length === 1) {
    return conFecha('oficial', opciones[0].fecha, true, `Fecha oficial publicada por el ICFES${conf.fuente ? ` (${conf.fuente})` : ''}.`);
  }
  if (opciones.length > 1) {
    if (personal && opciones.some((o) => o.fecha === personal)) {
      return conFecha('elegida', personal, true, 'El ICFES publicó varias fechas: usamos la que elegiste según tu citación.');
    }
    return {
      ...base,
      estado: 'varias',
      fecha: null,
      oficial: true,
      personal: false,
      dias: null,
      mensaje: `El ICFES publicó ${opciones.length} fechas para el ${conf.convocatoria}. Elige la que aparece en tu citación para calcular los días que faltan.`,
    };
  }
  if (personal && personal >= hoy) {
    return conFecha('citacion', personal, false,
      `El ICFES aún no publica la fecha oficial del ${conf.convocatoria}: usamos la fecha de tu citación.`);
  }
  return {
    ...base,
    estado: 'sin_publicar',
    fecha: null,
    oficial: false,
    personal: false,
    dias: null,
    mensaje: `El ICFES aún no ha publicado la fecha oficial del ${conf.convocatoria}. Suele presentarse ${conf.meses}; `
      + 'la cuenta regresiva se activará cuando la publique.',
  };
}

/**
 * Fecha del examen de un estudiante según su calendario (A o B).
 * `dias` es null cuando no hay una fecha confiable (sin calendario, sin publicar o por elegir).
 */
export async function fechaIcfes(usuarioId) {
  const perfil = await una(`SELECT calendario_icfes, fecha_icfes FROM perfiles WHERE usuario_id = $1`, [usuarioId]);
  const config = await calendariosIcfes();
  if (!perfil?.calendario_icfes) {
    return {
      calendario: null,
      estado: 'sin_calendario',
      fecha: null,
      nombre: 'Saber 11',
      estimada: false,
      oficial: false,
      personal: false,
      dias: null,
      opciones: [],
      mensaje: '¿En qué calendario presentarás la prueba Saber 11 del ICFES? Elígelo para calcular los días que faltan.',
    };
  }
  return estadoCalendario(perfil.calendario_icfes, config, perfil.fecha_icfes);
}

/** Resumen público de los dos calendarios (página de bienvenida). */
export async function resumenCalendarios() {
  const config = await calendariosIcfes();
  return Object.fromEntries(CALENDARIOS.map((letra) => {
    const e = estadoCalendario(letra, config);
    return [letra, { convocatoria: e.convocatoria, meses: e.meses, estado: e.estado, fecha: e.fecha, dias: e.dias, opciones: e.opciones }];
  }));
}
