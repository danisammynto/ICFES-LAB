/**
 * Listado de materias (basado en el prototipo materias.html).
 */
import { api } from '../core/api.js';
import { $, h, icono, montar } from '../core/dom.js';
import { iniciarPagina } from '../core/layout.js';
import { cargando, errorCarga } from '../core/ui.js';

function tarjetaMateria(m) {
  const continuar = m.siguiente_leccion
    ? h('a', { class: 'btn btn-primario btn-estudiar', href: `/leccion?id=${m.siguiente_leccion.id}` }, icono('play', 'icono-sm'), 'Continuar Lección')
    : h('a', { class: 'btn btn-primario btn-estudiar', href: `/practica?materia=${m.slug}` }, icono('target', 'icono-sm'), 'Practicar');

  return h('article', { class: 'card-materia tarjeta tarjeta-interactiva animar-entrada' },
    h('div', { class: 'card-materia-cabecera', style: { '--color': m.color } },
      h('div', { class: 'icono-materia' }, icono(m.icono)),
      h('h2', {}, m.nombre),
      h('p', {}, m.descripcion)),
    h('div', { class: 'card-materia-cuerpo' },
      h('div', { class: 'progreso-materia' },
        h('div', { class: 'fila-entre' }, h('span', {}, 'Progreso actual'), h('span', {}, `${m.progreso}%`)),
        h('div', { class: 'barra', style: { '--valor': `${m.progreso}%`, '--color': m.color } })),
      h('div', { class: 'datos-materia' },
        h('div', { class: 'dato' }, h('strong', {}, `${m.subtemas_completados}/${m.subtemas}`), h('span', {}, 'Subtemas')),
        h('div', { class: 'dato' }, h('strong', {}, `${m.lecciones_completadas}/${m.lecciones}`), h('span', {}, 'Lecciones')),
        h('div', { class: 'dato' }, h('strong', {}, m.precision != null ? `${m.precision}%` : '—'), h('span', {}, 'Precisión'))),
      m.siguiente_leccion
        ? h('p', { class: 'siguiente-leccion mb-0' }, icono('book-open', 'icono-sm'), ` Siguiente: ${m.siguiente_leccion.titulo}`)
        : h('p', { class: 'siguiente-leccion mb-0' }, icono('badge-check', 'icono-sm'), ' ¡Completaste las lecciones disponibles!'),
      m.subtemas_bloqueados > 0
        ? h('p', { class: 'texto-xs texto-3 mb-0' }, icono('lock', 'icono-sm'), ` ${m.subtemas_bloqueados} ${m.subtemas_bloqueados === 1 ? 'subtema se desbloquea' : 'subtemas se desbloquean'} al subir de nivel`)
        : null,
      h('div', { class: 'acciones-materia' },
        continuar,
        h('a', { class: 'btn btn-secundario', href: `/materia?slug=${m.slug}` }, 'Ver temas'))));
}

async function cargarMaterias() {
  const grid = $('#grid-materias');
  montar(grid, cargando('Cargando tus materias…'));
  try {
    const { materias } = await api.get('/api/materias');
    montar(grid, materias.map(tarjetaMateria));
  } catch (error) {
    montar(grid, errorCarga(error, cargarMaterias));
  }
}

await iniciarPagina({ activa: 'materias' });
cargarMaterias();
