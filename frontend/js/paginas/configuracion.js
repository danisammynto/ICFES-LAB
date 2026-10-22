/**
 * Configuración de la cuenta.
 */
import { api } from '../core/api.js';
import { $, $$, formatoFecha, h, montar } from '../core/dom.js';
import { aplicarTema } from '../core/tema.js';
import { cerrarSesion, iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { conCarga, modal, toast, toastError } from '../core/ui.js';
import { textoCuentaRegresiva, textoMeses } from '../core/calendario.js';

const formPreparacion = $('#preparacion');
let estadoIcfes = null;

function pintarTema(tema) {
  $$('#selector-tema button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === tema)));
}

async function cargar() {
  const [perfil, publica] = await Promise.all([
    api.get('/api/perfil'),
    api.get('/api/config/publica', { redirigir401: false }).catch(() => null),
  ]);
  // Aunque el ICFES no haya publicado las fechas, se indica en qué meses suele presentarse cada calendario.
  for (const letra of ['A', 'B']) {
    const meses = publica?.calendarios_icfes?.[letra]?.meses ?? (letra === 'A' ? 'entre finales de julio y agosto' : 'en marzo');
    $(`#meses-calendario-${letra}`).textContent = textoMeses(meses);
  }
  const c = perfil.configuracion;
  pintarCalendario(perfil.icfes, c.calendario_icfes);
  $('#meta-diaria').value = String(c.meta_diaria_min);
  if (![...$('#meta-diaria').options].some((o) => o.value === String(c.meta_diaria_min))) {
    $('#meta-diaria').append(h('option', { value: c.meta_diaria_min, selected: true }, `${c.meta_diaria_min} minutos`));
  }
  $('#meta-puntaje').value = c.meta_puntaje ?? '';
  $('#recordatorios').checked = c.recordatorios;
  $('#email-actual').textContent = perfil.usuario.email;
  pintarTema(c.tema_interfaz);
}

/**
 * Calendario del Saber 11 y, si el ICFES no publicó una fecha única, el dato que falta:
 * la fecha de la citación (sin publicar) o cuál de las fechas oficiales corresponde (varias).
 */
function pintarCalendario(icfes, calendario) {
  estadoIcfes = icfes;
  if (calendario) formPreparacion.calendario_icfes.value = calendario;
  $('#estado-fecha-icfes').textContent = textoCuentaRegresiva(icfes);
  const campo = $('#campo-fecha-citacion');
  const entrada = $('#fecha-citacion-config');
  const lista = $('#fecha-oficial-config');
  const varias = icfes.estado === 'varias' || icfes.estado === 'elegida';
  const sinPublicar = icfes.estado === 'sin_publicar' || icfes.estado === 'citacion';
  campo.hidden = !(varias || sinPublicar);
  entrada.hidden = !sinPublicar;
  lista.hidden = !varias;
  $('#etiqueta-fecha-citacion').textContent = varias
    ? 'Tu fecha según la citación (el ICFES publicó varias)'
    : 'Fecha de la prueba según tu citación (opcional)';
  entrada.value = icfes.estado === 'citacion' ? icfes.fecha : '';
  montar(lista, h('option', { value: '' }, 'Elige tu fecha'), (icfes.opciones ?? []).map((o) => h('option', {
    value: o.fecha,
    selected: o.fecha === icfes.fecha,
  }, `${formatoFecha(o.fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${o.descripcion}`)));
}

// Al elegir otro calendario, la fecha anterior deja de aplicar: se ocultan los campos hasta guardar.
$$('input[name="calendario_icfes"]').forEach((radio) => radio.addEventListener('change', () => {
  const mismo = radio.value === estadoIcfes?.calendario;
  $('#campo-fecha-citacion').hidden = !mismo || !['varias', 'elegida', 'sin_publicar', 'citacion'].includes(estadoIcfes?.estado);
  $('#estado-fecha-icfes').textContent = mismo ? textoCuentaRegresiva(estadoIcfes) : `Guarda para ver la fecha oficial del Calendario ${radio.value}.`;
}));

formPreparacion.addEventListener('submit', async (e) => {
  e.preventDefault();
  const calendario = formPreparacion.calendario_icfes.value;
  if (!calendario) {
    toastError('Elige el calendario en el que presentarás el ICFES.');
    return;
  }
  const metaPuntaje = $('#meta-puntaje').value;
  const cuerpoCalendario = { calendario_icfes: calendario };
  if (!$('#campo-fecha-citacion').hidden) {
    const lista = $('#fecha-oficial-config');
    cuerpoCalendario.fecha_icfes = (lista.hidden ? $('#fecha-citacion-config').value : lista.value) || null;
  }
  try {
    await conCarga(formPreparacion.querySelector('[type="submit"]'), async () => {
      const r = await api.put('/api/perfil/calendario', cuerpoCalendario);
      procesarRecompensas(r);
      pintarCalendario(r.cuenta_regresiva, r.calendario_icfes);
      await api.put('/api/perfil/configuracion', {
        meta_diaria_min: Number($('#meta-diaria').value),
        meta_puntaje: metaPuntaje === '' ? null : Number(metaPuntaje),
        recordatorios: $('#recordatorios').checked,
      });
    });
    toast('Preparación actualizada.');
  } catch (error) {
    toastError(error.message);
  }
});

$$('#selector-tema button').forEach((boton) => boton.addEventListener('click', async () => {
  const tema = boton.dataset.tema;
  aplicarTema(tema);
  pintarTema(tema);
  try {
    await api.put('/api/perfil/configuracion', { tema_interfaz: tema });
  } catch (error) {
    toastError(error.message);
  }
}));

$('#cuenta').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  try {
    const r = await conCarga(form.querySelector('[type="submit"]'), () => api.put('/api/perfil/email', { email: form.email.value.trim(), password: form.password.value }));
    $('#email-actual').textContent = r.email;
    form.reset();
    toast('Correo actualizado.');
  } catch (error) {
    toastError(error.message);
  }
});

$('#seguridad').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  if (form.nueva.value !== form.confirmacion.value) {
    toastError('Las contraseñas nuevas no coinciden.');
    return;
  }
  try {
    const r = await conCarga(form.querySelector('[type="submit"]'), () => api.put('/api/perfil/password', { actual: form.actual.value, nueva: form.nueva.value }));
    form.reset();
    toast(r.mensaje);
  } catch (error) {
    toastError(error.message);
  }
});

$('#cerrar-sesion').addEventListener('click', () => cerrarSesion());
$('#cerrar-sesiones').addEventListener('click', () => cerrarSesion({ todas: true }));

$('#eliminar-cuenta').addEventListener('click', () => {
  modal((cerrar) => {
    const form = h('form', { novalidate: true },
      h('h2', {}, '¿Eliminar tu cuenta?'),
      h('p', { class: 'texto-2' }, 'Perderás todo tu progreso de forma permanente. Escribe tu contraseña para confirmar.'),
      h('div', { class: 'campo' }, h('label', { for: 'password-eliminar' }, 'Contraseña'),
        h('input', { class: 'entrada', type: 'password', id: 'password-eliminar', name: 'password', autocomplete: 'current-password', required: true, autofocus: true })),
      h('div', { class: 'modal-acciones' },
        h('button', { type: 'button', class: 'btn btn-secundario', onclick: () => cerrar() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'btn btn-peligro' }, 'Eliminar definitivamente')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await conCarga(form.querySelector('[type="submit"]'), () => api.del('/api/perfil', { password: form.password.value }));
        window.location.href = '/';
      } catch (error) {
        toastError(error.message);
      }
    });
    return form;
  }, { etiqueta: 'Eliminar cuenta' });
});

await iniciarPagina({ activa: null });
cargar().catch((error) => toastError(error.message));

// Si el calendario se elige en la pregunta del primer inicio de sesión, esta sección se actualiza sola.
window.addEventListener('icfes:calendario', (e) => {
  if (e.detail?.cuenta_regresiva) pintarCalendario(e.detail.cuenta_regresiva, e.detail.calendario_icfes);
});
