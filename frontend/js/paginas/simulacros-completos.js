/**
 * Cuadrícula de los 10 simulacros completos (prototipo simulacro_inicio).
 */
import { api } from '../core/api.js';
import { $, formatoDuracion, formatoFecha, h, icono, montar } from '../core/dom.js';
import { iniciarPagina } from '../core/layout.js';
import { cargando, errorCarga } from '../core/ui.js';
import { confirmarInicio } from './simulacros-comun.js';

function tarjeta(s) {
  const estado = s.intento_en_curso ? 'en-curso' : s.completado ? 'completado' : 'nuevo';
  const chipEstado = {
    'en-curso': h('span', { class: 'chip chip-racha' }, icono('hourglass', 'icono-sm'), 'En curso'),
    completado: h('span', { class: 'chip chip-exito' }, icono('trophy', 'icono-sm'), `Mejor: ${s.mejor_puntaje}/500`),
    nuevo: h('span', { class: 'chip chip-cielo' }, icono('sparkles', 'icono-sm'), 'Nuevo'),
  }[estado];

  const boton = h('button', { type: 'button', class: `card-simulacro ${estado}`, 'aria-label': `${s.titulo}: ${estado.replace('-', ' ')}` },
    h('span', { class: 'numero-simulacro', 'aria-hidden': 'true' }, String(s.numero).padStart(2, '0')),
    h('span', { class: 'titulo-simulacro' }, s.titulo),
    h('span', { class: 'meta' },
      h('span', {}, icono('list-checks', 'icono-sm'), s.preguntas < s.preguntas_objetivo ? `${s.preguntas} de ${s.preguntas_objetivo} preguntas` : `${s.preguntas} preguntas`),
      h('span', {}, icono('clock', 'icono-sm'), `${s.sesiones.length} sesiones · ${formatoDuracion(s.duracion_min * 60)}`),
      s.ultima_fecha ? h('span', {}, icono('history', 'icono-sm'), `Último: ${formatoFecha(s.ultima_fecha, { day: 'numeric', month: 'short' })}`) : null),
    h('span', { class: 'estado' }, chipEstado));
  boton.addEventListener('click', () => confirmarInicio(s));
  return boton;
}

async function cargarCompletos() {
  const grid = $('#grid-simulacros');
  montar(grid, cargando());
  try {
    const { completos } = await api.get('/api/simulacros');
    montar(grid, completos.map(tarjeta));
  } catch (error) {
    montar(grid, errorCarga(error, cargarCompletos));
  }
}

await iniciarPagina({ activa: 'simulacros' });
cargarCompletos();
