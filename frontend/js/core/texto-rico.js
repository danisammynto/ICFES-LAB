/**
 * Convierte texto con formato ligero en nodos del DOM, sin usar innerHTML.
 *
 * Soporta: párrafos (línea en blanco), saltos de línea, **negritas**, *cursivas* o _cursivas_,
 * `código`, listas (- item / 1. item), tablas con barras (a | b | c) y enlaces [texto](/ruta)
 * solo a rutas internas de la plataforma.
 */
import { h } from './dom.js';

const PATRON_EN_LINEA = /(\*\*(?=\S)[^*]*?\S\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*(?=\S)[^*\n]*?\S\*|(?<![\p{L}\p{N}])_(?=\S)[^_\n]*?\S_(?![\p{L}\p{N}]))/u;

/** Formato en línea de un fragmento de texto. */
export function enLinea(texto) {
  const nodos = [];
  let resto = texto;
  while (resto) {
    const coincidencia = PATRON_EN_LINEA.exec(resto);
    if (!coincidencia) {
      nodos.push(resto);
      break;
    }
    if (coincidencia.index > 0) nodos.push(resto.slice(0, coincidencia.index));
    const token = coincidencia[0];
    if (token.startsWith('**')) {
      nodos.push(h('strong', {}, enLinea(token.slice(2, -2))));
    } else if (token.startsWith('`')) {
      nodos.push(h('code', {}, token.slice(1, -1)));
    } else if (token.startsWith('[')) {
      const [, etiqueta, destino] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      // Solo rutas internas: evita enlaces a sitios externos o esquemas peligrosos.
      nodos.push(/^\/(?!\/)[\w\-./?=&#%]*$/.test(destino) ? h('a', { href: destino }, etiqueta) : etiqueta);
    } else {
      nodos.push(h('em', {}, enLinea(token.slice(1, -1))));
    }
    resto = resto.slice(coincidencia.index + token.length);
  }
  return nodos;
}

const esFilaTabla = (linea) => (linea.match(/\|/g) || []).length >= 1 && linea.split('|').filter((c) => c.trim()).length >= 2;
const esSeparadorTabla = (linea) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);
const celdas = (linea) => linea.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

/** Convierte un bloque de texto en un DocumentFragment. */
export function textoRico(texto = '') {
  const fragmento = document.createDocumentFragment();
  const lineas = String(texto).replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];
    if (!linea.trim()) {
      i += 1;
      continue;
    }

    // Tabla
    if (esFilaTabla(linea) && i + 1 < lineas.length && (esFilaTabla(lineas[i + 1]) || esSeparadorTabla(lineas[i + 1]))) {
      const filas = [];
      while (i < lineas.length && (esFilaTabla(lineas[i]) || esSeparadorTabla(lineas[i]))) {
        if (!esSeparadorTabla(lineas[i])) filas.push(celdas(lineas[i]));
        i += 1;
      }
      const [encabezado, ...cuerpo] = filas;
      fragmento.append(h('div', { class: 'tabla-texto' },
        h('table', {},
          h('thead', {}, h('tr', {}, encabezado.map((c) => h('th', {}, enLinea(c))))),
          h('tbody', {}, cuerpo.map((fila) => h('tr', {}, fila.map((c) => h('td', {}, enLinea(c)))))))));
      continue;
    }

    // Lista con viñetas
    if (/^\s*[-•*]\s+/.test(linea)) {
      const items = [];
      while (i < lineas.length && /^\s*[-•*]\s+/.test(lineas[i])) {
        items.push(h('li', {}, enLinea(lineas[i].replace(/^\s*[-•*]\s+/, ''))));
        i += 1;
      }
      fragmento.append(h('ul', {}, items));
      continue;
    }

    // Lista numerada
    if (/^\s*\d+[.)]\s+/.test(linea)) {
      const items = [];
      while (i < lineas.length && /^\s*\d+[.)]\s+/.test(lineas[i])) {
        items.push(h('li', {}, enLinea(lineas[i].replace(/^\s*\d+[.)]\s+/, ''))));
        i += 1;
      }
      fragmento.append(h('ol', {}, items));
      continue;
    }

    // Párrafo: líneas consecutivas unidas con saltos de línea.
    const contenido = [];
    while (i < lineas.length && lineas[i].trim() && !/^\s*([-•*]|\d+[.)])\s+/.test(lineas[i])
      && !(esFilaTabla(lineas[i]) && i + 1 < lineas.length && (esFilaTabla(lineas[i + 1]) || esSeparadorTabla(lineas[i + 1])))) {
      if (contenido.length) contenido.push(h('br'));
      contenido.push(...enLinea(lineas[i]));
      i += 1;
    }
    fragmento.append(h('p', {}, contenido));
  }
  return fragmento;
}

/** Contenedor con la clase de estilos de texto enriquecido. */
export const bloqueTexto = (texto, clase = '') => h('div', { class: `texto-rico ${clase}`.trim() }, textoRico(texto));
