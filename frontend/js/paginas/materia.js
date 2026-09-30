/**
 * Detalle de una materia: temas → subtemas (con bloqueos por nivel) → lecciones.
 */
import { api } from '../core/api.js';
import { $, h, icono, montar, parametro } from '../core/dom.js';
import { iniciarPagina } from '../core/layout.js';
import { cargando, errorCarga } from '../core/ui.js';

const slug = parametro('slug');

function tarjetaSubtema(s, color) {
  const p = s.progreso;
  const primeraPendiente = s.lecciones.find((l) => !l.completada) ?? s.lecciones[0];
  return h('article', { class: `subtema tarjeta ${s.bloqueado ? 'bloqueado' : ''} ${p.completado ? 'completado' : ''}`, id: s.slug },
    s.bloqueado ? h('div', { class: 'candado' }, icono('lock', 'icono-sm'), `Se desbloquea en el nivel ${s.nivel_requerido}`) : null,
    h('div', { class: 'subtema-cabecera' },
      h('span', { class: 'medalla', style: { '--color': color } }, icono(s.icono)),
      h('div', { class: 'crecer' }, h('h3', {}, s.nombre), h('p', {}, s.descripcion))),
    h('div', {},
      h('div', { class: 'fila-entre texto-sm', style: { marginBottom: '6px' } },
        h('span', { class: 'texto-2' }, 'Avance'), h('strong', {}, `${p.avance}%`)),
      h('div', { class: 'barra', style: { '--valor': `${p.avance}%`, '--color': color } })),
    h('div', { class: 'chips' },
      h('span', { class: 'chip' }, icono('target', 'icono-sm'), `Dominio ${p.dominio}%`),
      h('span', { class: 'chip' }, icono('list-checks', 'icono-sm'), `${p.respondidas} respondidas`),
      p.completado ? h('span', { class: 'chip chip-exito' }, icono('badge-check', 'icono-sm'), 'Completado') : null),
    s.lecciones.length
      ? h('ul', { class: 'lecciones' }, s.lecciones.map((l) => h('li', { class: l.completada ? 'hecha' : '' },
        h('a', { href: `/leccion?id=${l.id}` },
          icono(l.completada ? 'circle-check' : 'book-open', 'icono-sm'),
          h('span', { class: 'crecer' }, l.titulo),
          h('span', { class: 'texto-3 texto-xs' }, `${l.duracion_min} min`)))))
      : null,
    h('div', { class: 'acciones' },
      primeraPendiente
        ? h('a', { class: 'btn btn-secundario btn-sm', href: `/leccion?id=${primeraPendiente.id}` }, icono('book-open', 'icono-sm'), primeraPendiente.completada ? 'Repasar' : 'Lección')
        : null,
      h('a', { class: 'btn btn-primario btn-sm', href: `/practica?subtema=${s.slug}`, 'aria-disabled': s.preguntas ? null : 'true' },
        icono('target', 'icono-sm'), `Practicar (${s.preguntas})`)));
}

async function cargarMateria() {
  const contenedor = $('#detalle-materia');
  montar(contenedor, cargando());
  try {
    const m = await api.get(`/api/materias/${encodeURIComponent(slug)}`);
    document.title = `${m.nombre} · ICFES Lab`;
    montar(contenedor,
      h('section', { class: 'encabezado-materia', style: { '--color': m.color } },
        h('div', { class: 'anillo', style: { '--porcentaje': m.progreso } },
          h('div', { class: 'centrado' }, h('span', { class: 'anillo-valor' }, `${m.progreso}%`), h('span', { class: 'anillo-etiqueta' }, 'avance'))),
        h('div', { class: 'crecer' },
          h('h1', {}, m.nombre),
          h('p', {}, m.descripcion),
          h('p', { class: 'texto-sm mt-4' }, `Peso en el puntaje global: ${m.peso_global === 3 ? '3 (área núcleo)' : m.peso_global}`))),
      m.temas.map((t) => h('section', { class: 'tema' },
        h('div', { class: 'tema-titulo' }, h('h2', {}, t.nombre), h('span', {}, t.descripcion)),
        h('div', { class: 'subtemas' }, t.subtemas.map((s) => tarjetaSubtema(s, m.color))))));
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView({ block: 'center' });
  } catch (error) {
    montar(contenedor, errorCarga(error, cargarMateria));
  }
}

await iniciarPagina({ activa: 'materias' });
if (!slug) window.location.replace('/materias');
else cargarMateria();
