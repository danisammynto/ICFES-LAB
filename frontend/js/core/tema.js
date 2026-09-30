/**
 * Tema de la interfaz: claro, oscuro o el del sistema.
 */

const CLAVE = 'icfeslab-tema';

export function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === 'claro' || tema === 'oscuro') raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
  try {
    localStorage.setItem(CLAVE, tema || 'sistema');
  } catch {
    /* sin almacenamiento local */
  }
}

/** Devuelve 'oscuro' o 'claro' según la elección o la preferencia del sistema. */
export function temaEfectivo() {
  const elegido = document.documentElement.dataset.tema;
  if (elegido) return elegido;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
}
