/**
 * Utilidades de texto.
 */

/** Minúsculas y sin tildes: "Pitágoras" → "pitagoras". */
export function normalizar(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Recorta un texto a n caracteres respetando palabras. */
export function recortar(texto = '', n = 60) {
  const limpio = String(texto).replace(/\s+/g, ' ').trim();
  if (limpio.length <= n) return limpio;
  const corte = limpio.slice(0, n - 1);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > n * 0.6 ? corte.slice(0, espacio) : corte).trim()}…`;
}

/** Porcentaje redondeado a 1 decimal (0 si no hay total). */
export function porcentaje(parte, total) {
  return total > 0 ? Math.round((1000 * parte) / total) / 10 : 0;
}

/** Nombre corto para saludar ("María José Pérez" → "María"). */
export function primerNombre(nombre = '') {
  return String(nombre).trim().split(/\s+/)[0] || 'estudiante';
}
