/**
 * Utilidades del DOM y formato.
 *
 * Seguridad: `h()` inserta los textos como nodos de texto (nunca como HTML), por lo que
 * los datos que vienen del servidor o del usuario no pueden inyectar código (XSS).
 */

const NS_SVG = 'http://www.w3.org/2000/svg';

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

function aplicarPropiedades(el, props) {
  for (const [clave, valor] of Object.entries(props ?? {})) {
    if (valor == null || valor === false) continue;
    if (clave === 'class' || clave === 'className') {
      el.setAttribute('class', Array.isArray(valor) ? valor.filter(Boolean).join(' ') : valor);
    } else if (clave === 'style' && typeof valor === 'object') {
      for (const [prop, v] of Object.entries(valor)) {
        if (v == null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (clave === 'dataset') {
      Object.assign(el.dataset, valor);
    } else if (clave.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (valor === true) {
      el.setAttribute(clave, '');
    } else {
      el.setAttribute(clave, String(valor));
    }
  }
}

function agregarHijos(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

/** Crea un elemento: h('button', { class: 'btn', onclick }, 'Texto', otroNodo) */
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  aplicarPropiedades(el, props);
  agregarHijos(el, hijos);
  return el;
}

/** Crea un elemento SVG. */
export function s(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElementNS(NS_SVG, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor != null && valor !== false) el.setAttribute(clave, String(valor));
  }
  agregarHijos(el, hijos);
  return el;
}

/** Icono del sprite de Lucide: icono('flame', 'icono-lg') */
export function icono(nombre, clase = '') {
  return s('svg', { class: `icono ${clase}`.trim(), 'aria-hidden': 'true', focusable: 'false' },
    s('use', { href: `/img/iconos.svg#${nombre}` }));
}

export function vaciar(el) {
  el.replaceChildren();
  return el;
}

/** Reemplaza el contenido de un elemento. */
export function montar(el, ...hijos) {
  vaciar(el);
  agregarHijos(el, hijos);
  return el;
}

export const parametro = (nombre) => new URLSearchParams(window.location.search).get(nombre);

// ---------------------------------------------------------------------------
// Formato (es-CO)
// ---------------------------------------------------------------------------

const numero = new Intl.NumberFormat('es-CO');
export const formatoNumero = (n) => numero.format(Number(n) || 0);

const decimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
/** 60.3 → "60,3 %" (formato colombiano). Devuelve "—" si no hay dato. */
export const formatoPorcentaje = (n) => (n == null ? '—' : `${decimal.format(n)} %`);

/** 'YYYY-MM-DD' o ISO → fecha legible. Las fechas sin hora se interpretan como locales. */
export function formatoFecha(valor, opciones = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!valor) return '';
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? new Date(Number(valor.slice(0, 4)), Number(valor.slice(5, 7)) - 1, Number(valor.slice(8, 10)))
    : new Date(valor);
  return new Intl.DateTimeFormat('es-CO', opciones).format(fecha);
}

export function formatoFechaHora(valor) {
  return formatoFecha(valor, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** Segundos → "1 h 25 min", "12 min", "45 s". */
export function formatoDuracion(segundos) {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

/** Segundos → "01:05:09" o "05:09". */
export function formatoReloj(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const dos = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${dos(mm)}:${dos(ss)}` : `${dos(mm)}:${dos(ss)}`;
}

export function tiempoRelativo(valor) {
  const diferencia = (Date.now() - new Date(valor).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat('es-CO', { numeric: 'auto' });
  if (diferencia < 60) return 'hace un momento';
  if (diferencia < 3600) return rtf.format(-Math.round(diferencia / 60), 'minute');
  if (diferencia < 86400) return rtf.format(-Math.round(diferencia / 3600), 'hour');
  if (diferencia < 86400 * 30) return rtf.format(-Math.round(diferencia / 86400), 'day');
  return formatoFecha(valor, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const pluralizar = (n, singular, plural = `${singular}s`) => `${formatoNumero(n)} ${n === 1 ? singular : plural}`;

/** Color de una materia por slug (coincide con la base de datos). */
export const COLOR_MATERIA = {
  matematicas: '#484ea2',
  'lectura-critica': '#81a1f6',
  'ciencias-naturales': '#a8bb2c',
  'sociales-ciudadanas': '#2fb3a0',
  ingles: '#b27af0',
};
