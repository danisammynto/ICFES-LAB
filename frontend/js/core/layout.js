/**
 * Estructura común de las páginas privadas (basada en los prototipos):
 * cabecera con logo y usuario, barra lateral con iconos y navegación inferior en móvil.
 *
 * Uso en cada página:
 *   const usuario = await iniciarPagina({ activa: 'inicio' });
 */
import { api } from './api.js';
import { $, formatoNumero, h, icono } from './dom.js';
import { crearAvatar } from './avatar.js';
import { aplicarTema } from './tema.js';
import { preguntarCalendario } from './calendario.js';
import { confirmar, mostrarEventos } from './ui.js';

const NAVEGACION = [
  { id: 'inicio', texto: 'Inicio', icono: 'house', url: '/inicio' },
  { id: 'materias', texto: 'Materias', icono: 'book-open', url: '/materias' },
  { id: 'simulacros', texto: 'Simulacros', icono: 'clipboard-list', url: '/simulacros' },
  { id: 'avance', texto: 'Avance', icono: 'chart-line', url: '/avance' },
  { id: 'vanty', texto: 'Vanty', icono: 'mascota', url: '/vanty' },
  { id: 'logros', texto: 'Logros', icono: 'trophy', url: '/logros' },
  { id: 'tienda', texto: 'Tienda', icono: 'store', url: '/tienda' },
];
const NAVEGACION_MOVIL = ['inicio', 'materias', 'simulacros', 'vanty', 'avance'];

let usuarioActual = null;
export const usuario = () => usuarioActual;

/** Logo oficial de ICFES Lab (imagen con borde blanco: se ve bien en modo claro y oscuro). */
export function logo() {
  return h('img', { class: 'logo-imagen', src: '/img/logo-icfes-lab.png', alt: 'ICFES Lab', width: 520, height: 140 });
}

function chip(clase, nombreIcono, id, texto, titulo) {
  return h('span', { class: `chip ${clase}`, id, title: titulo }, icono(nombreIcono, 'icono-sm'), h('span', { class: 'valor' }, texto));
}

function construirCabecera(u, { modoExamen }) {
  const cabecera = $('#cabecera');
  if (!cabecera) return;
  cabecera.className = 'main-header';

  const menu = h('div', { class: 'menu oculto', role: 'menu', id: 'menu-usuario' },
    h('div', { class: 'fila', style: { padding: '8px 12px 12px' } },
      h('div', { class: 'avatar-imagen', style: { width: '44px', height: '44px' } }, crearAvatar(u.avatar, { tamano: 44 })),
      h('div', { class: 'crecer' }, h('strong', { class: 'truncar', style: { display: 'block' } }, u.nombre), h('span', { class: 'texto-3 texto-xs truncar', style: { display: 'block' } }, u.email))),
    h('hr'),
    h('a', { href: '/perfil', role: 'menuitem' }, icono('user'), 'Mi perfil'),
    h('a', { href: '/logros', role: 'menuitem' }, icono('trophy'), 'Logros y retos'),
    h('a', { href: '/tienda', role: 'menuitem' }, icono('store'), 'Tienda'),
    h('a', { href: '/configuracion', role: 'menuitem' }, icono('settings'), 'Configuración'),
    u.rol === 'admin' ? h('a', { href: '/admin', role: 'menuitem' }, icono('shield'), 'Administración') : null,
    h('hr'),
    h('button', { type: 'button', role: 'menuitem', onclick: () => { alternar(false); cerrarSesion(); } }, icono('log-out'), 'Cerrar sesión'));

  const botonUsuario = h('button', {
    type: 'button', class: 'boton-usuario', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'menu-usuario',
  },
  h('span', { class: 'avatar-imagen', id: 'avatar-cabecera' }, crearAvatar(u.avatar, { tamano: 36 })),
  h('span', { class: 'nombre-usuario usuario' }, u.nombre_mostrar),
  icono('chevron-down', 'icono-sm icono-chevron'));

  const alternar = (abrir) => {
    menu.classList.toggle('oculto', !abrir);
    botonUsuario.setAttribute('aria-expanded', String(abrir));
  };
  botonUsuario.addEventListener('click', (e) => {
    e.stopPropagation();
    alternar(menu.classList.contains('oculto'));
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) alternar(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') alternar(false); });

  cabecera.replaceChildren(
    h('div', {}, h('a', { href: '/inicio', class: 'logo-enlace', 'aria-label': 'Ir al inicio' }, logo())),
    h('div', { class: 'info-usuario' },
      modoExamen ? null : h('div', { class: 'chips-jugador' },
        chip('chip-racha', 'flame', 'chip-racha', u.racha.actual, 'Días de racha'),
        chip('chip-xp', 'zap', 'chip-xp', `Nv. ${u.nivel.numero} · ${formatoNumero(u.xp)} XP`, `Nivel ${u.nivel.nombre}`),
        chip('chip-monedas', 'coins', 'chip-monedas', formatoNumero(u.monedas), 'Monedas')),
      h('div', { class: 'contenedor-menu' }, botonUsuario, menu),
      // En móvil no hay barra lateral: el botón de salir queda a la vista junto al avatar.
      modoExamen ? null : h('button', {
        type: 'button', class: 'btn btn-fantasma btn-icono boton-salir-movil', title: 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: () => cerrarSesion(),
      }, icono('log-out'))),
  );
}

function construirBarraLateral(u, activa) {
  const barra = $('#barra-lateral');
  if (!barra) return;
  barra.className = 'sidebar-lateral';
  barra.setAttribute('aria-label', 'Navegación principal');
  const elementos = [...NAVEGACION];
  if (u.rol === 'admin') elementos.push({ id: 'admin', texto: 'Admin', icono: 'shield', url: '/admin' });

  const porcentajeMeta = Math.min(100, Math.round((100 * u.hoy.minutos) / (u.hoy.meta_minutos || 30)));
  barra.replaceChildren(
    h('ul', {}, elementos.map((item) => h('li', {},
      h('a', {
        href: item.url,
        class: `nav-item ${item.id === activa ? 'nav-activo' : ''}`,
        title: item.texto,
        'aria-current': item.id === activa ? 'page' : null,
      }, icono(item.icono, 'icono-sidebar'), h('span', { class: 'texto-menu' }, item.texto))))),
    h('div', { class: 'sidebar-pie' },
      h('div', { class: 'tarjeta-meta-diaria' },
        h('strong', {}, 'Meta de hoy'),
        h('div', { class: 'fila-entre texto-xs texto-2', style: { marginBottom: '6px' } },
          h('span', { id: 'meta-texto' }, `${u.hoy.minutos} de ${u.hoy.meta_minutos} min`),
          h('span', {}, `${porcentajeMeta}%`)),
        h('div', { class: 'barra barra-sm', style: { '--valor': `${porcentajeMeta}%`, '--color': 'var(--lima-600)' } })),
      h('button', { type: 'button', class: 'nav-item nav-salir', title: 'Cerrar sesión', onclick: () => cerrarSesion() },
        icono('log-out', 'icono-sidebar'), h('span', { class: 'texto-menu' }, 'Cerrar sesión'))),
  );
}

function construirNavMovil(activa) {
  const nav = $('#nav-movil');
  if (!nav) return;
  nav.className = 'nav-movil';
  nav.setAttribute('aria-label', 'Navegación');
  nav.replaceChildren(...NAVEGACION.filter((i) => NAVEGACION_MOVIL.includes(i.id)).map((item) =>
    h('a', { href: item.url, class: item.id === activa ? 'nav-activo' : '', 'aria-current': item.id === activa ? 'page' : null },
      icono(item.icono), h('span', {}, item.texto))));
}

/**
 * Cierra la sesión en este dispositivo (o en todos, con `todas: true`) y vuelve al inicio de sesión.
 */
export async function cerrarSesion({ todas = false } = {}) {
  const ok = await confirmar(todas
    ? { titulo: '¿Cerrar todas las sesiones?', mensaje: 'Tendrás que volver a iniciar sesión en todos tus dispositivos, incluido este.', aceptar: 'Cerrar sesiones' }
    : { titulo: '¿Cerrar sesión?', mensaje: 'Podrás volver cuando quieras: tu progreso queda guardado.', aceptar: 'Cerrar sesión' });
  if (!ok) return;
  await api.post('/api/auth/logout', todas ? { todas: true } : {}).catch(() => {});
  window.location.href = `/login?sesion=${todas ? 'cerradas' : 'cerrada'}`;
}

/**
 * Verifica la sesión y construye la estructura de la página.
 * @param {{ activa?: string, modoExamen?: boolean }} opciones
 */
export async function iniciarPagina({ activa = null, modoExamen = false } = {}) {
  const u = await api.get('/api/auth/me');
  usuarioActual = u;
  aplicarTema(u.tema_interfaz);
  if (modoExamen) document.body.classList.add('modo-examen');
  construirCabecera(u, { modoExamen });
  if (!modoExamen) {
    construirBarraLateral(u, activa);
    construirNavMovil(activa);
    // Primer inicio de sesión: se pregunta el calendario del Saber 11 una sola vez (queda en el perfil).
    if (!u.calendario_icfes) {
      preguntarCalendario({ obligatorio: true }).then((r) => {
        if (!r) return;
        usuarioActual = { ...usuarioActual, calendario_icfes: r.calendario_icfes };
        procesarRecompensas(r);
      });
    }
  }
  return u;
}

/** Actualiza las fichas de la cabecera después de ganar XP, monedas o racha. */
export function actualizarJugador(jugador) {
  if (!jugador) return;
  const animar = (el) => {
    if (!el) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 450 });
  };
  const racha = $('#chip-racha .valor');
  if (racha && jugador.racha != null && racha.textContent !== String(jugador.racha)) {
    racha.textContent = jugador.racha;
    animar($('#chip-racha'));
  }
  const xp = $('#chip-xp .valor');
  if (xp && jugador.xp != null) {
    xp.textContent = `Nv. ${jugador.nivel} · ${formatoNumero(jugador.xp)} XP`;
    animar($('#chip-xp'));
  }
  const monedas = $('#chip-monedas .valor');
  if (monedas && jugador.monedas != null && monedas.textContent !== formatoNumero(jugador.monedas)) {
    monedas.textContent = formatoNumero(jugador.monedas);
    animar($('#chip-monedas'));
  }
}

/** Muestra los eventos de una respuesta de la API y refresca la cabecera. */
export function procesarRecompensas(respuesta) {
  mostrarEventos(respuesta?.eventos ?? []);
  actualizarJugador(respuesta?.jugador);
}

/** Refresca el avatar de la cabecera (tras editarlo en la tienda). */
export function actualizarAvatarCabecera(avatar) {
  const contenedor = $('#avatar-cabecera');
  if (contenedor) contenedor.replaceChildren(crearAvatar(avatar, { tamano: 36 }));
}
