/**
 * Utilidades compartidas por las páginas de cuenta.
 */
import { $, $$, h, icono } from '../core/dom.js';
import { montarPersonajes } from '../core/personaje.js';

// La mascota de la portada de estas pantallas se monta sola al cargar el módulo.
montarPersonajes();

/** Destino seguro después de iniciar sesión (solo rutas internas). */
export function destinoSeguro() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && /^\/(?!\/)/.test(next) && !next.startsWith('/login') ? next : '/inicio';
}

export function limpiarErrores(formulario) {
  $$('[aria-invalid]', formulario).forEach((el) => el.removeAttribute('aria-invalid'));
  $$('.campo-error', formulario).forEach((el) => { el.textContent = ''; });
  $('.alerta-formulario', formulario)?.replaceChildren();
  $('.alerta-formulario', formulario)?.classList.add('oculto');
}

export function mostrarError(formulario, error) {
  const detalles = error.detalles ?? [];
  for (const d of detalles) {
    const entrada = formulario.elements.namedItem(d.campo);
    if (entrada) {
      entrada.setAttribute('aria-invalid', 'true');
      const mensaje = $(`#error-${d.campo}`, formulario);
      if (mensaje) mensaje.textContent = d.mensaje;
    }
  }
  const alerta = $('.alerta-formulario', formulario);
  if (alerta) {
    alerta.classList.remove('oculto');
    alerta.replaceChildren(icono('circle-alert'), h('span', {}, error.message));
  }
  (formulario.querySelector('[aria-invalid="true"]') ?? alerta)?.focus?.();
}

export function mostrarExito(formulario, ...contenido) {
  const alerta = $('.alerta-formulario', formulario);
  alerta.className = 'alerta alerta-exito alerta-formulario';
  alerta.replaceChildren(icono('circle-check'), h('div', {}, ...contenido));
}

/** Botón para mostrar u ocultar la contraseña. */
export function activarVerPassword(raiz = document) {
  $$('[data-ver-password]', raiz).forEach((boton) => {
    boton.addEventListener('click', () => {
      const entrada = document.getElementById(boton.dataset.verPassword);
      const visible = entrada.type === 'text';
      entrada.type = visible ? 'password' : 'text';
      boton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      boton.replaceChildren(icono(visible ? 'eye' : 'eye-off'));
    });
  });
}

/** Nivel de fortaleza de la contraseña (0–4). */
export function fortaleza(password) {
  let nivel = 0;
  if (password.length >= 8) nivel += 1;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) nivel += 1;
  if (password.length >= 12) nivel += 1;
  if (/[^A-Za-z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) nivel += 1;
  return password ? Math.max(1, nivel) : 0;
}

export async function enviar(boton, accion) {
  const original = [...boton.childNodes];
  boton.disabled = true;
  boton.replaceChildren(h('span', { class: 'spinner' }), h('span', {}, 'Un momento…'));
  try {
    return await accion();
  } finally {
    boton.disabled = false;
    boton.replaceChildren(...original);
  }
}
