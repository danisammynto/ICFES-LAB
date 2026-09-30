/**
 * Avatar personalizable: un personaje SVG compuesto por color, expresión, accesorio y fondo.
 * Los códigos coinciden con la tabla items_tienda de la base de datos.
 */
import { s } from './dom.js';

export const COLORES = {
  'color-lima': ['#d5e068'],
  'color-cielo': ['#81a1f6'],
  'color-indigo': ['#6a70c9'],
  'color-durazno': ['#fda879'],
  'color-menta': ['#7fd6b8'],
  'color-lavanda': ['#b9a3f5'],
  'color-coral': ['#ff8a80'],
  'color-dorado': ['#f2c14e'],
  'color-galaxia': ['#6c5ce7', '#81a1f6'],
};

export const FONDOS = {
  'fondo-indigo': { colores: ['#484ea2'] },
  'fondo-cielo': { colores: ['#dfe8ff'] },
  'fondo-lima': { colores: ['#f1f5c8'] },
  'fondo-atardecer': { colores: ['#ffe2d1', '#fda879'] },
  'fondo-estrellas': { colores: ['#23264f'], patron: 'estrellas' },
  'fondo-circuitos': { colores: ['#1f3b4d'], patron: 'circuitos' },
  'fondo-aurora': { colores: ['#81a1f6', '#d5e068'] },
  'fondo-dorado': { colores: ['#fff1c9'], patron: 'rayos' },
};

export const AVATAR_POR_DEFECTO = {
  color: 'color-lima',
  expresion: 'expresion-feliz',
  accesorio: 'accesorio-ninguno',
  fondo: 'fondo-indigo',
};

const TINTA = '#23264f';
let contador = 0;

function degradado(id, colores, vertical = true) {
  return s('linearGradient', { id, x1: 0, y1: 0, x2: vertical ? 0 : 1, y2: 1 },
    s('stop', { offset: 0, 'stop-color': colores[0] }),
    s('stop', { offset: 1, 'stop-color': colores[1] ?? colores[0] }));
}

function fondo(codigo, idBase) {
  const f = FONDOS[codigo] ?? FONDOS['fondo-indigo'];
  const grupo = s('g');
  let relleno = f.colores[0];
  if (f.colores.length > 1) {
    const defs = s('defs', {}, degradado(`${idBase}-fondo`, f.colores));
    grupo.append(defs);
    relleno = `url(#${idBase}-fondo)`;
  }
  grupo.append(s('rect', { width: 100, height: 100, fill: relleno }));
  if (f.patron === 'estrellas') {
    [[14, 18, 1.4], [80, 14, 1.8], [88, 44, 1.2], [10, 58, 1.6], [26, 34, 1], [70, 28, 1], [92, 76, 1.4]].forEach(([x, y, r]) =>
      grupo.append(s('circle', { cx: x, cy: y, r, fill: '#ffffff', opacity: 0.85 })));
  } else if (f.patron === 'circuitos') {
    grupo.append(s('path', {
      d: 'M0 20h18l6 6h14M100 30H78l-6-6H58M0 70h12l8-8h10M100 64H86l-6 6H66M18 20v-8M78 30v10',
      fill: 'none', stroke: '#7fd6b8', 'stroke-width': 1.6, opacity: 0.6,
    }));
    [[18, 12], [78, 40], [30, 62], [66, 70]].forEach(([x, y]) => grupo.append(s('circle', { cx: x, cy: y, r: 2.2, fill: '#d5e068' })));
  } else if (f.patron === 'rayos') {
    for (let i = 0; i < 12; i += 1) {
      const a = (i * Math.PI) / 6;
      grupo.append(s('path', {
        d: `M50 50L${50 + 80 * Math.cos(a)} ${50 + 80 * Math.sin(a)}L${50 + 80 * Math.cos(a + 0.2)} ${50 + 80 * Math.sin(a + 0.2)}Z`,
        fill: '#f2c14e', opacity: 0.25,
      }));
    }
  }
  return grupo;
}

function ojos(expresion) {
  const g = s('g');
  const brillo = (x, y) => s('circle', { cx: x, cy: y, r: 1.3, fill: '#ffffff' });
  switch (expresion) {
    case 'expresion-sonrisa':
      g.append(s('path', { d: 'M36 52q5-6 10 0M54 52q5-6 10 0', fill: 'none', stroke: TINTA, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      g.append(s('path', { d: 'M40 62q10 12 20 0z', fill: TINTA }));
      g.append(s('path', { d: 'M45 67q5 3 10 0', fill: 'none', stroke: '#fda879', 'stroke-width': 3, 'stroke-linecap': 'round' }));
      break;
    case 'expresion-guino':
      g.append(s('ellipse', { cx: 41, cy: 51, rx: 3.6, ry: 4.6, fill: TINTA }), brillo(42, 49.5));
      g.append(s('path', { d: 'M54 52q5 4 10 0', fill: 'none', stroke: TINTA, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      g.append(s('path', { d: 'M42 63q8 7 16 0', fill: 'none', stroke: TINTA, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      break;
    case 'expresion-concentrado':
      g.append(s('path', { d: 'M35 44l10 3M65 44l-10 3', stroke: TINTA, 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
      g.append(s('rect', { x: 37, y: 50, width: 8, height: 5, rx: 2.5, fill: TINTA }), s('rect', { x: 55, y: 50, width: 8, height: 5, rx: 2.5, fill: TINTA }));
      g.append(s('path', { d: 'M44 64h12', stroke: TINTA, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      break;
    case 'expresion-asombro':
      g.append(s('circle', { cx: 41, cy: 51, r: 5.5, fill: '#ffffff', stroke: TINTA, 'stroke-width': 2 }), s('circle', { cx: 41, cy: 51, r: 2.6, fill: TINTA }));
      g.append(s('circle', { cx: 59, cy: 51, r: 5.5, fill: '#ffffff', stroke: TINTA, 'stroke-width': 2 }), s('circle', { cx: 59, cy: 51, r: 2.6, fill: TINTA }));
      g.append(s('ellipse', { cx: 50, cy: 66, rx: 3.6, ry: 4.4, fill: TINTA }));
      break;
    case 'expresion-estrella': {
      const estrella = (cx, cy) => s('path', {
        d: `M${cx} ${cy - 6}l1.8 3.9 4.2.5-3.1 2.9.8 4.2-3.7-2.1-3.7 2.1.8-4.2-3.1-2.9 4.2-.5z`,
        fill: '#f2c14e', stroke: TINTA, 'stroke-width': 1.2, 'stroke-linejoin': 'round',
      });
      g.append(estrella(41, 51), estrella(59, 51));
      g.append(s('path', { d: 'M42 63q8 8 16 0', fill: 'none', stroke: TINTA, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      break;
    }
    case 'expresion-genio':
      g.append(s('path', { d: 'M31 47h38v4c0 5-4 8-9 8h-2c-4 0-7-3-7-6h-2c0 3-3 6-7 6h-2c-5 0-9-3-9-8z', fill: TINTA }));
      g.append(s('path', { d: 'M36 50l5 0M55 50l5 0', stroke: '#81a1f6', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
      g.append(s('path', { d: 'M43 65q7 4 14-2', fill: 'none', stroke: TINTA, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      break;
    default: // feliz
      g.append(s('ellipse', { cx: 41, cy: 51, rx: 3.6, ry: 4.6, fill: TINTA }), brillo(42, 49.5));
      g.append(s('ellipse', { cx: 59, cy: 51, rx: 3.6, ry: 4.6, fill: TINTA }), brillo(60, 49.5));
      g.append(s('path', { d: 'M42 62q8 8 16 0', fill: 'none', stroke: TINTA, 'stroke-width': 3, 'stroke-linecap': 'round' }));
  }
  return g;
}

function accesorio(codigo) {
  const g = s('g');
  switch (codigo) {
    case 'accesorio-lazo':
      g.append(s('path', { d: 'M66 22l-10 6 10 6zM66 22l10 -4v16l-10-6z', fill: '#ff8a80', stroke: TINTA, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
      g.append(s('circle', { cx: 66, cy: 28, r: 3, fill: '#fda879', stroke: TINTA, 'stroke-width': 1.2 }));
      break;
    case 'accesorio-gafas':
      g.append(s('circle', { cx: 41, cy: 51, r: 8, fill: 'rgba(255,255,255,0.25)', stroke: TINTA, 'stroke-width': 2.4 }));
      g.append(s('circle', { cx: 59, cy: 51, r: 8, fill: 'rgba(255,255,255,0.25)', stroke: TINTA, 'stroke-width': 2.4 }));
      g.append(s('path', { d: 'M49 50h2M33 49l-6-2M67 49l6-2', stroke: TINTA, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
      break;
    case 'accesorio-gorra':
      g.append(s('path', { d: 'M27 34c0-13 10-20 23-20s23 7 23 20z', fill: '#484ea2' }));
      g.append(s('path', { d: 'M50 34h33c3 0 3 5 0 5H50z', fill: '#3a3f8a' }));
      g.append(s('circle', { cx: 50, cy: 15, r: 2.6, fill: '#d5e068' }));
      break;
    case 'accesorio-antenas':
      g.append(s('path', { d: 'M40 28L33 12M60 28l7-16', stroke: TINTA, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
      g.append(s('circle', { cx: 33, cy: 11, r: 4, fill: '#d5e068', stroke: TINTA, 'stroke-width': 1.6 }));
      g.append(s('circle', { cx: 67, cy: 11, r: 4, fill: '#fda879', stroke: TINTA, 'stroke-width': 1.6 }));
      break;
    case 'accesorio-audifonos':
      g.append(s('path', { d: 'M23 50c0-18 12-30 27-30s27 12 27 30', fill: 'none', stroke: TINTA, 'stroke-width': 4, 'stroke-linecap': 'round' }));
      g.append(s('rect', { x: 17, y: 44, width: 10, height: 18, rx: 5, fill: '#81a1f6', stroke: TINTA, 'stroke-width': 1.6 }));
      g.append(s('rect', { x: 73, y: 44, width: 10, height: 18, rx: 5, fill: '#81a1f6', stroke: TINTA, 'stroke-width': 1.6 }));
      break;
    case 'accesorio-birrete':
      g.append(s('path', { d: 'M50 12l30 10-30 10-30-10z', fill: TINTA }));
      g.append(s('path', { d: 'M34 27v6c0 3 7 6 16 6s16-3 16-6v-6l-16 5z', fill: '#2e3263' }));
      g.append(s('path', { d: 'M80 22v13', stroke: '#fda879', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      g.append(s('circle', { cx: 80, cy: 37, r: 3, fill: '#fda879' }));
      break;
    case 'accesorio-corona':
      g.append(s('path', { d: 'M32 30l3-16 8 9 7-12 7 12 8-9 3 16z', fill: '#f2c14e', stroke: TINTA, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
      g.append(s('circle', { cx: 50, cy: 24, r: 2.4, fill: '#ff8a80' }), s('circle', { cx: 39, cy: 26, r: 1.8, fill: '#81a1f6' }), s('circle', { cx: 61, cy: 26, r: 1.8, fill: '#7fd6b8' }));
      break;
    default:
      break;
  }
  return g;
}

/**
 * @param {object} config { color, expresion, accesorio, fondo } (códigos de la tienda)
 * @param {{ tamano?: number, titulo?: string }} opciones
 */
export function crearAvatar(config = {}, { tamano = 40, titulo = 'Avatar' } = {}) {
  const avatar = { ...AVATAR_POR_DEFECTO, ...(config ?? {}) };
  contador += 1;
  const id = `avatar-${contador}`;
  const colores = COLORES[avatar.color] ?? COLORES['color-lima'];

  const svg = s('svg', { viewBox: '0 0 100 100', width: tamano, height: tamano, role: 'img', 'aria-label': titulo, class: 'avatar-svg' });
  const defs = s('defs', {},
    s('clipPath', { id: `${id}-circulo` }, s('circle', { cx: 50, cy: 50, r: 50 })),
    degradado(`${id}-cuerpo`, colores.length > 1 ? colores : [colores[0], colores[0]]));
  svg.append(defs);

  const grupo = s('g', { 'clip-path': `url(#${id}-circulo)` });
  grupo.append(fondo(avatar.fondo, id));
  // Cuerpo: una silueta redondeada con brillo y mejillas.
  grupo.append(s('rect', { x: 22, y: 26, width: 56, height: 84, rx: 28, fill: `url(#${id}-cuerpo)` }));
  grupo.append(s('ellipse', { cx: 50, cy: 86, rx: 18, ry: 12, fill: '#ffffff', opacity: 0.22 }));
  grupo.append(s('ellipse', { cx: 37, cy: 34, rx: 7, ry: 4, fill: '#ffffff', opacity: 0.35 }));
  if (avatar.expresion !== 'expresion-genio') {
    grupo.append(s('circle', { cx: 33, cy: 60, r: 4, fill: '#fda879', opacity: 0.55 }), s('circle', { cx: 67, cy: 60, r: 4, fill: '#fda879', opacity: 0.55 }));
  }
  grupo.append(ojos(avatar.expresion));
  grupo.append(accesorio(avatar.accesorio));
  svg.append(grupo);
  return svg;
}
