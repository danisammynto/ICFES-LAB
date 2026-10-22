/**
 * Dashboard principal (Inicio).
 */
import { api } from '../core/api.js';
import { $, formatoFecha, formatoNumero, formatoPorcentaje, h, icono, montar } from '../core/dom.js';
import { iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { alfa, grafica, PALETA } from '../core/graficas.js';
import { crearPersonaje, etapaDeNivel } from '../core/personaje.js';
import { pedirFechaExamen, preguntarCalendario, textoCuentaRegresiva } from '../core/calendario.js';
import { errorCarga, toastError } from '../core/ui.js';

const LETRAS_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function saludoSegunHora() {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function pintarRacha(racha) {
  $('#dias-racha').textContent = racha.actual;
  $('.racha').classList.toggle('apagada', racha.actual === 0);
  $('#record-racha').textContent = racha.maxima > 0 ? `Tu récord: ${racha.maxima} ${racha.maxima === 1 ? 'día' : 'días'} · ${racha.protectores} protector${racha.protectores === 1 ? '' : 'es'}` : '¡Estudia hoy para encender tu racha!';

  // Semana actual (lunes a domingo) según el calendario de actividad.
  const hoy = racha.calendario[racha.calendario.length - 1];
  const diaSemanaHoy = (new Date(`${hoy.fecha}T12:00:00`).getDay() + 6) % 7;
  const semana = racha.calendario.slice(-(diaSemanaHoy + 1));
  montar($('#semana-racha'), LETRAS_DIA.map((letra, i) => {
    const dia = semana[i];
    const activo = dia && dia.nivel > 0;
    return h('div', { class: `dia-racha ${activo ? 'activo' : ''} ${i === diaSemanaHoy ? 'hoy' : ''}` },
      h('span', {}, activo ? icono('flame', 'icono-sm') : ''),
      h('span', {}, letra));
  }));

  const proxima = racha.proxima_recompensa;
  if (proxima) {
    const avance = Math.round((100 * racha.actual) / proxima.dias);
    montar($('#recompensa-racha'),
      h('span', {}, icono('gift', 'icono-sm'), ` Próxima recompensa: `, h('strong', {}, proxima.nombre), ` en ${proxima.faltan} ${proxima.faltan === 1 ? 'día' : 'días'}`),
      h('div', { class: 'barra barra-sm', style: { '--valor': `${avance}%`, '--color': 'var(--durazno-600)' } }));
  }
}

function pintarRecordatorio(recordatorio) {
  const { leccion_del_dia: delDia } = recordatorio;
  $('#mensaje-estudio').textContent = recordatorio.estudio_hoy
    ? `¡YA SUMASTE TU DÍA ${recordatorio.dia_estudio} DE ESTUDIO!`
    : `ESTE ES TU DÍA ${recordatorio.dia_estudio} DE ESTUDIO`;
  $('#motivacion').textContent = recordatorio.mensaje;
  const boton = $('#boton-leccion');
  boton.href = delDia.url;
  boton.textContent = delDia.tipo === 'leccion' ? 'INICIA TU LECCIÓN DE HOY' : 'PRACTICA TU TEMA DE HOY';
  const detalle = $('#detalle-leccion');
  detalle.textContent = delDia.tipo === 'leccion'
    ? `${delDia.materia.nombre} · ${delDia.leccion.titulo} · ${delDia.leccion.duracion_min} min`
    : `${delDia.materia.nombre} · ${delDia.subtema.nombre}`;
  detalle.title = delDia.motivo;
}

/**
 * Cuenta regresiva según el calendario del estudiante (A o B) y la fecha oficial del ICFES.
 * Sin fecha oficial única no se muestra ningún número: se explica la situación y se pide el dato.
 */
function pintarCuentaRegresiva(icfes) {
  const dias = icfes.dias;
  $('#dias-icfes').textContent = dias == null ? '–' : Math.max(0, dias);
  $('#fecha-icfes').textContent = textoCuentaRegresiva(icfes);

  const actualizar = (r) => {
    if (!r) return;
    procesarRecompensas(r);
    pintarCuentaRegresiva(r.cuenta_regresiva);
  };
  const enlace = (texto, accion) => h('button', { type: 'button', class: 'boton-enlace', onclick: accion }, texto);
  const cambiar = () => preguntarCalendario({ actual: icfes.calendario }).then(actualizar);
  const acciones = [];
  if (!icfes.calendario) {
    acciones.push(h('button', { type: 'button', class: 'btn btn-primario btn-sm', onclick: cambiar }, icono('calendar-days', 'icono-sm'), 'Elegir mi calendario'));
  } else {
    acciones.push(h('span', { class: 'chip' }, icono('calendar-days', 'icono-sm'), `Calendario ${icfes.calendario}`));
    if (icfes.estado === 'varias' || icfes.estado === 'elegida') acciones.push(enlace('Elegir mi fecha', () => pedirFechaExamen(icfes).then(actualizar)));
    if (icfes.estado === 'sin_publicar' || icfes.estado === 'citacion') acciones.push(enlace(icfes.estado === 'citacion' ? 'Cambiar fecha de mi citación' : 'Ingresar fecha de mi citación', () => pedirFechaExamen(icfes).then(actualizar)));
    acciones.push(enlace('Cambiar calendario', cambiar));
  }
  montar($('#acciones-cuenta'), acciones);
}

// Si el calendario se elige en la pregunta del primer inicio de sesión, el contador se actualiza solo.
window.addEventListener('icfes:calendario', (e) => {
  if (e.detail?.cuenta_regresiva) pintarCuentaRegresiva(e.detail.cuenta_regresiva);
});

/** Mascota del recordatorio: muestra la etapa que corresponde al nivel del estudiante. */
function pintarPersonaje(nivel) {
  const numero = nivel?.nivel?.numero ?? 1;
  const etapa = etapaDeNivel(numero);
  const marco = $('#personaje-inicio');
  montar(marco, crearPersonaje({ nivel: numero, clase: 'personaje-widget', etiqueta: `Tu mascota en la etapa ${etapa.nombre}` }));
  marco.title = `${etapa.nombre}: ${etapa.descripcion}`;
}

function pintarProgreso(progreso, nivel) {
  $('#anillo-progreso').style.setProperty('--porcentaje', progreso.general);
  $('#porcentaje-general').textContent = `${progreso.general}%`;

  montar($('#nivel-resumen'),
    h('div', { class: 'fila-entre' },
      h('span', { class: 'fila gap-2' }, h('span', { class: 'medalla', style: { '--color': nivel.nivel.color, width: '34px', height: '34px' } }, icono(nivel.nivel.icono, 'icono-sm')),
        h('strong', {}, `Nivel ${nivel.nivel.numero} · ${nivel.nivel.nombre}`)),
      h('span', { class: 'texto-2' }, `${formatoNumero(nivel.xp)} XP`)),
    h('div', { class: 'barra', style: { '--valor': `${nivel.progreso}%`, '--color': 'var(--lima-600)' } }),
    nivel.siguiente
      ? h('p', { class: 'texto-xs texto-3 mt-4 mb-0' },
        `Para ${nivel.siguiente.nombre}: ${nivel.siguiente.cumplidos} de ${nivel.siguiente.requisitos.length} requisitos cumplidos. `,
        h('a', { href: '/logros#niveles' }, 'Ver requisitos'))
      : h('p', { class: 'texto-xs texto-3 mt-4 mb-0' }, `¡Alcanzaste el nivel máximo: ${nivel.nivel.nombre}!`));

  montar($('#lista-progreso'), progreso.materias.map((m) =>
    h('a', { class: 'materia-item', href: `/materia?slug=${m.slug}`, style: { color: 'inherit', textDecoration: 'none' } },
      h('div', { class: 'fila-entre' }, h('span', {}, m.nombre), h('span', {}, `${m.progreso}%`)),
      h('div', { class: 'barra', style: { '--valor': `${m.progreso}%`, '--color': m.color } }))));
}

function pintarKpis(estadisticas, puntaje) {
  const kpi = (nombreIcono, etiqueta, valor, extra) => h('article', { class: 'tarjeta kpi' },
    h('div', { class: 'fila-entre' }, h('span', { class: 'kpi-etiqueta' }, etiqueta), icono(nombreIcono)),
    h('span', { class: 'kpi-valor' }, valor),
    extra ? h('div', { class: 'kpi-extra' }, extra) : null);

  montar($('#kpis'),
    kpi('target', 'Precisión', formatoPorcentaje(estadisticas.precision), 'Últimos 30 días'),
    kpi('timer', 'Tiempo promedio', estadisticas.tiempo_promedio_seg != null ? `${Math.round(estadisticas.tiempo_promedio_seg)} s` : '—', 'Por respuesta'),
    kpi('list-checks', 'Preguntas', formatoNumero(estadisticas.respondidas_30), `${formatoNumero(estadisticas.respondidas_total)} en total`),
    kpi('gauge', 'Puntaje estimado', puntaje.global.puntaje != null ? `${puntaje.global.puntaje}` : '—',
      puntaje.global.puntaje != null ? `de 500 · proyección ${puntaje.proyeccion.puntaje ?? '—'}` : 'Responde preguntas de varias áreas'));
}

function pintarGraficas(datos) {
  // Horas por día (semana actual)
  const hoy = (new Date().getDay() + 6) % 7;
  const semana = datos.horas_semana;
  grafica($('#graficobarras'), {
    type: 'bar',
    data: {
      labels: semana.dias.map((d) => d.etiqueta),
      datasets: [
        {
          label: 'Horas',
          data: semana.dias.map((d) => d.horas),
          backgroundColor: semana.dias.map((_, i) => (i === hoy ? PALETA.indigo : alfa(PALETA.cielo, 0.75))),
          borderRadius: 8,
          maxBarThickness: 28,
        },
        {
          type: 'line',
          label: 'Meta diaria',
          data: semana.dias.map(() => Math.round((semana.meta_horas / 7) * 100) / 100),
          borderColor: PALETA.durazno,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(2)} h` } },
        title: { display: true, text: `Total: ${semana.total_horas} h de ${semana.meta_horas} h`, align: 'start', font: { weight: '600' } },
      },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => `${v} h` } }, x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, font: { size: 11 } } } },
    },
  });

  // Radar: puntaje estimado por área
  const conDatos = datos.desempeno.some((a) => a.puntaje != null);
  const canvasRadar = $('#graficoRadar');
  canvasRadar.parentElement.querySelector('.grafica-vacia')?.remove();
  grafica(canvasRadar, {
    type: 'radar',
    data: {
      labels: datos.desempeno.map((a) => a.nombre_corto),
      datasets: [{
        label: 'Puntaje estimado',
        data: datos.desempeno.map((a) => a.puntaje ?? 0),
        backgroundColor: alfa(PALETA.cielo, 0.3),
        borderColor: PALETA.indigo,
        pointBackgroundColor: datos.desempeno.map((a) => a.color),
        pointRadius: 4,
        borderWidth: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, display: false }, pointLabels: { font: { size: 12, weight: '600' } } } },
    },
  });
  if (!conDatos) {
    canvasRadar.parentElement.append(h('div', { class: 'grafica-vacia' }, 'Responde preguntas de las 5 áreas para ver tu desempeño.'));
  }

  // Evolución semanal
  const evolucion = datos.evolucion_semanal;
  grafica($('#grafico-evolucion'), {
    data: {
      labels: evolucion.map((s) => s.etiqueta),
      datasets: [
        {
          type: 'line',
          label: 'Precisión (%)',
          data: evolucion.map((s) => s.precision),
          borderColor: PALETA.indigo,
          backgroundColor: alfa(PALETA.indigo, 0.12),
          fill: true,
          tension: 0.35,
          spanGaps: true,
          yAxisID: 'y',
        },
        {
          type: 'bar',
          label: 'Preguntas',
          data: evolucion.map((s) => s.respondidas),
          backgroundColor: alfa(PALETA.lima600, 0.55),
          borderRadius: 6,
          maxBarThickness: 26,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
        y1: { position: 'right', beginAtZero: true, grid: { display: false } },
        x: { grid: { display: false } },
      },
    },
  });
}

function pintarRecomendaciones(recomendaciones) {
  montar($('#recomendaciones'), recomendaciones.map((r) => h('div', { class: 'recomendacion' },
    h('strong', {}, r.titulo),
    h('p', {}, r.texto),
    r.accion ? h('a', { class: 'btn btn-secundario btn-sm', href: r.accion.url }, r.accion.etiqueta, icono('arrow-right', 'icono-sm')) : null)));
}

function pintarCalendario(dias) {
  const primero = new Date(`${dias[0].fecha}T12:00:00`);
  const relleno = (primero.getDay() + 6) % 7;
  montar($('#calendario'),
    Array.from({ length: relleno }, () => h('span', { class: 'vacio-dia' })),
    dias.map((d) => h('span', {
      class: d.nivel ? `n${d.nivel}` : '',
      title: `${formatoFecha(d.fecha, { day: 'numeric', month: 'short' })}: ${d.minutos} min · ${d.preguntas} preguntas`,
    })));
}

async function cargar() {
  const usuario = await iniciarPagina({ activa: 'inicio' });
  $('#saludo').textContent = `${saludoSegunHora()}, ${usuario.nombre_mostrar}`;
  try {
    const datos = await api.get('/api/analitica/dashboard');
    $('#subtitulo').textContent = datos.racha.estudio_hoy
      ? '¡Excelente! Ya estudiaste hoy. ¿Vamos por un poco más?'
      : 'Este es tu resumen de estudio. ¡Sigamos avanzando!';
    pintarRacha(datos.racha);
    pintarRecordatorio(datos.recordatorio);
    pintarPersonaje(datos.nivel);
    pintarCuentaRegresiva(datos.cuenta_regresiva);
    pintarProgreso(datos.progreso, datos.nivel);
    pintarKpis(datos.estadisticas, datos.puntaje_estimado);
    pintarRecomendaciones(datos.recomendaciones);
    pintarCalendario(datos.racha.calendario);
    pintarGraficas(datos);
  } catch (error) {
    toastError(error.message);
    montar($('#contenido'), errorCarga(error, () => window.location.reload()));
  }
}

cargar();
