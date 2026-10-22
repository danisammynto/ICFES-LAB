/**
 * Tienda y editor del personaje.
 *
 * Estructura (según la referencia de diseño): a la izquierda el personaje con su look
 * actual, la paleta de colores y cómo ganar monedas; a la derecha el catálogo por
 * secciones y la línea de evolución de la mascota.
 *
 * Elegir un artículo lo muestra en la vista previa; los propios se equipan al guardar y
 * los demás se compran con monedas.
 */
import { api } from '../core/api.js';
import { $, $$, formatoNumero, h, icono, montar } from '../core/dom.js';
import { COLORES, crearAvatar } from '../core/avatar.js';
import { crearPersonaje, ETAPAS, etapaDeNivel } from '../core/personaje.js';
import { actualizarAvatarCabecera, actualizarJugador, iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { cargando, confirmar, conCarga, errorCarga, toast, toastError } from '../core/ui.js';

const CATEGORIAS = ['color', 'expresion', 'accesorio', 'fondo'];

/** Secciones del catálogo: id del contenedor, título visible y etiqueta de la navegación. */
const SECCIONES = [
  { id: 'color', nav: 'Colores', icono: 'palette' },
  { id: 'expresion', nav: 'Expresiones', icono: 'heart', titulo: 'Rostro y expresiones', pista: (n) => `${n} expresiones` },
  { id: 'accesorio', nav: 'Accesorios', icono: 'graduation-cap', titulo: 'Accesorios', pista: (n) => `${n} estilos` },
  { id: 'fondo', nav: 'Escenarios', icono: 'sparkles', titulo: 'Escenarios y fondos', pista: (n) => `${n} escenarios` },
  { id: 'protector', nav: 'Protectores', icono: 'shield-check', titulo: 'Protector de racha' },
  { id: 'evolucion', nav: 'Evolución', icono: 'sprout' },
];

/** Monedas que entrega cada acción (backend/src/config/reglas.js y database/seed.sql). */
const FUENTES_MONEDAS = [
  { icono: 'circle-check', texto: 'Cada respuesta correcta', monedas: '+1' },
  { icono: 'book-open', texto: 'Completar una lección nueva', monedas: '+5' },
  { icono: 'badge-check', texto: 'Completar un subtema', monedas: '+20' },
  { icono: 'timer', texto: 'Terminar un minisimulacro', monedas: '+15' },
  { icono: 'clipboard-list', texto: 'Terminar un simulacro completo', monedas: '+50' },
  { icono: 'flame', texto: 'Hitos de racha', monedas: '+10 a +300' },
  { icono: 'rocket', texto: 'Subir de nivel', monedas: '+30 a +200' },
];

let datos = null;
let guardado = null;
let borrador = null;
let nivelUsuario = 1;

const articulos = (categoria) => datos.items[categoria] ?? [];
const buscar = (categoria, codigo) => articulos(categoria).find((i) => i.codigo === codigo);
const esPropio = (codigo) => CATEGORIAS.some((c) => buscar(c, codigo)?.adquirido);
const hayCambios = () => CATEGORIAS.some((c) => borrador[c] !== guardado[c]);

// ---------------------------------------------------------------------------
// Compra
// ---------------------------------------------------------------------------

async function comprar(tipo, codigo, nombre, precio) {
  if (datos.monedas < precio) {
    toastError(`Te faltan ${formatoNumero(precio - datos.monedas)} monedas. ¡Sigue estudiando para ganarlas!`);
    return false;
  }
  const ok = await confirmar({
    titulo: `¿Comprar ${nombre}?`,
    mensaje: `Cuesta ${formatoNumero(precio)} monedas. Te quedarán ${formatoNumero(datos.monedas - precio)}.`,
    aceptar: 'Comprar',
  });
  if (!ok) return false;
  try {
    const r = await api.post('/api/tienda/comprar', { tipo, codigo });
    toast(`¡Compraste ${r.comprado}!`, { icono: 'shopping-bag' });
    procesarRecompensas(r);
    await recargar();
    return true;
  } catch (error) {
    toastError(error.message);
    return false;
  }
}

/** Marca de estado de un artículo: equipado, tuyo, bloqueado o su precio. */
function marcaArticulo(item, alComprar) {
  if (item.equipado) return h('span', { class: 'chip chip-equipado' }, icono('check', 'icono-sm'), 'Equipado');
  if (item.adquirido) return h('span', { class: 'chip chip-exito' }, 'Tuyo');
  if (item.bloqueado) return h('span', { class: 'chip chip-bloqueado' }, icono('lock', 'icono-sm'), `Nv. ${item.nivel_requerido}`);
  return h('button', {
    class: 'chip chip-precio',
    'aria-label': `Comprar ${item.nombre} por ${item.precio} monedas`,
    onclick: async (e) => {
      e.stopPropagation();
      if (await alComprar()) return;
    },
  }, icono('coins', 'icono-sm'), formatoNumero(item.precio));
}

// ---------------------------------------------------------------------------
// Vista previa del personaje
// ---------------------------------------------------------------------------

function pintarVista() {
  montar($('#vista-previa'), crearAvatar(borrador, { tamano: 210, titulo: 'Tu personaje' }));
  const noPropios = CATEGORIAS.filter((c) => !esPropio(borrador[c]));
  $('#guardar-avatar').disabled = !hayCambios() || noPropios.length > 0;
  $('#restablecer-avatar').hidden = !hayCambios();
  $('#texto-vista').textContent = noPropios.length
    ? 'Vista previa: compra los artículos marcados para poder guardar este look.'
    : hayCambios() ? '¡Te ves genial! Guarda los cambios para usar este look.' : 'Este es tu personaje actual.';

  montar($('#look-actual'), CATEGORIAS.map((categoria) => {
    const item = buscar(categoria, borrador[categoria]);
    if (!item) return null;
    const cambiado = borrador[categoria] !== guardado[categoria];
    return h('span', { class: `chip ${cambiado ? 'chip-cambio' : ''}`, title: item.descripcion }, item.nombre);
  }));

  montar($('#saldo'), icono('coins'), formatoNumero(datos.monedas));
}

function elegir(item) {
  if (item.bloqueado) {
    toast(`Se desbloquea en el nivel ${item.nivel_requerido}.`, { icono: 'lock' });
    return;
  }
  borrador[item.categoria] = item.codigo;
  pintarTodo();
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

function tarjetaArticulo(item) {
  const seleccionado = borrador[item.categoria] === item.codigo;
  const muestra = { ...guardado, [item.categoria]: item.codigo };
  const tarjeta = h('div', {
    class: `articulo ${seleccionado ? 'seleccionado' : ''} ${item.bloqueado ? 'bloqueado' : ''}`,
    role: 'button',
    tabindex: '0',
    title: item.descripcion,
    'aria-pressed': String(seleccionado),
    'aria-label': `${item.nombre}${item.equipado ? ', equipado' : item.adquirido ? ', ya es tuyo'
      : item.bloqueado ? `, disponible en el nivel ${item.nivel_requerido}` : `, ${item.precio} monedas`}`,
  },
  h('div', { class: 'miniatura' }, crearAvatar(muestra, { tamano: 96, titulo: item.nombre })),
  h('strong', {}, item.nombre),
  marcaArticulo(item, async () => {
    const comprado = await comprar('item', item.codigo, item.nombre, item.precio);
    if (comprado) {
      borrador[item.categoria] = item.codigo;
      pintarTodo();
    }
    return comprado;
  }));

  tarjeta.addEventListener('click', () => elegir(item));
  tarjeta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(item); }
  });
  return tarjeta;
}

function seccionArticulos(config) {
  const lista = articulos(config.id);
  return [
    h('div', { class: 'cabecera-seccion' },
      h('h2', { id: `titulo-${config.id}` }, config.titulo),
      config.pista ? h('span', { class: 'texto-sm texto-3' }, config.pista(lista.length)) : null),
    h('div', { class: 'grid-articulos' }, lista.map(tarjetaArticulo)),
  ];
}

/** Paleta de colores (columna izquierda): cada color es una muestra circular. */
function pintarPaleta() {
  montar($('#paleta-colores'), articulos('color').map((item) => {
    const colores = COLORES[item.codigo] ?? ['#ccc'];
    const fondo = colores.length > 1
      ? `linear-gradient(135deg, ${colores[0]}, ${colores[1]})`
      : colores[0];
    const seleccionado = borrador.color === item.codigo;
    const boton = h('button', {
      type: 'button',
      class: `muestra-color ${seleccionado ? 'seleccionado' : ''} ${item.bloqueado ? 'bloqueado' : ''}`,
      style: { '--color-muestra': fondo },
      title: `${item.nombre}${item.adquirido ? ' · ya es tuyo' : item.bloqueado ? ` · nivel ${item.nivel_requerido}` : ` · ${item.precio} monedas`}`,
      'aria-pressed': String(seleccionado),
      'aria-label': `Color ${item.nombre}`,
      onclick: async () => {
        if (!item.adquirido && !item.bloqueado) {
          const comprado = await comprar('item', item.codigo, item.nombre, item.precio);
          if (!comprado) return;
          borrador.color = item.codigo;
          pintarTodo();
          return;
        }
        elegir(item);
      },
    },
    h('span', { class: 'disco', style: { background: fondo } }),
    item.bloqueado ? icono('lock', 'icono-sm')
      : item.adquirido ? (seleccionado ? icono('check', 'icono-sm') : null)
        : h('span', { class: 'precio-color' }, formatoNumero(item.precio)));
    return boton;
  }));
}

function pintarProtector() {
  const protector = articulos('protector')[0];
  const { cantidad, maximo } = datos.protectores;
  montar($('#seccion-protector'),
    h('div', { class: 'cabecera-seccion' },
      h('h2', { id: 'titulo-protector' }, 'Protector de racha'),
      h('span', { class: 'texto-sm texto-3' }, `${cantidad} de ${maximo}`)),
    h('div', { class: 'tarjeta-protector' },
      h('span', { class: 'medalla medalla-lg' }, icono('shield-check')),
      h('div', { class: 'crecer' },
        h('p', { class: 'texto-2 mb-0' }, 'Si un día no alcanzas a estudiar, un protector se usa automáticamente y tu racha sigue viva.'),
        h('div', { class: 'fila gap-2 mt-4' }, Array.from({ length: maximo }, (_, i) =>
          h('span', { class: `medalla ${i < cantidad ? '' : 'bloqueada'}`, style: { width: '38px', height: '38px', '--color': 'var(--durazno-600)' } }, icono('shield-check', 'icono-sm'))))),
      protector
        ? h('button', {
          class: 'btn btn-lima',
          disabled: cantidad >= maximo,
          onclick: () => comprar('item', protector.codigo, protector.nombre, protector.precio),
        }, icono('coins', 'icono-sm'), cantidad >= maximo ? 'Máximo alcanzado' : `Comprar por ${formatoNumero(protector.precio)}`)
        : null));
}

/** Línea de evolución de la mascota: una tarjeta por etapa, con la actual destacada. */
function pintarEvolucion() {
  const actual = etapaDeNivel(nivelUsuario);
  montar($('#seccion-evolucion'),
    h('div', { class: 'cabecera-evolucion' },
      h('span', { class: 'etiqueta-evolucion' }, 'Evolución'),
      h('h2', { id: 'titulo-evolucion' }, 'Tu mascota crece contigo'),
      h('p', {}, 'Cada nivel que alcanzas estudiando transforma a tu mascota. No se compra: se gana con XP.')),
    h('div', { class: 'grid-evolucion' }, ETAPAS.map((etapa) => {
      const alcanzada = nivelUsuario >= etapa.nivel;
      const esActual = etapa.fase === actual.fase;
      return h('article', { class: `etapa ${alcanzada ? '' : 'pendiente'} ${esActual ? 'actual' : ''}` },
        crearPersonaje({ fase: etapa.fase, clase: 'personaje-etapa', perezoso: true, etiqueta: `Mascota en la etapa ${etapa.nombre}` }),
        h('strong', {}, etapa.nombre),
        h('span', { class: 'texto-xs' }, etapa.descripcion),
        esActual
          ? h('span', { class: 'chip chip-equipado' }, icono('check', 'icono-sm'), 'Tu etapa')
          : alcanzada
            ? h('span', { class: 'chip chip-exito' }, 'Alcanzada')
            : h('span', { class: 'chip chip-bloqueado' }, icono('lock', 'icono-sm'), `Nv. ${etapa.nivel}`));
    })));
}

function pintarComoGanar() {
  montar($('#lista-ganar'), FUENTES_MONEDAS.map((f) => h('li', {},
    icono(f.icono, 'icono-sm'),
    h('span', { class: 'crecer' }, f.texto),
    h('span', { class: 'monedas-ganar' }, icono('coins', 'icono-sm'), f.monedas))));
}

/** Navegación superior: lleva a cada sección y marca la que se está viendo. */
function pintarNavegacion() {
  const nav = $('#navegacion-tienda');
  montar(nav, SECCIONES.map((s) => h('a', {
    class: 'pastilla-seccion',
    href: `#seccion-${s.id}`,
    dataset: { seccion: `seccion-${s.id}` },
  }, icono(s.icono, 'icono-sm'), s.nav)));

  const secciones = SECCIONES.map((s) => document.getElementById(`seccion-${s.id}`)).filter(Boolean);
  if (!('IntersectionObserver' in window) || !secciones.length) return;
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      $$('.pastilla-seccion', nav).forEach((a) => a.classList.toggle('activa', a.dataset.seccion === entrada.target.id));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  secciones.forEach((s) => observador.observe(s));
}

function pintarTodo() {
  pintarPaleta();
  for (const config of SECCIONES.filter((s) => ['expresion', 'accesorio', 'fondo'].includes(s.id))) {
    montar($(`#seccion-${config.id}`), seccionArticulos(config));
  }
  pintarProtector();
  pintarVista();
}

async function recargar() {
  datos = await api.get('/api/tienda');
  guardado = { ...datos.avatar };
  nivelUsuario = datos.nivel ?? nivelUsuario;
  CATEGORIAS.forEach((c) => {
    if (!borrador[c]) borrador[c] = guardado[c];
  });
  actualizarJugador({ monedas: datos.monedas });
  pintarTodo();
  pintarEvolucion();
}

$('#guardar-avatar').addEventListener('click', async (e) => {
  try {
    const { avatar } = await conCarga(e.currentTarget, () => api.put('/api/perfil/avatar', borrador));
    datos.avatar = avatar;
    await recargar();
    actualizarAvatarCabecera(avatar);
    toast('¡Personaje guardado!', { icono: 'circle-check' });
  } catch (error) {
    toastError(error.message);
  }
});

$('#restablecer-avatar').addEventListener('click', () => {
  borrador = { ...guardado };
  pintarTodo();
});

const usuario = await iniciarPagina({ activa: 'tienda' });
nivelUsuario = usuario?.nivel?.numero ?? 1;
pintarComoGanar();
montar($('#seccion-expresion'), cargando());
try {
  datos = await api.get('/api/tienda');
  guardado = { ...datos.avatar };
  borrador = { ...datos.avatar };
  nivelUsuario = datos.nivel ?? nivelUsuario;
  pintarTodo();
  pintarEvolucion();
  pintarNavegacion();
} catch (error) {
  montar($('#seccion-expresion'), errorCarga(error, () => window.location.reload()));
}
