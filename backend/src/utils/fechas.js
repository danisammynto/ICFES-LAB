/**
 * Fechas en la zona horaria de la aplicación (America/Bogota por defecto).
 * Las fechas "de calendario" se manejan como texto 'YYYY-MM-DD' para evitar desfases.
 */
import { env } from '../config/env.js';

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.zonaHoraria,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: env.zonaHoraria,
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Fecha local 'YYYY-MM-DD' de un instante (por defecto, ahora). */
export function fechaLocal(instante = new Date()) {
  return formatoFecha.format(instante);
}

/** Hora local (0–23). */
export function horaLocal(instante = new Date()) {
  return Number.parseInt(formatoHora.format(instante), 10);
}

/** Convierte 'YYYY-MM-DD' en un Date UTC a medianoche (útil para aritmética de días). */
function aUTC(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Días entre dos fechas 'YYYY-MM-DD' (b − a). */
export function diasEntre(a, b) {
  return Math.round((aUTC(b) - aUTC(a)) / 86_400_000);
}

/** Suma n días a una fecha 'YYYY-MM-DD'. */
export function sumarDias(fecha, n) {
  return new Date(aUTC(fecha) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Lunes de la semana de una fecha 'YYYY-MM-DD'. */
export function inicioSemana(fecha) {
  const diaSemana = new Date(aUTC(fecha)).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((diaSemana + 6) % 7));
}

/** Valida 'YYYY-MM-DD' real (rechaza 2027-02-30). */
export function esFechaValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}
