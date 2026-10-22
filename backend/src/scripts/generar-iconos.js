/**
 * Genera frontend/img/iconos.svg: un sprite con solo los iconos de Lucide que usa la
 * plataforma (Lucide · licencia ISC). Uso: npm run iconos
 *
 * En el HTML: <svg class="icono"><use href="/img/iconos.svg#flame"></use></svg>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const origen = path.join(raiz, 'node_modules', 'lucide-static', 'icons');
const destino = path.join(raiz, 'frontend', 'img', 'iconos.svg');

export const ICONOS = [
  // Navegación e interfaz
  'house', 'book-open', 'clipboard-list', 'chart-line', 'bot', 'trophy', 'store', 'user', 'user-round', 'settings',
  'log-out', 'shield', 'menu', 'x', 'bell', 'check', 'circle-check', 'circle-x', 'circle-alert', 'circle-help', 'info',
  'triangle-alert', 'lock', 'lock-open', 'play', 'pause', 'flag', 'arrow-left', 'arrow-right', 'chevron-left',
  'chevron-right', 'chevron-down', 'chevron-up', 'rotate-ccw', 'refresh-cw', 'send', 'plus', 'minus', 'trash-2', 'mail',
  'key', 'eye', 'eye-off', 'sun', 'moon', 'sun-moon', 'calendar', 'calendar-days', 'clock', 'hourglass', 'timer',
  'alarm-clock', 'list-checks', 'bookmark', 'gift', 'shield-check', 'heart', 'trending-up', 'trending-down', 'award',
  'square-pen', 'pencil', 'history', 'party-popper', 'wand-sparkles', 'sparkles', 'sparkle', 'upload', 'download',
  'filter', 'message-square-plus', 'panel-left', 'external-link', 'list', 'save', 'gauge', 'sliders-horizontal',
  'ellipsis', 'school', 'map-pin', 'layout-dashboard', 'grid-3x3', 'puzzle', 'notebook-pen', 'hand-heart', 'palette',
  'shopping-bag', 'badge-check', 'footprints', 'swords', 'route', 'crosshair', 'file-text', 'circle-dot', 'infinity',
  // Gamificación
  'flame', 'zap', 'coins', 'star', 'medal', 'crown', 'rocket', 'gem', 'target', 'sprout', 'compass', 'mountain',
  'globe', 'sunrise', 'moon-star', 'brain', 'graduation-cap', 'messages-square', 'message-circle',
  // Materias y subtemas
  'calculator', 'book-open-text', 'flask-conical', 'landmark', 'languages', 'sigma', 'chart-spline', 'triangle',
  'chart-column', 'dices', 'lightbulb', 'search', 'dna', 'leaf', 'atom', 'test-tube', 'microscope', 'scroll', 'map',
  'scale', 'users', 'book-open-check', 'spell-check', 'pen-line', 'whole-word',
];

function extraerContenido(svg) {
  const cuerpo = svg.replace(/<!--[\s\S]*?-->/g, '').trim();
  const inicio = cuerpo.indexOf('>') + 1;
  const fin = cuerpo.lastIndexOf('</svg>');
  return cuerpo.slice(inicio, fin).replace(/\s*\n\s*/g, '').trim();
}

const simbolos = [];
const faltantes = [];
for (const nombre of [...new Set(ICONOS)]) {
  const archivo = path.join(origen, `${nombre}.svg`);
  if (!fs.existsSync(archivo)) {
    faltantes.push(nombre);
    continue;
  }
  // Los atributos van en un <g>: los estilos del sprite no atraviesan <use> desde otro documento.
  simbolos.push(
    `<symbol id="${nombre}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${extraerContenido(fs.readFileSync(archivo, 'utf8'))}</g></symbol>`,
  );
}

// Iconos propios de ICFES Lab (no vienen de Lucide): se dibujan con el mismo trazo.
const PROPIOS = {
  // Silueta de la mascota (gorro con punta enroscada, borla y cara sonriente): menú lateral de Vanty.
  mascota: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M12 22.3C6.9 22.3 3.9 19.4 4 15.3 4.1 10.4 8.2 4.9 12.7 2.6c2.3-1.2 4.9-.6 5.6 1.5.3.9.4 1.8.2 2.7" />'
    + '<path d="M13.4 6.4c3 2.4 6.7 5.2 6.7 8.9 0 4.1-3.1 7-8.1 7" />'
    + '<path d="M13.4 6.4c.7-1 1.8-1.5 2.7-1.1" />'
    + '<circle cx="18.5" cy="8.1" r="1.2" />'
    + '<ellipse cx="12" cy="16.2" rx="5.3" ry="4.3" />'
    + '<path d="M10.6 17.9c.9.8 1.9.8 2.8 0" /></g>'
    + '<circle cx="10.1" cy="15.6" r=".95" fill="currentColor" /><circle cx="13.9" cy="15.6" r=".95" fill="currentColor" />',
};

const sprite = [
  '<svg xmlns="http://www.w3.org/2000/svg">',
  '<!-- Iconos de Lucide (https://lucide.dev) · Licencia ISC · Copyright (c) Lucide Icons and Contributors -->',
  ...simbolos,
  '<!-- Silueta de la mascota de ICFES Lab (dibujo propio, mismo trazo que los iconos de Lucide) -->',
  ...Object.entries(PROPIOS).map(([nombre, contenido]) => `<symbol id="${nombre}" viewBox="0 0 24 24">${contenido}</symbol>`),
  '</svg>',
].join('\n');

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, sprite, 'utf8');
console.log(`✔ ${simbolos.length + Object.keys(PROPIOS).length} iconos en ${path.relative(raiz, destino)}${faltantes.length ? ` · faltan: ${faltantes.join(', ')}` : ''}`);
