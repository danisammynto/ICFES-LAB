/**
 * Análisis inteligente del rendimiento ("Avance").
 */
import { api } from '../core/api.js';
import { $, formatoFecha, formatoNumero, formatoPorcentaje, h, icono, montar } from '../core/dom.js';
import { iniciarPagina } from '../core/layout.js';
import { alfa, grafica, PALETA } from '../core/graficas.js';
import { cargando, errorCarga, vacio } from '../core/ui.js';

const lienzo = (id, alto = 260) => h('div', { class: 'grafica', style: { height: `${alto}px` } }, h('canvas', { id }));

function kpis(r) {
  const kpi = (nombreIcono, etiqueta, valor, extra) => h('article', { class: 'tarjeta kpi' },
    h('div', { class: 'fila-entre' }, h('span', { class: 'kpi-etiqueta' }, etiqueta), icono(nombreIcono)),
    h('span', { class: 'kpi-valor' }, valor), extra ? h('div', { class: 'kpi-extra' }, extra) : null);
  return h('div', { class: 'kpis-avance' },
    kpi('list-checks', 'Preguntas', formatoNumero(r.respondidas), 'respondidas en total'),
    kpi('target', 'Precisión', formatoPorcentaje(r.precision), r.precision_30 != null ? `${formatoPorcentaje(r.precision_30)} en los últimos 30 días` : null),
    kpi('timer', 'Tiempo promedio', r.tiempo_promedio_seg != null ? `${Math.round(r.tiempo_promedio_seg)} s` : '—', 'por respuesta (30 días)'),
    kpi('clock', 'Horas de estudio', formatoNumero(r.horas), `${r.dias_estudiados} días activos`),
    kpi('book-open', 'Lecciones', formatoNumero(r.lecciones), 'completadas'),
    kpi('clipboard-list', 'Simulacros', formatoNumero(r.simulacros), 'presentados'));
}

function puntajeEstimado(p, examen) {
  const global = p.global.puntaje;
  return h('article', { class: 'tarjeta seccion' },
    h('h2', { class: 'tarjeta-titulo' }, icono('gauge'), 'Puntaje estimado ICFES'),
    h('p', { class: 'tarjeta-sub' }, 'Estimación orientativa calculada con tus respuestas recientes, ponderadas por dificultad y antigüedad. No es el puntaje oficial.'),
    h('div', { class: 'puntaje-icfes' },
      h('div', {},
        h('div', { class: 'anillo', style: { '--porcentaje': global ? Math.round(global / 5) : 0, '--color': 'var(--primario)' } },
          h('div', { class: 'centrado' }, h('span', { class: 'anillo-valor' }, global ?? '—'), h('span', { class: 'anillo-etiqueta' }, 'de 500 puntos'))),
        h('div', { class: 'puntaje-global-info' },
          h('span', { class: 'chip chip-cielo' }, `Confianza ${p.global.confianza}`),
          p.global.parcial ? h('p', { class: 'texto-xs texto-3 mt-4 mb-0' }, 'Parcial: aún faltan áreas por practicar.') : null)),
      h('div', { class: 'areas-puntaje' },
        h('h3', { class: 'mb-0', style: { fontSize: 'var(--texto-md)' } }, 'Puntaje por área (0–100)'),
        p.areas.map((a) => h('div', { class: 'area-puntaje' },
          h('div', { class: 'fila-entre' },
            h('span', {}, a.nombre, h('span', { class: 'confianza' }, a.respondidas ? ` · ${a.respondidas} respuestas` : ' · sin datos')),
            h('strong', {}, a.puntaje ?? '—')),
          h('div', { class: 'barra', style: { '--valor': `${a.puntaje ?? 0}%`, '--color': a.color } })))),
      h('div', { class: 'proyeccion' },
        h('p', { class: 'texto-sm negrita mb-0' }, 'Proyección al día del examen'),
        h('div', { class: 'valor-proyeccion' }, p.proyeccion.puntaje ?? '—'),
        h('p', { class: 'texto-sm texto-2 mt-4' }, p.proyeccion.mensaje),
        h('div', { class: 'fila envolver gap-2' },
          h('span', { class: 'chip' }, icono('trending-up', 'icono-sm'), `${p.proyeccion.tendencia_semanal >= 0 ? '+' : ''}${p.proyeccion.tendencia_semanal} pp/semana`),
          examen?.fecha ? h('span', { class: 'chip' }, icono('calendar', 'icono-sm'), `${p.proyeccion.semanas_restantes} semanas`) : null),
        p.meta
          ? h('div', { class: 'meta-linea' }, icono('flag', 'icono-sm'), `Tu meta: ${p.meta} puntos`,
            p.proyeccion.puntaje != null ? h('strong', {}, p.proyeccion.puntaje >= p.meta ? ' · ¡vas en camino!' : ` · te faltan ${p.meta - p.proyeccion.puntaje}`) : null)
          : h('a', { class: 'texto-sm', href: '/configuracion#preparacion' }, 'Define tu meta de puntaje'))));
}

function listaTemas(titulo, nombreIcono, temas, vacioTexto, color) {
  return h('article', { class: 'tarjeta' },
    h('h3', { class: 'tarjeta-titulo' }, icono(nombreIcono), titulo),
    temas.length
      ? h('div', { class: 'lista-temas' }, temas.map((t) => h('div', { class: 'tema-item' },
        h('div', {}, h('div', { class: 'nombre' }, t.nombre), h('div', { class: 'detalle' }, `${t.materia} · ${t.respondidas} respuestas`)),
        h('div', { class: 'fila gap-2' }, h('strong', {}, formatoPorcentaje(t.precision)),
          h('a', { class: 'btn btn-fantasma btn-sm', href: `/practica?subtema=${t.slug}`, 'aria-label': `Practicar ${t.nombre}` }, icono('target', 'icono-sm'))),
        h('div', { class: 'barra barra-sm', style: { '--valor': `${t.precision}%`, '--color': color } }))))
      : h('p', { class: 'texto-2 texto-sm mb-0' }, vacioTexto));
}

function tablaMaterias(materias) {
  const tendencia = (t) => {
    if (t == null) return h('span', { class: 'tendencia igual' }, '—');
    if (t > 0) return h('span', { class: 'tendencia sube' }, icono('trending-up', 'icono-sm'), `+${t}`);
    if (t < 0) return h('span', { class: 'tendencia baja' }, icono('trending-down', 'icono-sm'), t);
    return h('span', { class: 'tendencia igual' }, '0');
  };
  return h('div', { class: 'tabla-contenedor mt-4' }, h('table', { class: 'tabla' },
    h('thead', {}, h('tr', {}, ['Área', 'Respuestas', 'Precisión', 'Tendencia (14 días)', 'Tiempo promedio', 'Puntaje est.'].map((t) => h('th', {}, t)))),
    h('tbody', {}, materias.map((m) => h('tr', {},
      h('td', {}, h('span', { class: 'fila gap-2' }, h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: m.color, display: 'inline-block' } }), m.nombre)),
      h('td', {}, formatoNumero(m.respondidas)),
      h('td', {}, formatoPorcentaje(m.precision)),
      h('td', {}, tendencia(m.tendencia)),
      h('td', {}, m.tiempo_promedio_seg != null ? `${Math.round(m.tiempo_promedio_seg)} s (ideal ${m.tiempo_esperado_seg} s)` : '—'),
      h('td', {}, m.puntaje ?? '—'))))));
}

function arbolTemas(temas) {
  const porMateria = new Map();
  temas.forEach((t) => {
    if (!porMateria.has(t.materia)) porMateria.set(t.materia, []);
    porMateria.get(t.materia).push(t);
  });
  return h('div', { class: 'arbol-temas' }, [...porMateria.entries()].map(([materia, lista]) =>
    h('div', { class: 'mb-4' },
      h('h3', { style: { fontSize: 'var(--texto-md)' } }, materia),
      lista.map((t) => h('details', {},
        h('summary', {},
          icono('chevron-right', 'icono-sm'),
          h('strong', { class: 'crecer' }, t.nombre),
          h('span', { class: 'texto-sm texto-2' }, t.precision != null ? formatoPorcentaje(t.precision) : 'sin datos'),
          h('div', { class: 'barra barra-sm', style: { '--valor': `${t.precision ?? 0}%`, '--color': t.color } })),
        h('div', { class: 'subtemas-arbol' }, t.subtemas.map((s) => h('div', { class: 'tema-item' },
          h('div', {}, h('div', { class: 'nombre' }, s.nombre),
            h('div', { class: 'detalle' }, `${s.respondidas} respuestas · dominio ${s.dominio}%${s.tiempo_promedio_seg ? ` · ${s.tiempo_promedio_seg} s por pregunta` : ''}`)),
          h('strong', {}, formatoPorcentaje(s.precision)),
          h('div', { class: 'barra barra-sm', style: { '--valor': `${s.precision ?? 0}%`, '--color': t.color } })))))))));
}

function erroresFrecuentes(errores) {
  return h('article', { class: 'tarjeta' },
    h('h3', { class: 'tarjeta-titulo' }, icono('circle-x'), 'Errores frecuentes'),
    errores.preguntas.length
      ? h('div', {}, errores.preguntas.map((e) => h('div', { class: 'error-frecuente' },
        h('span', { class: 'fallos', title: 'Veces fallada' }, `×${e.fallos}`),
        h('div', { class: 'crecer' },
          h('p', { class: 'negrita' }, `${e.materia} · ${e.subtema}`),
          h('p', { class: 'texto-2' }, e.enunciado.length >= 160 ? `${e.enunciado}…` : e.enunciado)),
        h('a', { class: 'btn btn-secundario btn-sm', href: `/vanty?pregunta=${e.id}` }, icono('bot', 'icono-sm'), 'Repasar'))))
      : h('p', { class: 'texto-2 texto-sm' }, 'No tienes preguntas falladas repetidamente. ¡Muy bien!'),
    errores.competencias.length
      ? h('div', { class: 'mt-4' }, h('p', { class: 'texto-sm negrita', style: { marginBottom: '6px' } }, 'Competencias con más errores'),
        h('div', { class: 'fila envolver gap-2' }, errores.competencias.map((c) => h('span', { class: 'chip chip-error' }, `${c.competencia} (${c.materia}) · ${c.fallos}`))))
      : null);
}

function graficas(d) {
  // Evolución de simulacros + proyección
  const serie = d.simulacros.map((s) => ({ x: formatoFecha(s.creado_en, { day: 'numeric', month: 'short' }), y: s.puntaje_global, tipo: s.tipo }));
  const proyeccion = d.puntaje_estimado.proyeccion.puntaje;
  const etiquetas = [...serie.map((s) => s.x), ...(proyeccion ? ['Examen'] : [])];
  grafica($('#g-simulacros'), {
    type: 'line',
    data: {
      labels: etiquetas,
      datasets: [
        { label: 'Puntaje en simulacros', data: serie.map((s) => s.y), borderColor: PALETA.indigo, backgroundColor: alfa(PALETA.indigo, 0.12), fill: true, tension: 0.3, pointRadius: 5, pointBackgroundColor: serie.map((s) => (s.tipo === 'completo' ? PALETA.indigo : PALETA.lima600)) },
        proyeccion ? { label: 'Proyección', data: [...serie.map((_, i) => (i === serie.length - 1 ? serie[i].y : null)), proyeccion], borderColor: PALETA.durazno, borderDash: [6, 5], pointRadius: 5, pointBackgroundColor: PALETA.durazno, spanGaps: true } : null,
        d.puntaje_estimado.meta ? { label: 'Meta', data: etiquetas.map(() => d.puntaje_estimado.meta), borderColor: alfa(PALETA.menta, 0.8), borderDash: [3, 3], pointRadius: 0 } : null,
      ].filter(Boolean),
    },
    options: { scales: { y: { min: 0, max: 500 } } },
  });

  // Tiempo de respuesta: real vs. esperado
  const conTiempo = d.materias.filter((m) => m.tiempo_promedio_seg != null);
  grafica($('#g-tiempos'), {
    type: 'bar',
    data: {
      labels: conTiempo.map((m) => m.nombre_corto),
      datasets: [
        { label: 'Tu tiempo (s)', data: conTiempo.map((m) => m.tiempo_promedio_seg), backgroundColor: conTiempo.map((m) => alfa(m.color, 0.85)), borderRadius: 6 },
        { label: 'Tiempo sugerido (s)', data: conTiempo.map((m) => m.tiempo_esperado_seg), backgroundColor: alfa('#8588ac', 0.35), borderRadius: 6 },
      ],
    },
    options: { scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v} s` } }, x: { grid: { display: false } } } },
  });

  // Precisión por materia
  grafica($('#g-materias'), {
    type: 'bar',
    data: {
      labels: d.materias.map((m) => m.nombre_corto),
      datasets: [{ label: 'Precisión (%)', data: d.materias.map((m) => m.precision ?? 0), backgroundColor: d.materias.map((m) => alfa(m.color, 0.85)), borderRadius: 8, maxBarThickness: 44 }],
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } }, x: { grid: { display: false } } } },
  });

  // Evolución semanal
  grafica($('#g-semanal'), {
    data: {
      labels: d.evolucion_semanal.map((s) => s.etiqueta),
      datasets: [
        { type: 'line', label: 'Precisión (%)', data: d.evolucion_semanal.map((s) => s.precision), borderColor: PALETA.indigo, tension: 0.35, spanGaps: true, yAxisID: 'y' },
        { type: 'bar', label: 'Minutos de estudio', data: d.evolucion_semanal.map((s) => s.minutos), backgroundColor: alfa(PALETA.cielo, 0.6), borderRadius: 6, yAxisID: 'y1' },
      ],
    },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: 100 }, y1: { position: 'right', beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } },
  });

  // Evolución mensual
  grafica($('#g-mensual'), {
    data: {
      labels: d.evolucion_mensual.map((m) => m.etiqueta),
      datasets: [
        { type: 'bar', label: 'Horas de estudio', data: d.evolucion_mensual.map((m) => m.horas), backgroundColor: alfa(PALETA.lima600, 0.7), borderRadius: 8, yAxisID: 'y1' },
        { type: 'line', label: 'Precisión (%)', data: d.evolucion_mensual.map((m) => m.precision), borderColor: PALETA.indigo, tension: 0.3, spanGaps: true, yAxisID: 'y' },
      ],
    },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: { min: 0, max: 100, position: 'right' }, y1: { beginAtZero: true, position: 'left', grid: { display: false } }, x: { grid: { display: false } } } },
  });
}

async function cargarAvance() {
  const contenedor = $('#avance');
  montar(contenedor, cargando('Analizando tu rendimiento…'));
  try {
    const d = await api.get('/api/analitica/completa');
    if (!d.resumen.respondidas) {
      montar(contenedor, h('div', { class: 'tarjeta' }, vacio('chart-line', 'Aún no hay datos para analizar',
        'Completa tu primera lección o responde algunas preguntas y aquí verás tu análisis completo.',
        h('a', { class: 'btn btn-primario', href: '/materias' }, 'Empezar a estudiar'))));
      return;
    }
    montar(contenedor,
      kpis(d.resumen),
      puntajeEstimado(d.puntaje_estimado, d.fecha_examen),
      h('div', { class: 'rejilla-2 seccion' },
        listaTemas('Fortalezas', 'trophy', d.fortalezas, 'Aún no hay temas con 70 % o más de precisión (mínimo 3 respuestas).', 'var(--exito)'),
        listaTemas('Debilidades', 'target', d.debilidades, 'No tienes temas por debajo del 60 %. ¡Excelente!', 'var(--coral)')),
      h('article', { class: 'tarjeta seccion' },
        h('h2', { class: 'tarjeta-titulo' }, icono('clipboard-list'), 'Tus simulacros y proyección'),
        lienzo('g-simulacros', 280)),
      h('div', { class: 'rejilla-2 seccion' },
        h('article', { class: 'tarjeta' }, h('h3', { class: 'tarjeta-titulo' }, icono('chart-column'), 'Rendimiento por materia'), lienzo('g-materias')),
        h('article', { class: 'tarjeta' }, h('h3', { class: 'tarjeta-titulo' }, icono('timer'), 'Tiempo de respuesta'), lienzo('g-tiempos'))),
      h('article', { class: 'tarjeta seccion' }, h('h2', { class: 'tarjeta-titulo' }, icono('list'), 'Detalle por materia'), tablaMaterias(d.materias)),
      h('div', { class: 'rejilla-2 seccion' },
        h('article', { class: 'tarjeta' }, h('h3', { class: 'tarjeta-titulo' }, icono('calendar-days'), 'Evolución semanal'), lienzo('g-semanal')),
        h('article', { class: 'tarjeta' }, h('h3', { class: 'tarjeta-titulo' }, icono('calendar'), 'Evolución mensual'), lienzo('g-mensual'))),
      h('div', { class: 'rejilla-2 seccion' },
        h('article', { class: 'tarjeta' }, h('h3', { class: 'tarjeta-titulo' }, icono('layout-dashboard'), 'Rendimiento por tema'), arbolTemas(d.temas)),
        h('div', { class: 'columna', style: { gap: 'var(--esp-6)' } },
          erroresFrecuentes(d.errores_frecuentes),
          h('article', { class: 'tarjeta' },
            h('div', { class: 'cabecera-vanty' }, h('img', { src: '/img/vanty.svg', alt: '' }), h('h3', { class: 'mb-0' }, 'Recomendaciones de Vanty')),
            h('div', { class: 'lista-recomendaciones' }, d.recomendaciones.map((r) => h('div', { class: 'recomendacion' },
              h('strong', {}, r.titulo), h('p', {}, r.texto),
              r.accion ? h('a', { class: 'btn btn-secundario btn-sm', href: r.accion.url }, r.accion.etiqueta) : null)))))));
    graficas(d);
  } catch (error) {
    montar(contenedor, errorCarga(error, cargarAvance));
  }
}

await iniciarPagina({ activa: 'avance' });
cargarAvance();
