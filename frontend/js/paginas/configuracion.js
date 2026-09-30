/**
 * Configuración de la cuenta.
 */
import { api } from '../core/api.js';
import { $, $$, formatoFecha, h } from '../core/dom.js';
import { aplicarTema } from '../core/tema.js';
import { cerrarSesion, iniciarPagina } from '../core/layout.js';
import { conCarga, modal, toast, toastError } from '../core/ui.js';

const formPreparacion = $('#preparacion');

function pintarTema(tema) {
  $$('#selector-tema button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === tema)));
}

async function cargar() {
  const perfil = await api.get('/api/perfil');
  const c = perfil.configuracion;
  const global = perfil.icfes.fecha_global;
  $('#texto-fecha-global').textContent = global
    ? `${formatoFecha(global, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'Aún no definida por el administrador.';
  formPreparacion.tipo_fecha.value = c.fecha_icfes ? 'personal' : 'global';
  $('#fecha-personal').value = c.fecha_icfes ?? '';
  $('#meta-diaria').value = String(c.meta_diaria_min);
  if (![...$('#meta-diaria').options].some((o) => o.value === String(c.meta_diaria_min))) {
    $('#meta-diaria').append(h('option', { value: c.meta_diaria_min, selected: true }, `${c.meta_diaria_min} minutos`));
  }
  $('#meta-puntaje').value = c.meta_puntaje ?? '';
  $('#recordatorios').checked = c.recordatorios;
  $('#email-actual').textContent = perfil.usuario.email;
  pintarTema(c.tema_interfaz);
}

formPreparacion.addEventListener('submit', async (e) => {
  e.preventDefault();
  const personal = formPreparacion.tipo_fecha.value === 'personal';
  const fecha = $('#fecha-personal').value;
  if (personal && !fecha) {
    toastError('Elige tu fecha del examen o usa la fecha oficial.');
    return;
  }
  const metaPuntaje = $('#meta-puntaje').value;
  try {
    await conCarga(formPreparacion.querySelector('[type="submit"]'), () => api.put('/api/perfil/configuracion', {
      fecha_icfes: personal ? fecha : null,
      meta_diaria_min: Number($('#meta-diaria').value),
      meta_puntaje: metaPuntaje === '' ? null : Number(metaPuntaje),
      recordatorios: $('#recordatorios').checked,
    }));
    toast('Preparación actualizada.');
  } catch (error) {
    toastError(error.message);
  }
});

$('#fecha-personal').addEventListener('focus', () => { formPreparacion.tipo_fecha.value = 'personal'; });

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
