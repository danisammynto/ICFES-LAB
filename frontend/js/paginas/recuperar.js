/**
 * Solicitud de recuperación de contraseña.
 */
import { api } from '../core/api.js';
import { $, h } from '../core/dom.js';
import { enviar, limpiarErrores, mostrarError, mostrarExito } from './auth-comun.js';

const formulario = $('#formulario');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores(formulario);
  const email = formulario.email.value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    mostrarError(formulario, { message: 'Escribe un correo válido.', detalles: [{ campo: 'email', mensaje: 'Escribe un correo válido.' }] });
    return;
  }
  try {
    const respuesta = await enviar($('#boton-enviar'), () => api.post('/api/auth/recuperar', { email }, { redirigir401: false }));
    mostrarExito(formulario,
      h('p', { class: 'mb-0' }, respuesta.mensaje),
      // Solo en desarrollo (sin servidor de correo) el servidor devuelve el enlace directamente.
      respuesta.enlace_desarrollo
        ? h('p', { class: 'mb-0 mt-4' }, h('strong', {}, 'Modo desarrollo: '), h('a', { href: new URL(respuesta.enlace_desarrollo).pathname + new URL(respuesta.enlace_desarrollo).search }, 'abrir el enlace de recuperación'))
        : null);
    formulario.email.value = '';
  } catch (error) {
    mostrarError(formulario, error);
  }
});
