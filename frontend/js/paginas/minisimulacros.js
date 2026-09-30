/**
 * Camino de 10 minisimulacros con "tapitas" (prototipo minisimulacros_inicio).
 * Cada tapita se desbloquea al completar la anterior.
 */
import { api } from '../core/api.js';
import { $, h, icono, montar, s } from '../core/dom.js';
import { iniciarPagina } from '../core/layout.js';
import { cargando, errorCarga, toast } from '../core/ui.js';
import { confirmarInicio, estrellas } from './simulacros-comun.js';

// Desplazamiento horizontal de cada tapita para dibujar un camino sinuoso.
const DESPLAZAMIENTOS = ['0px', '90px', '150px', '90px', '0px', '-90px', '-150px', '-90px', '0px', '90px'];

/** Tapa de botella en SVG: borde dentado + cara + brillo. */
function tapaSvg() {
  const puntas = 24;
  const puntos = [];
  for (let i = 0; i < puntas * 2; i += 1) {
    const radio = i % 2 === 0 ? 49 : 44;
    const angulo = (Math.PI * i) / puntas;
    puntos.push(`${(50 + radio * Math.cos(angulo)).toFixed(2)},${(50 + radio * Math.sin(angulo)).toFixed(2)}`);
  }
  return s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' },
    s('polygon', { class: 'borde-tapa', points: puntos.join(' ') }),
    s('circle', { class: 'cara-tapa', cx: 50, cy: 50, r: 38 }),
    s('path', { class: 'brillo-tapa', d: 'M22 42a30 30 0 0 1 28-26v8a22 22 0 0 0-20 18z' }));
}

function paso(mini, indice) {
  const estado = mini.intento_en_curso ? 'en-curso' : mini.completado ? 'completada' : mini.bloqueado ? 'bloqueada' : 'disponible';
  const tapita = h('button', {
    type: 'button',
    class: `tapita ${estado}`,
    id: `tapita${mini.numero}`,
    'aria-label': `${mini.titulo}: ${{ 'en-curso': 'en curso', completada: 'completado', bloqueada: 'bloqueado', disponible: 'disponible' }[estado]}`,
    'aria-disabled': estado === 'bloqueada' ? 'true' : null,
  }, tapaSvg(), h('span', { class: 'numero' }, estado === 'bloqueada' ? icono('lock') : mini.numero));

  tapita.addEventListener('click', () => {
    if (estado === 'bloqueada') {
      toast(`Completa el minisimulacro ${mini.numero - 1} para desbloquear este.`, { icono: 'lock' });
      return;
    }
    confirmarInicio(mini);
  });

  return h('div', { class: 'paso-camino', style: { '--x': DESPLAZAMIENTOS[indice % DESPLAZAMIENTOS.length] } },
    tapita,
    h('div', { class: 'info-paso' },
      h('strong', {}, mini.titulo),
      h('span', {}, `${mini.preguntas} preguntas · 30 min`),
      mini.completado ? h('div', {}, estrellas(mini.estrellas), h('span', {}, ` Mejor: ${Math.round(mini.mejor_porcentaje)}%`)) : null,
      estado === 'disponible' ? h('div', { class: 'chip chip-cielo', style: { marginTop: '6px' } }, icono('play', 'icono-sm'), '¡Siguiente paso!') : null));
}

/** Dibuja la línea punteada que une las tapitas (y la parte ya recorrida). */
function dibujarLinea() {
  const camino = $('#camino');
  camino.querySelector('.camino-linea')?.remove();
  const caja = camino.getBoundingClientRect();
  const centros = [...camino.querySelectorAll('.tapita')].map((t) => {
    const r = t.getBoundingClientRect();
    return { x: r.left - caja.left + r.width / 2, y: r.top - caja.top + r.height / 2, hecho: t.classList.contains('completada') };
  });
  if (centros.length < 2) return;
  const trazo = (puntos) => puntos.map((p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const previo = puntos[i - 1];
    const medio = (previo.y + p.y) / 2;
    return `C${previo.x} ${medio} ${p.x} ${medio} ${p.x} ${p.y}`;
  }).join(' ');
  const ultimoHecho = centros.map((c) => c.hecho).lastIndexOf(true);
  const svg = s('svg', { class: 'camino-linea', 'aria-hidden': 'true' },
    s('path', { d: trazo(centros) }),
    ultimoHecho > 0 ? s('path', { class: 'recorrido', d: trazo(centros.slice(0, ultimoHecho + 2 > centros.length ? centros.length : ultimoHecho + 2)) }) : null);
  camino.prepend(svg);
}

async function cargarCamino() {
  const camino = $('#camino');
  montar(camino, cargando());
  try {
    const { minis } = await api.get('/api/simulacros');
    montar(camino, minis.map(paso));
    const total = minis.reduce((suma, m) => suma + m.estrellas, 0);
    montar($('#total-estrellas'), icono('star', 'icono-sm'), `${total} de 30 estrellas`);
    requestAnimationFrame(dibujarLinea);
    window.addEventListener('resize', () => requestAnimationFrame(dibujarLinea));
    const siguiente = camino.querySelector('.tapita.disponible, .tapita.en-curso');
    siguiente?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } catch (error) {
    montar(camino, errorCarga(error, cargarCamino));
  }
}

await iniciarPagina({ activa: 'simulacros' });
cargarCamino();
