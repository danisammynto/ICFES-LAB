/**
 * Resultado de un simulacro: puntaje, rendimiento por área, recomendaciones y revisión.
 */
import { api } from '../core/api.js';
import { $, formatoDuracion, formatoFecha, formatoNumero, h, icono, montar, parametro } from '../core/dom.js';
import { crearPregunta } from '../core/pregunta.js';
import { iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { grafica, alfa } from '../core/graficas.js';
import { cargando, errorCarga } from '../core/ui.js';
import { estrellas } from './simulacros-comun.js';

const intentoId = parametro('intento');

function mensajeResultado(r) {
  if (r.tipo === 'reto') return r.aprobado ? '¡Reto superado!' : 'Reto no superado… ¡esta vez!';
  if (r.porcentaje >= 80) return '¡Resultado sobresaliente!';
  if (r.porcentaje >= 60) return '¡Buen trabajo!';
  if (r.porcentaje >= 40) return 'Vas por buen camino';
  return 'Cada simulacro te acerca a tu meta';
}

function hero(datos) {
  const r = datos.resultado;
  const diferencia = datos.anterior ? r.puntaje_global - datos.anterior.puntaje_global : null;
  return h('section', { class: 'hero-resultado animar-entrada' },
    h('div', { class: 'anillo', style: { '--porcentaje': r.porcentaje } },
      h('div', { class: 'centrado' },
        h('span', { class: 'anillo-valor' }, r.tipo === 'reto' ? `${Math.round(r.porcentaje)}%` : r.puntaje_global),
        h('span', { class: 'anillo-etiqueta' }, r.tipo === 'reto' ? 'de aciertos' : 'puntaje de 500'))),
    h('div', {},
      r.tipo !== 'completo' ? estrellas(r.estrellas) : null,
      h('h1', {}, mensajeResultado(r)),
      h('p', {}, `${r.titulo} · ${formatoFecha(r.creado_en, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}`),
      h('div', { class: 'fila envolver' },
        h('span', { class: 'chip' }, icono('target', 'icono-sm'), `${Math.round(r.porcentaje)}% de aciertos`),
        r.tipo === 'reto' ? h('span', { class: 'chip' }, icono('flag', 'icono-sm'), `Mínimo para superarlo: ${r.porcentaje_aprobacion}%`) : null,
        diferencia != null
          ? h('span', { class: 'chip comparacion' }, icono(diferencia >= 0 ? 'trending-up' : 'trending-down', 'icono-sm'),
            `${diferencia >= 0 ? '+' : ''}${diferencia} puntos vs. tu intento anterior`)
          : null)));
}

function cifras(r) {
  const cifra = (clase, nombreIcono, valor, etiqueta) => h('div', { class: `tarjeta cifra ${clase}` }, icono(nombreIcono), h('strong', {}, valor), h('span', {}, etiqueta));
  return h('div', { class: 'cifras' },
    cifra('acierto', 'circle-check', r.aciertos, 'Aciertos'),
    cifra('error', 'circle-x', r.errores, 'Errores'),
    cifra('omitida', 'circle-help', r.omitidas, 'Sin responder'),
    cifra('', 'clock', formatoDuracion(r.tiempo_usado_seg), 'Tiempo usado'),
    cifra('', 'zap', `+${formatoNumero(r.xp_ganado)}`, 'XP ganado'),
    cifra('', 'coins', `+${formatoNumero(r.monedas_ganadas)}`, 'Monedas'));
}

function rendimientoPorArea(materias) {
  return h('article', { class: 'tarjeta' },
    h('h3', { class: 'tarjeta-titulo' }, icono('chart-column'), 'Rendimiento por área'),
    h('div', { class: 'grafica', style: { height: `${Math.max(180, materias.length * 52)}px` } }, h('canvas', { id: 'grafico-areas', 'aria-label': 'Puntaje por área' })),
    h('div', { class: 'areas-resultado mt-4' }, materias.map((m) => h('div', { class: 'area-resultado' },
      h('div', { class: 'fila-entre' },
        h('span', { class: 'fila gap-2' }, icono(m.icono, 'icono-sm'), m.nombre),
        h('span', { class: 'texto-2' }, `${m.aciertos}/${m.total} · ${Math.round(m.tiempo_promedio_ms / 1000)} s por pregunta`))))));
}

function recomendaciones(lista) {
  return h('article', { class: 'tarjeta' },
    h('div', { class: 'cabecera-vanty' }, h('img', { src: '/img/vanty.svg', alt: '' }), h('h3', { class: 'mb-0' }, 'Recomendaciones de Vanty')),
    lista?.length
      ? h('div', { class: 'lista-recomendaciones' }, lista.map((r) => h('div', { class: 'recomendacion' },
        h('strong', {}, r.titulo), h('p', {}, r.texto),
        r.accion ? h('a', { class: 'btn btn-secundario btn-sm', href: r.accion.url }, r.accion.etiqueta, icono('arrow-right', 'icono-sm')) : null)))
      : h('p', { class: 'texto-2 mb-0' }, 'Sigue practicando: pronto tendré más recomendaciones para ti.'));
}

function revision(items) {
  const filtros = [
    ['todas', 'Todas', () => true],
    ['incorrectas', 'Incorrectas', (i) => !i.omitida && !i.correcta],
    ['omitidas', 'Sin responder', (i) => i.omitida],
    ['marcadas', 'Marcadas', (i) => i.marcada],
    ['correctas', 'Correctas', (i) => i.correcta],
  ];
  const lista = h('div', {});
  const botones = filtros.map(([clave, etiqueta, filtro]) => {
    const cantidad = items.filter(filtro).length;
    const boton = h('button', { class: 'btn btn-secundario btn-sm', 'aria-pressed': String(clave === 'todas'), disabled: !cantidad }, `${etiqueta} (${cantidad})`);
    boton.addEventListener('click', () => {
      botones.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      boton.setAttribute('aria-pressed', 'true');
      pintar(filtro);
    });
    return boton;
  });

  function pintar(filtro) {
    montar(lista, items.map((item, i) => ({ item, i })).filter(({ item }) => filtro(item)).map(({ item, i }) => {
      const estadoClase = item.omitida ? 'omitida' : item.correcta ? 'acierto' : 'error';
      const detalle = h('details', { class: 'item-revision' },
        h('summary', {},
          icono(item.omitida ? 'circle-help' : item.correcta ? 'circle-check' : 'circle-x', `icono-estado ${estadoClase}`),
          h('strong', {}, `${i + 1}.`),
          h('span', { class: 'chip', style: { background: `color-mix(in srgb, ${item.pregunta.materia.color} 16%, transparent)`, color: 'var(--texto)' } }, item.pregunta.materia.nombre),
          h('span', { class: 'resumen-enunciado' }, item.pregunta.enunciado),
          item.marcada ? icono('bookmark', 'icono-sm') : null),
        h('div', { class: 'cuerpo-revision' }));
      detalle.addEventListener('toggle', () => {
        const cuerpo = detalle.querySelector('.cuerpo-revision');
        if (!detalle.open || cuerpo.childElementCount) return;
        montar(cuerpo,
          crearPregunta(item.pregunta, { modo: 'revision', seleccion: item.opcion_id, numero: i + 1 }).elemento,
          !item.correcta ? h('div', { class: 'fila mt-4', style: { justifyContent: 'flex-end' } },
            h('a', { class: 'btn btn-secundario btn-sm', href: `/vanty?pregunta=${item.pregunta.id}${item.opcion_id ? `&opcion=${item.opcion_id}` : ''}` }, icono('bot', 'icono-sm'), 'Pregúntale a Vanty')) : null);
      });
      return detalle;
    }));
  }
  pintar(filtros[0][2]);
  return h('section', { class: 'seccion' },
    h('div', { class: 'seccion-titulo' }, h('h2', {}, 'Revisión de preguntas')),
    h('div', { class: 'filtros-revision', role: 'group', 'aria-label': 'Filtrar preguntas' }, botones),
    lista);
}

async function cargarResultado() {
  const contenedor = $('#resultado');
  montar(contenedor, cargando('Calculando tu resultado…'));
  try {
    const datos = await api.get(`/api/intentos/${intentoId}/resultado`);
    const r = datos.resultado;
    document.title = `Resultado: ${r.titulo} · ICFES Lab`;

    montar(contenedor,
      hero(datos),
      cifras(r),
      h('div', { class: 'rejilla-2 seccion' }, rendimientoPorArea(datos.materias), recomendaciones(r.recomendaciones)),
      h('div', { class: 'fila envolver seccion' },
        h('a', { class: 'btn btn-secundario', href: '/simulacros' }, icono('arrow-left'), 'Volver a simulacros'),
        datos.siguiente ? h('a', { class: 'btn btn-primario', href: '/minisimulacros' }, `Continuar: ${datos.siguiente.titulo}`, icono('arrow-right')) : null,
        h('a', { class: 'btn btn-fantasma', href: '/avance' }, icono('chart-line'), 'Ver mi avance')),
      revision(datos.revision));

    grafica($('#grafico-areas'), {
      type: 'bar',
      data: {
        labels: datos.materias.map((m) => m.nombre_corto),
        datasets: [{
          label: 'Puntaje (0–100)',
          data: datos.materias.map((m) => m.puntaje),
          backgroundColor: datos.materias.map((m) => alfa(m.color, 0.85)),
          borderRadius: 8,
          maxBarThickness: 26,
        }],
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { min: 0, max: 100 }, y: { grid: { display: false } } },
      },
    });

    // Recompensas obtenidas al terminar (guardadas por la página del simulacro).
    const clave = `eventos-${intentoId}`;
    const guardado = sessionStorage.getItem(clave);
    if (guardado) {
      sessionStorage.removeItem(clave);
      procesarRecompensas(JSON.parse(guardado));
    }
  } catch (error) {
    montar(contenedor, errorCarga(error, cargarResultado));
  }
}

await iniciarPagina({ activa: 'simulacros' });
if (!intentoId) window.location.replace('/simulacros');
else cargarResultado();
