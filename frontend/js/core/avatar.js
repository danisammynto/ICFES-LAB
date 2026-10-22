/**
 * Avatar personalizable: un robot SVG compuesto por color, expresión, accesorio y fondo.
 * Los códigos coinciden con la tabla items_tienda de la base de datos.
 *
 * El cuerpo es blanco y el color elegido tiñe los apliques (antena, orejas, hombros,
 * manos y emblema), de modo que cada artículo de la tienda sigue cambiando el personaje.
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
// Carcasa blanca del robot y pantalla de la cara.
const BLANCO = '#f7f9ff';
const BLANCO_SOMBRA = '#dde4f4';
const VISOR = '#20304f';
const VISOR_CLARO = '#2c4068';
const BRILLO = '#6ff0ff';
// Los sombreros tapan la antena.
const SOMBREROS = new Set(['accesorio-gorra', 'accesorio-birrete', 'accesorio-corona']);
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

/** Cara del robot: se dibuja sobre la pantalla oscura, con trazo luminoso. */
function cara(expresion) {
  const g = s('g');
  const luz = { fill: 'none', stroke: BRILLO, 'stroke-width': 3.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  const sonrisa = (d, ancho = 2.4) => s('path', { d, ...luz, 'stroke-width': ancho, opacity: 0.9 });

  switch (expresion) {
    case 'expresion-sonrisa':
      g.append(s('circle', { cx: 41, cy: 40, r: 3.4, fill: BRILLO }), s('circle', { cx: 59, cy: 40, r: 3.4, fill: BRILLO }));
      g.append(sonrisa('M43 48q7 6 14 0', 3));
      break;
    case 'expresion-guino':
      g.append(s('path', { d: 'M37 41q4-6 8 0', ...luz }));
      g.append(s('path', { d: 'M55 41h8', ...luz }));
      g.append(sonrisa('M44 48q6 5 12 0'));
      break;
    case 'expresion-concentrado':
      g.append(s('path', { d: 'M36 40h9M55 40h9', ...luz }));
      g.append(sonrisa('M44 49h12'));
      break;
    case 'expresion-asombro':
      g.append(s('circle', { cx: 41, cy: 39, r: 4.6, fill: 'none', stroke: BRILLO, 'stroke-width': 2.6 }));
      g.append(s('circle', { cx: 59, cy: 39, r: 4.6, fill: 'none', stroke: BRILLO, 'stroke-width': 2.6 }));
      g.append(s('ellipse', { cx: 50, cy: 49, rx: 3, ry: 3.6, fill: 'none', stroke: BRILLO, 'stroke-width': 2.4 }));
      break;
    case 'expresion-estrella': {
      const estrella = (cx, cy) => s('path', {
        d: `M${cx} ${cy - 5.4}l1.6 3.5 3.8.5-2.8 2.6.7 3.8-3.3-1.9-3.3 1.9.7-3.8-2.8-2.6 3.8-.5z`,
        fill: '#ffe066', stroke: '#fff3b0', 'stroke-width': 0.8, 'stroke-linejoin': 'round',
      });
      g.append(estrella(41, 40), estrella(59, 40));
      g.append(sonrisa('M44 49q6 5 12 0'));
      break;
    }
    case 'expresion-genio':
      g.append(s('path', { d: 'M33 36h34v5c0 4-3 7-7 7h-3c-3 0-6-2-6-5h-2c0 3-3 5-6 5h-3c-4 0-7-3-7-7z', fill: '#101a33' }));
      g.append(s('path', { d: 'M37 39h6M57 39h6', stroke: BRILLO, 'stroke-width': 1.8, 'stroke-linecap': 'round', opacity: 0.8 }));
      g.append(sonrisa('M45 51q6 3 11-2'));
      break;
    default: // feliz: los ojos curvos de la imagen de referencia
      g.append(s('path', { d: 'M36 42q5-7 10 0', ...luz }));
      g.append(s('path', { d: 'M54 42q5-7 10 0', ...luz }));
      g.append(sonrisa('M45 49q5 4 10 0', 2.2));
  }
  return g;
}

function accesorio(codigo) {
  const g = s('g');
  switch (codigo) {
    case 'accesorio-lazo':
      g.append(s('path', { d: 'M70 22l-9 5 9 5zM70 22l9-3v14l-9-5z', fill: '#ff8a80', stroke: TINTA, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
      g.append(s('circle', { cx: 70, cy: 27, r: 2.8, fill: '#fda879', stroke: TINTA, 'stroke-width': 1.2 }));
      break;
    case 'accesorio-gafas':
      g.append(s('circle', { cx: 41, cy: 40, r: 7.5, fill: 'rgba(255,255,255,0.18)', stroke: '#ffffff', 'stroke-width': 2.2 }));
      g.append(s('circle', { cx: 59, cy: 40, r: 7.5, fill: 'rgba(255,255,255,0.18)', stroke: '#ffffff', 'stroke-width': 2.2 }));
      g.append(s('path', { d: 'M48.5 40h3M33.5 38l-4-1M66.5 38l4-1', stroke: '#ffffff', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
      break;
    case 'accesorio-gorra':
      g.append(s('path', { d: 'M28 24c0-11 9-17 22-17s22 6 22 17z', fill: '#484ea2' }));
      g.append(s('path', { d: 'M50 24h31c3 0 3 5 0 5H50z', fill: '#3a3f8a' }));
      g.append(s('circle', { cx: 50, cy: 8, r: 2.4, fill: '#d5e068' }));
      break;
    case 'accesorio-antenas':
      g.append(s('path', { d: 'M40 22L34 8M60 22l6-14', stroke: TINTA, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
      g.append(s('circle', { cx: 34, cy: 7, r: 3.6, fill: '#d5e068', stroke: TINTA, 'stroke-width': 1.5 }));
      g.append(s('circle', { cx: 66, cy: 7, r: 3.6, fill: '#fda879', stroke: TINTA, 'stroke-width': 1.5 }));
      break;
    case 'accesorio-audifonos':
      g.append(s('path', { d: 'M24 42c0-15 11-26 26-26s26 11 26 26', fill: 'none', stroke: TINTA, 'stroke-width': 4, 'stroke-linecap': 'round' }));
      g.append(s('rect', { x: 17, y: 36, width: 10, height: 18, rx: 5, fill: '#81a1f6', stroke: TINTA, 'stroke-width': 1.6 }));
      g.append(s('rect', { x: 73, y: 36, width: 10, height: 18, rx: 5, fill: '#81a1f6', stroke: TINTA, 'stroke-width': 1.6 }));
      break;
    case 'accesorio-birrete':
      g.append(s('path', { d: 'M50 4l28 10-28 10-28-10z', fill: TINTA }));
      g.append(s('path', { d: 'M35 19v6c0 3 7 5 15 5s15-2 15-5v-6l-15 5z', fill: '#2e3263' }));
      g.append(s('path', { d: 'M78 14v13', stroke: '#fda879', 'stroke-width': 2, 'stroke-linecap': 'round' }));
      g.append(s('circle', { cx: 78, cy: 29, r: 3, fill: '#fda879' }));
      break;
    case 'accesorio-corona':
      g.append(s('path', { d: 'M33 22l3-15 8 8 6-11 6 11 8-8 3 15z', fill: '#f2c14e', stroke: TINTA, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
      g.append(s('circle', { cx: 50, cy: 16, r: 2.2, fill: '#ff8a80' }), s('circle', { cx: 40, cy: 18, r: 1.6, fill: '#81a1f6' }), s('circle', { cx: 60, cy: 18, r: 1.6, fill: '#7fd6b8' }));
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
  const tinte = `url(#${id}-tinte)`;

  const svg = s('svg', { viewBox: '0 0 100 100', width: tamano, height: tamano, role: 'img', 'aria-label': titulo, class: 'avatar-svg' });
  svg.append(s('defs', {},
    s('clipPath', { id: `${id}-circulo` }, s('circle', { cx: 50, cy: 50, r: 50 })),
    degradado(`${id}-tinte`, colores.length > 1 ? colores : [colores[0], colores[0]]),
    degradado(`${id}-carcasa`, [BLANCO, BLANCO_SOMBRA]),
    degradado(`${id}-visor`, [VISOR_CLARO, VISOR])));

  const grupo = s('g', { 'clip-path': `url(#${id}-circulo)` });
  grupo.append(fondo(avatar.fondo, id));

  const robot = s('g');
  // Antena (se omite si el accesorio es un sombrero).
  if (!SOMBREROS.has(avatar.accesorio)) {
    robot.append(s('path', { d: 'M50 22V13', stroke: tinte, 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
    robot.append(s('circle', { cx: 50, cy: 10, r: 3.6, fill: tinte }));
  }

  // Brazos y manos: el izquierdo cuelga y el derecho saluda junto a la cabeza.
  const brazo = { fill: 'none', stroke: BLANCO_SOMBRA, 'stroke-width': 7, 'stroke-linecap': 'round' };
  robot.append(s('path', { d: 'M35 72q-9 3-12 9', ...brazo }));
  robot.append(s('path', { d: 'M67 70q12-4 17-25', ...brazo }));
  robot.append(s('circle', { cx: 21, cy: 83, r: 5.4, fill: tinte }));
  robot.append(s('circle', { cx: 86, cy: 38, r: 6, fill: tinte }));

  // Cuerpo con hombros y emblema.
  robot.append(s('rect', { x: 32, y: 62, width: 36, height: 30, rx: 13, fill: `url(#${id}-carcasa)` }));
  robot.append(s('path', { d: 'M36 66h4v8h-4zM60 66h4v8h-4z', fill: tinte, opacity: 0.85 }));
  robot.append(s('rect', { x: 43, y: 70, width: 14, height: 14, rx: 5, fill: tinte }));
  robot.append(s('path', { d: 'M50 73l1.6 2.9L54.5 77l-2.9 1.6L50 81.5l-1.6-2.9L45.5 77l2.9-1.6z', fill: '#ffffff' }));

  // Cabeza, orejas y pantalla.
  robot.append(s('rect', { x: 19, y: 36, width: 9, height: 16, rx: 4.5, fill: tinte }));
  robot.append(s('rect', { x: 72, y: 36, width: 9, height: 16, rx: 4.5, fill: tinte }));
  robot.append(s('rect', { x: 25, y: 22, width: 50, height: 42, rx: 19, fill: `url(#${id}-carcasa)` }));
  robot.append(s('ellipse', { cx: 38, cy: 31, rx: 8, ry: 4.5, fill: '#ffffff', opacity: 0.75 }));
  robot.append(s('rect', { x: 31, y: 29, width: 38, height: 27, rx: 12, fill: `url(#${id}-visor)` }));
  robot.append(cara(avatar.expresion));

  grupo.append(robot);
  grupo.append(accesorio(avatar.accesorio));
  svg.append(grupo);
  return svg;
}
