/**
 * Utilidades compartidas por las páginas de simulacros.
 */
import { api } from '../core/api.js';
import { formatoDuracion, h, icono } from '../core/dom.js';
import { modal, toastError } from '../core/ui.js';

export const irAlIntento = (intentoId) => { window.location.href = `/simulacro?intento=${intentoId}`; };

export function estrellas(cantidad, total = 3) {
  return h('span', { class: 'estrellas', 'aria-label': `${cantidad} de ${total} estrellas` },
    Array.from({ length: total }, (_, i) => {
      const e = icono('star', i < cantidad ? 'llena' : '');
      return e;
    }));
}

/** Modal de instrucciones antes de comenzar un simulacro, minisimulacro o reto. */
export async function confirmarInicio(simulacro) {
  if (simulacro.intento_en_curso) {
    irAlIntento(simulacro.intento_en_curso);
    return;
  }
  const reglas = [
    `${simulacro.preguntas} preguntas en ${simulacro.sesiones.length > 1 ? `${simulacro.sesiones.length} sesiones` : '1 sesión'} (${formatoDuracion(simulacro.duracion_min * 60)} en total).`,
    'El cronómetro corre en el servidor: si cierras la página, el tiempo sigue avanzando.',
    'Tus respuestas se guardan automáticamente. Puedes marcar preguntas para revisarlas al final.',
    'No verás si aciertas hasta terminar: así funciona el examen real.',
    simulacro.tipo === 'reto' ? `Supera el ${simulacro.porcentaje_aprobacion} % de aciertos para ganar la recompensa.` : 'Una pregunta sin responder vale lo mismo que una incorrecta: ¡no dejes ninguna en blanco!',
  ];

  const iniciar = await modal((cerrar) => [
    h('div', { class: 'fila', style: { marginBottom: 'var(--esp-4)' } },
      h('span', { class: 'medalla' }, icono(simulacro.icono || 'clipboard-list')),
      h('div', {}, h('h2', { class: 'mb-0' }, simulacro.titulo), h('span', { class: 'texto-3 texto-sm' }, simulacro.descripcion))),
    simulacro.sesiones.length > 1
      ? h('div', { class: 'fila envolver gap-2', style: { marginBottom: 'var(--esp-4)' } },
        simulacro.sesiones.map((s) => h('span', { class: 'chip chip-cielo' }, icono('clock', 'icono-sm'), `${s.titulo}: ${s.preguntas} preguntas · ${formatoDuracion(s.duracion_min * 60)}`)))
      : null,
    h('ul', { class: 'lista-desbloqueos' }, reglas.map((r) => h('li', {}, icono('circle-check', 'icono-sm'), r))),
    h('p', { class: 'texto-sm texto-2 mt-4' }, icono('gift', 'icono-sm'), ` Recompensa: +${simulacro.recompensa.xp} XP y +${simulacro.recompensa.monedas} monedas${simulacro.intentos ? ' (reducida por repetición)' : ''}.`),
    h('div', { class: 'modal-acciones' },
      h('button', { class: 'btn btn-secundario', onclick: () => cerrar(false) }, 'Ahora no'),
      h('button', { class: 'btn btn-primario', autofocus: true, onclick: () => cerrar(true) }, icono('play'), 'Comenzar')),
  ], { etiqueta: `Comenzar ${simulacro.titulo}` });

  if (!iniciar) return;
  try {
    const r = await api.post(`/api/simulacros/${simulacro.id}/iniciar`);
    irAlIntento(r.intento_id);
  } catch (error) {
    toastError(error.message);
  }
}

export function tarjetaReto(reto) {
  const boton = h('button', { class: `btn ${reto.bloqueado ? 'btn-secundario' : 'btn-primario'} btn-sm`, disabled: reto.bloqueado },
    icono(reto.bloqueado ? 'lock' : reto.intento_en_curso ? 'play' : 'swords', 'icono-sm'),
    reto.bloqueado ? `Nivel ${reto.nivel_requerido}` : reto.intento_en_curso ? 'Continuar' : reto.superado ? 'Repetir' : 'Aceptar reto');
  boton.addEventListener('click', () => confirmarInicio(reto));
  return h('article', { class: `reto tarjeta ${reto.bloqueado ? 'bloqueado' : ''}` },
    h('div', { class: 'fila-entre' },
      h('span', { class: 'medalla', style: { '--color': reto.superado ? 'var(--lima-600)' : 'var(--durazno-600)' } }, icono(reto.icono)),
      reto.superado ? h('span', { class: 'chip chip-exito' }, icono('badge-check', 'icono-sm'), 'Superado') : estrellas(reto.estrellas)),
    h('h3', {}, reto.titulo),
    h('p', {}, reto.descripcion),
    h('div', { class: 'fila envolver gap-2' },
      h('span', { class: 'chip' }, icono('target', 'icono-sm'), `Mínimo ${reto.porcentaje_aprobacion}%`),
      h('span', { class: 'chip chip-xp' }, icono('zap', 'icono-sm'), `+${reto.recompensa.xp} XP`)),
    boton);
}
