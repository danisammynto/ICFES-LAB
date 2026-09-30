/**
 * Inicio de sesión.
 */
import { api } from '../core/api.js';
import { $, h, icono } from '../core/dom.js';
import { activarVerPassword, destinoSeguro, enviar, limpiarErrores, mostrarError } from './auth-comun.js';

const formulario = $('#formulario');
activarVerPassword();

const parametros = new URLSearchParams(window.location.search);
const SALIDAS = {
  cerrada: 'Cerraste sesión. ¡Vuelve pronto!',
  cerradas: 'Cerraste sesión en todos tus dispositivos.',
};
if (SALIDAS[parametros.get('sesion')]) {
  const alerta = $('.alerta-formulario');
  alerta.className = 'alerta alerta-exito alerta-formulario';
  alerta.replaceChildren(icono('circle-check'), h('span', {}, SALIDAS[parametros.get('sesion')]));
  // Limpia la URL para que el aviso no reaparezca al recargar.
  window.history.replaceState(null, '', '/login');
} else if (parametros.get('next')) {
  const alerta = $('.alerta-formulario');
  alerta.className = 'alerta alerta-formulario';
  alerta.textContent = 'Inicia sesión para continuar.';
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores(formulario);
  const email = formulario.email.value.trim();
  const password = formulario.password.value;
  if (!email || !password) {
    mostrarError(formulario, {
      message: 'Escribe tu correo y tu contraseña.',
      detalles: [!email && { campo: 'email', mensaje: 'Escribe tu correo.' }, !password && { campo: 'password', mensaje: 'Escribe tu contraseña.' }].filter(Boolean),
    });
    return;
  }
  try {
    await enviar($('#boton-enviar'), () => api.post('/api/auth/login', { email, password }, { redirigir401: false }));
    window.location.href = destinoSeguro();
  } catch (error) {
    mostrarError(formulario, error);
  }
});
