/**
 * Componentes de interfaz: notificaciones, modales, celebraciones (confeti) y estados de carga.
 * `mostrarEventos` traduce los eventos de gamificación del servidor en notificaciones.
 */
import { $, formatoNumero, h, icono, montar } from './dom.js';
import { bloqueTexto } from './texto-rico.js';

// ---------------------------------------------------------------------------
// Notificaciones (toasts)
// ---------------------------------------------------------------------------

function contenedorToasts() {
  let contenedor = $('#toasts');
  if (!contenedor) {
    contenedor = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(contenedor);
  }
  return contenedor;
}

export function toast(mensaje, { tipo = 'info', icono: nombreIcono = 'circle-check', duracion = 3600 } = {}) {
  const elemento = h('div', { class: `toast ${tipo}` }, icono(nombreIcono), h('span', {}, mensaje));
  contenedorToasts().append(elemento);
  setTimeout(() => {
    elemento.classList.add('saliendo');
    elemento.addEventListener('animationend', () => elemento.remove(), { once: true });
  }, duracion);
}

export const toastError = (mensaje) => toast(mensaje, { tipo: 'error', icono: 'circle-alert', duracion: 5200 });

// ---------------------------------------------------------------------------
// Modales
// ---------------------------------------------------------------------------

/**
 * Abre un modal accesible. `contenido` es un nodo o una función (cerrar) => nodo.
 * Devuelve una promesa que se resuelve con el valor pasado a cerrar().
 */
export function modal(contenido, { clase = '', cerrable = true, etiqueta = 'Ventana' } = {}) {
  return new Promise((resolver) => {
    const enfocadoAntes = document.activeElement;
    const fondo = h('div', { class: 'modal-fondo' });
    const caja = h('div', { class: `modal ${clase}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': etiqueta, tabindex: '-1' });

    const cerrar = (valor) => {
      document.removeEventListener('keydown', teclado);
      fondo.remove();
      enfocadoAntes?.focus?.();
      resolver(valor);
    };
    const teclado = (e) => {
      if (e.key === 'Escape' && cerrable) cerrar(undefined);
      if (e.key === 'Tab') {
        const enfocables = caja.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!enfocables.length) return;
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
      }
    };

    // montar() acepta un nodo o una lista de nodos (los constructores suelen devolver [título, texto, acciones]).
    montar(caja, typeof contenido === 'function' ? contenido(cerrar) : contenido);
    fondo.append(caja);
    if (cerrable) fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(undefined); });
    document.addEventListener('keydown', teclado);
    document.body.append(fondo);
    (caja.querySelector('[autofocus]') ?? caja.querySelector('button') ?? caja).focus();
  });
}

/** Confirmación: resuelve true/false. */
export function confirmar({ titulo, mensaje, aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
  return modal((cerrar) => [
    h('h2', {}, titulo),
    mensaje ? h('p', { class: 'texto-2' }, mensaje) : null,
    h('div', { class: 'modal-acciones' },
      h('button', { class: 'btn btn-secundario', onclick: () => cerrar(false) }, cancelar),
      h('button', { class: `btn ${peligro ? 'btn-peligro' : 'btn-primario'}`, autofocus: true, onclick: () => cerrar(true) }, aceptar)),
  ], { etiqueta: titulo }).then(Boolean);
}

// ---------------------------------------------------------------------------
// Celebraciones
// ---------------------------------------------------------------------------

/** Lluvia de confeti con los colores de la marca (canvas temporal). */
export function confeti(duracionMs = 2600) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const lienzo = h('canvas', { style: { position: 'fixed', inset: '0', zIndex: '999', pointerEvents: 'none' } });
  document.body.append(lienzo);
  const ctx = lienzo.getContext('2d');
  const ancho = (lienzo.width = window.innerWidth);
  const alto = (lienzo.height = window.innerHeight);
  const colores = ['#d5e068', '#484ea2', '#81a1f6', '#fda879', '#ffffff'];
  const piezas = Array.from({ length: 140 }, () => ({
    x: Math.random() * ancho,
    y: -20 - Math.random() * alto * 0.5,
    vx: -2 + Math.random() * 4,
    vy: 2 + Math.random() * 4,
    giro: Math.random() * Math.PI,
    vg: -0.2 + Math.random() * 0.4,
    tam: 6 + Math.random() * 8,
    color: colores[Math.floor(Math.random() * colores.length)],
  }));
  const inicio = performance.now();
  const cuadro = (t) => {
    ctx.clearRect(0, 0, ancho, alto);
    for (const p of piezas) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.giro += p.vg;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.tam / 2, -p.tam / 4, p.tam, p.tam / 2);
      ctx.restore();
    }
    if (t - inicio < duracionMs) requestAnimationFrame(cuadro);
    else lienzo.remove();
  };
  requestAnimationFrame(cuadro);
}

function tarjetaCelebracion({ iconoNombre, color, sobretitulo, titulo, descripcion, recompensas = [], extra = null }) {
  return (cerrar) => [
    h('div', { class: 'medalla medalla-lg', style: { '--color': color } }, icono(iconoNombre)),
    h('p', { class: 'texto-3 texto-sm negrita mb-0', style: { textTransform: 'uppercase', letterSpacing: '0.08em' } }, sobretitulo),
    h('h2', { class: 'mt-0' }, titulo),
    descripcion ? h('p', { class: 'texto-2' }, descripcion) : null,
    recompensas.length ? h('div', { class: 'fila envolver', style: { justifyContent: 'center' } }, recompensas) : null,
    extra,
    h('div', { class: 'modal-acciones', style: { justifyContent: 'center' } },
      h('button', { class: 'btn btn-primario', autofocus: true, onclick: () => cerrar() }, '¡Genial!')),
  ];
}

const chipXp = (n) => h('span', { class: 'chip chip-xp' }, icono('zap', 'icono-sm'), `+${formatoNumero(n)} XP`);
const chipMonedas = (n) => h('span', { class: 'chip chip-monedas' }, icono('coins', 'icono-sm'), `+${formatoNumero(n)}`);
const chipInsignia = (i) => h('span', { class: 'chip chip-lima' }, icono(i.icono || 'award', 'icono-sm'), `Insignia: ${i.nombre}`);

let colaCelebraciones = Promise.resolve();
function encolar(contenido, { conConfeti = false } = {}) {
  colaCelebraciones = colaCelebraciones.then(() => {
    if (conConfeti) confeti();
    return modal(contenido, { clase: 'modal-celebracion', etiqueta: 'Celebración' });
  });
  return colaCelebraciones;
}

/**
 * Muestra los eventos de gamificación devueltos por la API.
 * Los pequeños (XP, monedas, racha) como notificaciones; los grandes (nivel, logro,
 * recompensa de racha) como celebraciones en cola.
 */
export function mostrarEventos(eventos = []) {
  if (!eventos?.length) return;
  const xp = eventos.filter((e) => e.tipo === 'xp').reduce((s, e) => s + e.cantidad, 0);
  const monedas = eventos.filter((e) => e.tipo === 'monedas').reduce((s, e) => s + e.cantidad, 0);
  if (xp) toast(`+${formatoNumero(xp)} XP${monedas ? ` · +${formatoNumero(monedas)} monedas` : ''}`, { tipo: 'xp', icono: 'zap' });
  else if (monedas) toast(`+${formatoNumero(monedas)} monedas`, { tipo: 'xp', icono: 'coins' });

  for (const e of eventos) {
    switch (e.tipo) {
      case 'racha':
        toast(e.dias === 1 ? '¡Empezaste tu racha de estudio!' : `¡Racha de ${e.dias} días!${e.record ? ' Nuevo récord.' : ''}`, { tipo: 'racha', icono: 'flame' });
        break;
      case 'protector_usado':
        toast(`Usaste ${e.cantidad} protector${e.cantidad > 1 ? 'es' : ''} de racha. ¡Tu racha sigue viva!`, { tipo: 'racha', icono: 'shield-check' });
        break;
      case 'racha_perdida':
        toast(`Tu racha anterior fue de ${e.dias} días. ¡Hoy empieza una nueva!`, { icono: 'rotate-ccw' });
        break;
      case 'subtema_completado':
        toast(`¡Completaste ${e.subtema.nombre}!`, { icono: 'badge-check' });
        break;
      case 'recompensa_racha':
        encolar(tarjetaCelebracion({
          iconoNombre: 'flame',
          color: '#f47c48',
          sobretitulo: `Recompensa por ${e.dias} días de racha`,
          titulo: e.nombre,
          descripcion: e.protectores ? `Incluye ${e.protectores} protector${e.protectores > 1 ? 'es' : ''} de racha.` : 'Tu constancia tiene premio.',
          recompensas: [e.xp ? chipXp(e.xp) : null, e.monedas ? chipMonedas(e.monedas) : null, e.insignia ? chipInsignia(e.insignia) : null].filter(Boolean),
        }), { conConfeti: true });
        break;
      case 'logro':
        encolar(tarjetaCelebracion({
          iconoNombre: e.icono || 'trophy',
          color: '#484ea2',
          sobretitulo: 'Logro desbloqueado',
          titulo: e.nombre,
          descripcion: e.descripcion,
          recompensas: [e.xp ? chipXp(e.xp) : null, e.monedas ? chipMonedas(e.monedas) : null, e.insignia ? chipInsignia(e.insignia) : null].filter(Boolean),
        }), { conConfeti: true });
        break;
      case 'nivel':
        encolar(tarjetaCelebracion({
          iconoNombre: e.icono || 'rocket',
          color: e.color || '#484ea2',
          sobretitulo: `¡Subiste al nivel ${e.nivel}!`,
          titulo: e.nombre,
          descripcion: 'Nuevos contenidos y recompensas te esperan:',
          recompensas: [e.monedas ? chipMonedas(e.monedas) : null, e.insignia ? chipInsignia(e.insignia) : null].filter(Boolean),
          extra: e.desbloqueos?.length
            ? h('ul', { class: 'lista-desbloqueos' }, e.desbloqueos.map((d) => h('li', {}, icono('lock-open', 'icono-sm'), d)))
            : null,
        }), { conConfeti: true });
        break;
      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export const cargando = (texto = 'Cargando…') =>
  h('div', { class: 'cargando', role: 'status' }, h('div', { class: 'columna', style: { alignItems: 'center' } }, h('div', { class: 'spinner' }), h('span', { class: 'texto-3 texto-sm' }, texto)));

export const vacio = (nombreIcono, titulo, texto, accion = null) =>
  h('div', { class: 'vacio' }, icono(nombreIcono), h('h3', { class: 'mb-0' }, titulo), texto ? h('p', { class: 'mb-0' }, texto) : null, accion);

export function errorCarga(error, reintentar) {
  return h('div', { class: 'vacio' },
    icono('circle-alert'),
    h('h3', { class: 'mb-0' }, 'No pudimos cargar esta sección'),
    h('p', { class: 'mb-0' }, error?.message ?? 'Intenta de nuevo en un momento.'),
    reintentar ? h('button', { class: 'btn btn-secundario', onclick: reintentar }, icono('refresh-cw'), 'Reintentar') : null);
}

/** Pone un botón en estado de carga mientras se ejecuta `accion`. */
export async function conCarga(boton, accion) {
  const contenidoOriginal = [...boton.childNodes];
  boton.disabled = true;
  boton.replaceChildren(h('span', { class: 'spinner' }), h('span', {}, 'Procesando…'));
  try {
    return await accion();
  } finally {
    boton.disabled = false;
    boton.replaceChildren(...contenidoOriginal);
  }
}

/**
 * Pestañas accesibles (role="tablist"): clic o flechas ← → para cambiar.
 * Los paneles se vinculan con aria-controls. Devuelve una función para activar por id.
 */
export function activarPestanas(lista, { alCambiar } = {}) {
  const pestanas = [...lista.querySelectorAll('[role="tab"]')];
  const activar = (pestana, enfocar = false) => {
    pestanas.forEach((p) => {
      const activa = p === pestana;
      p.setAttribute('aria-selected', String(activa));
      p.tabIndex = activa ? 0 : -1;
      const panel = document.getElementById(p.getAttribute('aria-controls'));
      if (panel) panel.hidden = !activa;
    });
    if (enfocar) pestana.focus();
    alCambiar?.(pestana.id);
  };
  pestanas.forEach((p, i) => {
    p.addEventListener('click', () => activar(p));
    p.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') activar(pestanas[(i + 1) % pestanas.length], true);
      if (e.key === 'ArrowLeft') activar(pestanas[(i - 1 + pestanas.length) % pestanas.length], true);
    });
  });
  return (id) => {
    const pestana = pestanas.find((p) => p.id === id);
    if (pestana) activar(pestana);
  };
}

/** Modal de solo lectura con texto enriquecido. */
export function modalTexto(titulo, texto) {
  return modal((cerrar) => [
    h('h2', {}, titulo),
    bloqueTexto(texto),
    h('div', { class: 'modal-acciones' }, h('button', { class: 'btn btn-primario', onclick: () => cerrar() }, 'Entendido')),
  ], { etiqueta: titulo });
}
