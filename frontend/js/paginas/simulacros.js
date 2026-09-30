/**
 * Página principal de simulacros (prototipo Barrasimulacros).
 */
import { api } from '../core/api.js';
import { $, formatoDuracion, formatoFecha, h, icono, montar } from '../core/dom.js';
import { iniciarPagina } from '../core/layout.js';
import { cargando, errorCarga, vacio } from '../core/ui.js';
import { irAlIntento, tarjetaReto } from './simulacros-comun.js';

function pintarResumenes(datos) {
  const completados = datos.completos.filter((s) => s.completado).length;
  const mejor = Math.max(0, ...datos.completos.map((s) => s.mejor_puntaje ?? 0));
  montar($('#resumen-completos'),
    h('div', {}, h('strong', {}, `${completados}/10`), 'completados'),
    h('div', {}, h('strong', {}, mejor ? `${mejor}` : '—'), 'mejor puntaje'));
  const ejemplo = datos.completos[0];
  $('#nota-completos').textContent = ejemplo
    ? `Con el banco de preguntas actual cada simulacro tiene ${ejemplo.preguntas} preguntas (${formatoDuracion(ejemplo.duracion_min * 60)}). El tiempo se ajusta al ritmo real del ICFES: unos 2 minutos por pregunta.`
    : '';

  const minisHechos = datos.minis.filter((s) => s.completado).length;
  const estrellasTotales = datos.minis.reduce((s, m) => s + m.estrellas, 0);
  montar($('#resumen-minis'),
    h('div', {}, h('strong', {}, `${minisHechos}/10`), 'etapas del camino'),
    h('div', {}, h('strong', {}, `${estrellasTotales}/30`), 'estrellas'));
}

function pintarEnCurso(datos) {
  const enCurso = [...datos.completos, ...datos.minis, ...datos.retos].filter((s) => s.intento_en_curso);
  montar($('#aviso-en-curso'), enCurso.map((s) => h('div', { class: 'aviso-en-curso' },
    icono('hourglass'),
    h('div', { class: 'crecer' }, h('strong', {}, `Tienes "${s.titulo}" en curso.`), h('div', { class: 'texto-sm texto-2' }, 'Tus respuestas están guardadas. Recuerda que el tiempo de la sesión sigue corriendo.')),
    h('button', { class: 'btn btn-primario btn-sm', onclick: () => irAlIntento(s.intento_en_curso) }, icono('play', 'icono-sm'), 'Continuar'))));
}

async function pintarHistorial() {
  const contenedor = $('#historial');
  const { resultados } = await api.get('/api/simulacros/historial');
  if (!resultados.length) {
    montar(contenedor, vacio('history', 'Aún no has presentado simulacros', 'Empieza por el Minisimulacro 1: es un diagnóstico rápido de las 5 áreas.'));
    return;
  }
  montar(contenedor, h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla historial' },
    h('thead', {}, h('tr', {}, ['Fecha', 'Simulacro', 'Puntaje', 'Aciertos', 'Tiempo', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, resultados.map((r) => h('tr', {},
      h('td', {}, formatoFecha(r.creado_en, { day: 'numeric', month: 'short', year: 'numeric' })),
      h('td', {}, h('span', { class: `chip ${r.tipo === 'completo' ? 'chip-cielo' : r.tipo === 'mini' ? 'chip-lima' : 'chip-racha'}` }, r.titulo)),
      h('td', {}, h('strong', {}, `${r.puntaje_global}`), h('span', { class: 'texto-3' }, ' / 500')),
      h('td', {}, `${r.aciertos}/${r.total} (${Math.round(r.porcentaje)}%)`),
      h('td', {}, formatoDuracion(r.tiempo_usado_seg)),
      h('td', {}, h('a', { href: `/resultado?intento=${r.intento_id}`, class: 'btn btn-fantasma btn-sm' }, 'Ver', icono('arrow-right', 'icono-sm')))))))));
}

async function cargarSimulacros() {
  montar($('#lista-retos'), cargando());
  try {
    const datos = await api.get('/api/simulacros');
    pintarResumenes(datos);
    pintarEnCurso(datos);
    montar($('#lista-retos'), datos.retos.map(tarjetaReto));
    await pintarHistorial();
  } catch (error) {
    montar($('#lista-retos'), errorCarga(error, cargarSimulacros));
  }
}

await iniciarPagina({ activa: 'simulacros' });
cargarSimulacros();
