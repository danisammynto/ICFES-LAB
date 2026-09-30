/**
 * Utilidades de azar. `crearGenerador(semilla)` produce secuencias reproducibles:
 * así "Simulacro 3" tiene las mismas preguntas para todos los estudiantes.
 */

/** Generador pseudoaleatorio mulberry32 (rápido y suficiente para barajar). */
export function crearGenerador(semilla) {
  let estado = semilla >>> 0;
  return function siguiente() {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash entero simple de un texto (para derivar semillas). */
export function hashTexto(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Baraja (Fisher–Yates) devolviendo un arreglo nuevo. */
export function barajar(lista, aleatorio = Math.random) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/** Elemento al azar de una lista. */
export function elegir(lista, aleatorio = Math.random) {
  return lista.length ? lista[Math.floor(aleatorio() * lista.length)] : undefined;
}
