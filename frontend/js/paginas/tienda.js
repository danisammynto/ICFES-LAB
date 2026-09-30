/**
 * Tienda y editor de avatar.
 * Elegir un artículo lo muestra en la vista previa; los propios se pueden equipar y los
 * demás se compran con monedas.
 */
import { api } from '../core/api.js';
import { $, formatoNumero, h, icono, montar } from '../core/dom.js';
import { crearAvatar } from '../core/avatar.js';
import { actualizarAvatarCabecera, actualizarJugador, iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { activarPestanas, cargando, confirmar, conCarga, errorCarga, toast, toastError } from '../core/ui.js';

const CATEGORIAS = ['color', 'expresion', 'accesorio', 'fondo'];
const NOMBRE_RAREZA = { comun: 'Común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria' };
let datos = null;
let guardado = null;
let borrador = null;

const esPropio = (codigo) => CATEGORIAS.some((c) => datos.items[c]?.find((i) => i.codigo === codigo)?.adquirido);
const hayCambios = () => CATEGORIAS.some((c) => borrador[c] !== guardado[c]);

function pintarVista() {
  montar($('#vista-previa'), crearAvatar(borrador, { tamano: 200, titulo: 'Tu avatar' }));
  const noPropios = CATEGORIAS.filter((c) => !esPropio(borrador[c]));
  const boton = $('#guardar-avatar');
  boton.disabled = !hayCambios() || noPropios.length > 0;
  $('#restablecer-avatar').hidden = !hayCambios();
  $('#texto-vista').textContent = noPropios.length
    ? 'Vista previa: compra los artículos marcados para poder guardar este avatar.'
    : hayCambios() ? '¡Te ves genial! Guarda los cambios para usar este avatar.' : 'Este es tu avatar actual.';
  montar($('#saldo'), icono('coins'), formatoNumero(datos.monedas));
}

async function comprar(tipo, codigo, nombre, precio) {
  if (datos.monedas < precio) {
    toastError(`Te faltan ${formatoNumero(precio - datos.monedas)} monedas. ¡Sigue estudiando para ganarlas!`);
    return false;
  }
  const ok = await confirmar({ titulo: `¿Comprar ${nombre}?`, mensaje: `Cuesta ${formatoNumero(precio)} monedas. Te quedarán ${formatoNumero(datos.monedas - precio)}.`, aceptar: 'Comprar' });
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

function tarjetaItem(item) {
  const estado = item.equipado ? 'Equipado' : item.adquirido ? 'Tuyo' : null;
  const muestra = { ...guardado, [item.categoria]: item.codigo };
  const tarjeta = h('div', {
    class: `item ${borrador[item.categoria] === item.codigo ? 'seleccionado' : ''} ${item.bloqueado ? 'bloqueado' : ''}`,
    role: 'button',
    tabindex: '0',
    'aria-pressed': String(borrador[item.categoria] === item.codigo),
    'aria-label': `${item.nombre}${estado ? `, ${estado.toLowerCase()}` : item.bloqueado ? `, disponible en el nivel ${item.nivel_requerido}` : `, ${item.precio} monedas`}`,
  },
  estado ? h('span', { class: `chip etiqueta-estado ${item.equipado ? 'chip-xp' : 'chip-exito'}` }, estado) : null,
  h('div', { class: 'miniatura' }, crearAvatar(muestra, { tamano: 84, titulo: item.nombre })),
  h('strong', {}, item.nombre),
  h('span', { class: 'texto-xs texto-3' }, item.descripcion),
  item.bloqueado
    ? h('span', { class: 'chip' }, icono('lock', 'icono-sm'), `Nivel ${item.nivel_requerido}`)
    : item.adquirido ? null
      : h('button', {
        class: 'btn btn-lima btn-sm',
        onclick: async (e) => {
          e.stopPropagation();
          if (await comprar('item', item.codigo, item.nombre, item.precio)) {
            borrador[item.categoria] = item.codigo;
            pintarTodo();
          }
        },
      }, icono('coins', 'icono-sm'), formatoNumero(item.precio)));

  const elegir = () => {
    if (item.bloqueado) {
      toast(`Este artículo se desbloquea en el nivel ${item.nivel_requerido}.`, { icono: 'lock' });
      return;
    }
    borrador[item.categoria] = item.codigo;
    pintarTodo();
  };
  tarjeta.addEventListener('click', elegir);
  tarjeta.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(); } });
  return tarjeta;
}

function panelInsignias() {
  return h('div', { class: 'grid-insignias' }, datos.insignias.map((i) => h('article', { class: 'tarjeta insignia', title: i.descripcion },
    h('span', { class: `medalla medalla-lg ${i.adquirida ? '' : 'bloqueada'}`, style: { '--color': i.color } }, icono(i.icono)),
    h('strong', {}, i.nombre),
    h('span', { class: `rareza ${i.rareza}` }, NOMBRE_RAREZA[i.rareza]),
    h('span', {}, i.descripcion),
    i.adquirida
      ? h('span', { class: 'chip chip-exito' }, icono('check', 'icono-sm'), 'En tu colección')
      : i.bloqueada
        ? h('span', { class: 'chip' }, icono('lock', 'icono-sm'), `Nivel ${i.nivel_requerido}`)
        : h('button', { class: 'btn btn-lima btn-sm', onclick: () => comprar('insignia', i.codigo, i.nombre, i.precio) }, icono('coins', 'icono-sm'), formatoNumero(i.precio)))));
}

function panelProtectores() {
  const protector = datos.items.protector?.[0];
  const { cantidad, maximo } = datos.protectores;
  return h('article', { class: 'tarjeta tarjeta-protector' },
    h('span', { class: 'medalla medalla-lg' }, icono('shield-check')),
    h('div', { class: 'crecer' },
      h('h3', {}, 'Protector de racha'),
      h('p', { class: 'texto-2' }, 'Si un día no alcanzas a estudiar, un protector se usa automáticamente y tu racha sigue viva. Puedes tener hasta 3.'),
      h('div', { class: 'fila gap-2' }, Array.from({ length: maximo }, (_, i) => h('span', { class: `medalla ${i < cantidad ? '' : 'bloqueada'}`, style: { width: '38px', height: '38px', '--color': 'var(--durazno-600)' } }, icono('shield-check', 'icono-sm'))),
        h('span', { class: 'texto-sm texto-2' }, `${cantidad} de ${maximo}`))),
    protector
      ? h('button', { class: 'btn btn-lima', disabled: cantidad >= maximo, onclick: () => comprar('item', protector.codigo, protector.nombre, protector.precio) },
        icono('coins', 'icono-sm'), cantidad >= maximo ? 'Máximo alcanzado' : `Comprar por ${formatoNumero(protector.precio)}`)
      : null);
}

function pintarTodo() {
  for (const categoria of CATEGORIAS) {
    montar($(`#panel-${categoria}`), h('div', { class: 'grid-items' }, (datos.items[categoria] ?? []).map(tarjetaItem)));
  }
  montar($('#panel-insignias'), panelInsignias());
  montar($('#panel-protectores'), panelProtectores());
  pintarVista();
}

async function recargar() {
  datos = await api.get('/api/tienda');
  guardado = { ...datos.avatar };
  CATEGORIAS.forEach((c) => {
    if (!borrador[c]) borrador[c] = guardado[c];
  });
  actualizarJugador({ monedas: datos.monedas });
  pintarTodo();
}

$('#guardar-avatar').addEventListener('click', async (e) => {
  try {
    const { avatar } = await conCarga(e.currentTarget, () => api.put('/api/perfil/avatar', borrador));
    datos.avatar = avatar;
    await recargar();
    actualizarAvatarCabecera(avatar);
    toast('¡Avatar guardado!', { icono: 'circle-check' });
  } catch (error) {
    toastError(error.message);
  }
});

$('#restablecer-avatar').addEventListener('click', () => {
  borrador = { ...guardado };
  pintarTodo();
});

await iniciarPagina({ activa: 'tienda' });
activarPestanas($('.pestanas'));
montar($('#panel-color'), cargando());
try {
  datos = await api.get('/api/tienda');
  guardado = { ...datos.avatar };
  borrador = { ...datos.avatar };
  pintarTodo();
} catch (error) {
  montar($('#panel-color'), errorCarga(error, () => window.location.reload()));
}
