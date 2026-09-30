/**
 * Registro de estudiantes.
 */
import { api } from '../core/api.js';
import { $ } from '../core/dom.js';
import { activarVerPassword, enviar, fortaleza, limpiarErrores, mostrarError } from './auth-comun.js';

const formulario = $('#formulario');
activarVerPassword();

formulario.password.addEventListener('input', () => {
  $('#fuerza').dataset.nivel = String(fortaleza(formulario.password.value));
});

function validarLocal(datos) {
  const detalles = [];
  if (datos.nombre.length < 2) detalles.push({ campo: 'nombre', mensaje: 'Escribe tu nombre (mínimo 2 caracteres).' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) detalles.push({ campo: 'email', mensaje: 'Escribe un correo válido.' });
  if (datos.password.length < 8 || !/\d/.test(datos.password) || !/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(datos.password)) {
    detalles.push({ campo: 'password', mensaje: 'Usa al menos 8 caracteres con letras y números.' });
  }
  return detalles;
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores(formulario);
  const datos = {
    nombre: formulario.nombre.value.trim(),
    email: formulario.email.value.trim(),
    password: formulario.password.value,
    grado: formulario.grado.value,
    fecha_icfes: formulario.fecha_icfes.value || null,
  };
  const detalles = validarLocal(datos);
  if (!formulario.acepto.checked) detalles.push({ campo: 'acepto', mensaje: 'Debes aceptar el uso de tus datos de estudio.' });
  if (detalles.length) {
    mostrarError(formulario, { message: detalles[0].mensaje, detalles });
    return;
  }
  try {
    await enviar($('#boton-enviar'), () => api.post('/api/auth/registro', datos, { redirigir401: false }));
    window.location.href = '/inicio?bienvenida=1';
  } catch (error) {
    mostrarError(formulario, error);
  }
});
