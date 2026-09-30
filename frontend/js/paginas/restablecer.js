/**
 * Restablecimiento de contraseña con el token recibido por correo.
 */
import { api } from '../core/api.js';
import { $, h } from '../core/dom.js';
import { activarVerPassword, enviar, fortaleza, limpiarErrores, mostrarError, mostrarExito } from './auth-comun.js';

const formulario = $('#formulario');
const token = new URLSearchParams(window.location.search).get('token') ?? '';
activarVerPassword();

// Se quita el token de la barra de direcciones (y del historial) una vez leído.
window.history.replaceState(null, '', '/restablecer');

if (!/^[a-f0-9]{64}$/.test(token)) {
  mostrarError(formulario, { message: 'El enlace no es válido. Solicita uno nuevo desde "Recuperar contraseña".' });
  $('#boton-enviar').disabled = true;
}

formulario.password.addEventListener('input', () => {
  $('#fuerza').dataset.nivel = String(fortaleza(formulario.password.value));
});

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores(formulario);
  const password = formulario.password.value;
  if (password.length < 8 || !/\d/.test(password) || !/[A-Za-z]/.test(password)) {
    mostrarError(formulario, { message: 'Usa al menos 8 caracteres con letras y números.', detalles: [{ campo: 'password', mensaje: 'Usa al menos 8 caracteres con letras y números.' }] });
    return;
  }
  if (password !== formulario.confirmacion.value) {
    mostrarError(formulario, { message: 'Las contraseñas no coinciden.', detalles: [{ campo: 'confirmacion', mensaje: 'Las contraseñas no coinciden.' }] });
    return;
  }
  try {
    const respuesta = await enviar($('#boton-enviar'), () => api.post('/api/auth/restablecer', { token, password }, { redirigir401: false }));
    mostrarExito(formulario, h('p', { class: 'mb-0' }, respuesta.mensaje), h('p', { class: 'mb-0 mt-4' }, h('a', { href: '/login', class: 'btn btn-primario btn-sm' }, 'Iniciar sesión')));
    $('#boton-enviar').disabled = true;
  } catch (error) {
    mostrarError(formulario, error);
  }
});
