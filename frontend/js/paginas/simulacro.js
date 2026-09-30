/**
 * Presentación de un simulacro, minisimulacro o reto (modo examen).
 *
 * · El tiempo lo controla el servidor; aquí solo se muestra la cuenta regresiva.
 * · Cada respuesta y marca se guarda al instante (autoguardado).
 * · Al terminar la última sesión se redirige a la página de resultados.
 */
import { api } from '../core/api.js';
import { $, formatoDuracion, formatoReloj, h, icono, montar, parametro } from '../core/dom.js';
import { crearPregunta } from '../core/pregunta.js';
import { iniciarPagina } from '../core/layout.js';
import { cargando, confirmar, conCarga, errorCarga, toast, toastError, vacio } from '../core/ui.js';

const intentoId = parametro('intento');
const principal = $('#contenido');

let estado = null;
let sesion = null;
let indice = 0;
let respuestas = new Map();
let tiempoFin = 0;
let temporizador = null;
let inicioPregunta = Date.now();
let avisos = new Set();
let enCurso = false;

const irAResultado = () => window.location.replace(`/resultado?intento=${intentoId}`);

window.addEventListener('beforeunload', (e) => {
  if (!enCurso) return;
  e.preventDefault();
  e.returnValue = '';
});

// ---------------------------------------------------------------------------
// Carga del estado
// ---------------------------------------------------------------------------

async function cargar() {
  clearInterval(temporizador);
  enCurso = false;
  montar(principal, cargando('Cargando simulacro…'));
  try {
    estado = await api.get(`/api/intentos/${intentoId}`);
  } catch (error) {
    montar(principal, errorCarga(error, cargar));
    return;
  }
  document.title = `${estado.simulacro.titulo} · ICFES Lab`;

  if (estado.intento.estado === 'finalizado') {
    irAResultado();
    return;
  }
  if (estado.intento.estado === 'abandonado') {
    montar(principal, h('div', { class: 'tarjeta pantalla-sesion' },
      vacio('flag', 'Abandonaste este simulacro', 'Puedes empezarlo de nuevo cuando quieras desde la sección de simulacros.',
        h('a', { class: 'btn btn-primario', href: '/simulacros' }, 'Ir a simulacros'))));
    return;
  }
  if (estado.sesion_cerrada_automaticamente) {
    toast('El tiempo de la sesión anterior terminó y se cerró automáticamente.', { icono: 'alarm-clock' });
  }

  sesion = estado.sesiones.find((s) => s.numero === estado.intento.sesion_actual);
  if (!sesion.iniciada) pantallaInicioSesion();
  else mostrarExamen();
}

// ---------------------------------------------------------------------------
// Pantalla de inicio de sesión (y descanso entre sesiones)
// ---------------------------------------------------------------------------

function pantallaInicioSesion() {
  const total = estado.sesiones.length;
  const esDescanso = sesion.numero > 1;
  const botonComenzar = h('button', { class: 'btn btn-primario btn-lg' }, icono('play'), total > 1 ? `Comenzar sesión ${sesion.numero}` : 'Comenzar');
  botonComenzar.addEventListener('click', async () => {
    try {
      await conCarga(botonComenzar, () => api.post(`/api/intentos/${intentoId}/sesiones/${sesion.numero}/iniciar`));
      cargar();
    } catch (error) {
      toastError(error.message);
    }
  });

  const botonAbandonar = h('button', { class: 'btn btn-fantasma' }, 'Abandonar simulacro');
  botonAbandonar.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: '¿Abandonar el simulacro?', mensaje: 'Perderás las respuestas de este intento y no recibirás recompensas.', aceptar: 'Abandonar', peligro: true });
    if (!ok) return;
    await api.post(`/api/intentos/${intentoId}/abandonar`).catch((e) => toastError(e.message));
    window.location.href = '/simulacros';
  });

  montar(principal, h('section', { class: 'tarjeta pantalla-sesion animar-entrada' },
    h('img', { src: '/img/vanty.svg', alt: '' }),
    h('p', { class: 'texto-3 negrita mb-0', style: { textTransform: 'uppercase', letterSpacing: '0.08em' } }, estado.simulacro.titulo),
    h('h1', {}, esDescanso ? `¡Terminaste la sesión ${sesion.numero - 1}!` : total > 1 ? `Sesión ${sesion.numero} de ${total}` : 'Todo listo'),
    h('p', { class: 'texto-2' }, esDescanso
      ? 'Tómate un descanso: estira las piernas, toma agua y respira. Cuando estés listo, empieza la siguiente sesión.'
      : 'Busca un lugar tranquilo y ten a mano lápiz y papel para tus cálculos.'),
    h('div', { class: 'fila envolver', style: { justifyContent: 'center' } },
      h('span', { class: 'chip chip-cielo' }, icono('list-checks', 'icono-sm'), `${sesion.total} preguntas`),
      h('span', { class: 'chip chip-cielo' }, icono('clock', 'icono-sm'), formatoDuracion(sesion.duracion_seg))),
    h('ul', { class: 'lista-desbloqueos' },
      ['El cronómetro empieza al pulsar "Comenzar" y sigue corriendo aunque cierres la página.',
        'Tus respuestas se guardan automáticamente.',
        'Usa "Marcar" para volver a las preguntas que quieras revisar.',
        'Teclas: A–D para responder · N siguiente · P anterior · M marcar.'].map((t) => h('li', {}, icono('circle-check', 'icono-sm'), t))),
    h('div', { class: 'fila envolver', style: { justifyContent: 'center' } },
      h('a', { class: 'btn btn-secundario', href: '/simulacros' }, 'Salir por ahora'), botonComenzar),
    h('div', { class: 'mt-4' }, botonAbandonar)));
  botonComenzar.focus();
}

// ---------------------------------------------------------------------------
// Examen
// ---------------------------------------------------------------------------

function contarRespondidas() {
  return [...respuestas.values()].filter((r) => r.opcion_id != null).length;
}

function actualizarProgreso() {
  const respondidas = contarRespondidas();
  const total = estado.preguntas.length;
  $('#texto-progreso').textContent = `${respondidas} de ${total} respondidas`;
  $('#barra-progreso').style.setProperty('--valor', `${Math.round((100 * respondidas) / total)}%`);
  estado.preguntas.forEach((p, i) => {
    const boton = $(`#nav-${i}`);
    if (!boton) return;
    const r = respuestas.get(p.pregunta.id);
    boton.classList.toggle('respondida', r.opcion_id != null);
    boton.classList.toggle('marcada', r.marcada);
    boton.classList.toggle('actual', i === indice);
    boton.setAttribute('aria-label', `Pregunta ${i + 1}${r.opcion_id != null ? ', respondida' : ''}${r.marcada ? ', marcada' : ''}`);
  });
}

function tomarTiempo() {
  const ahora = Date.now();
  const transcurrido = ahora - inicioPregunta;
  inicioPregunta = ahora;
  return transcurrido;
}

function indicarGuardado(texto, nombreIcono = 'circle-check') {
  const indicador = $('#estado-guardado');
  if (indicador) montar(indicador, icono(nombreIcono, 'icono-sm'), texto);
}

async function guardar(preguntaId, cambios) {
  const actual = respuestas.get(preguntaId);
  respuestas.set(preguntaId, { ...actual, ...cambios });
  actualizarProgreso();
  indicarGuardado('Guardando…', 'refresh-cw');
  try {
    await api.put(`/api/intentos/${intentoId}/respuestas/${preguntaId}`, { ...cambios, tiempo_ms: tomarTiempo() });
    indicarGuardado('Guardado');
  } catch (error) {
    if (error.codigo === 'TIEMPO_AGOTADO' || error.status === 409) {
      finPorTiempo();
    } else {
      indicarGuardado('Sin guardar', 'circle-alert');
      toastError(`No se pudo guardar tu respuesta: ${error.message}`);
    }
  }
}

function irA(nuevoIndice) {
  if (nuevoIndice < 0 || nuevoIndice >= estado.preguntas.length) return;
  // El tiempo dedicado a la pregunta que se deja se registra aunque no haya cambiado la respuesta.
  const anterior = estado.preguntas[indice].pregunta.id;
  const tiempo = tomarTiempo();
  if (tiempo > 3000) {
    api.put(`/api/intentos/${intentoId}/respuestas/${anterior}`, { tiempo_ms: tiempo }).catch(() => {});
  }
  indice = nuevoIndice;
  pintarPregunta();
}

function pintarPregunta() {
  const item = estado.preguntas[indice];
  const r = respuestas.get(item.pregunta.id);
  const componente = crearPregunta(item.pregunta, {
    modo: 'examen',
    seleccion: r.opcion_id,
    numero: indice + 1,
    total: estado.preguntas.length,
    onSeleccion: (opcionId) => guardar(item.pregunta.id, { opcion_id: opcionId }),
  });

  const botonMarcar = h('button', { class: `btn btn-secundario ${r.marcada ? 'marcada' : ''}`, 'aria-pressed': String(r.marcada) },
    icono('bookmark'), r.marcada ? 'Marcada' : 'Marcar para revisar');
  botonMarcar.addEventListener('click', () => {
    const marcada = !respuestas.get(item.pregunta.id).marcada;
    guardar(item.pregunta.id, { marcada });
    botonMarcar.classList.toggle('marcada', marcada);
    botonMarcar.setAttribute('aria-pressed', String(marcada));
    botonMarcar.lastChild.textContent = marcada ? 'Marcada' : 'Marcar para revisar';
  });

  const esUltima = indice === estado.preguntas.length - 1;
  montar($('#zona-pregunta'),
    h('div', { class: 'tarjeta tarjeta-pregunta' }, componente.elemento,
      h('div', { class: 'navegacion-pregunta' },
        h('button', { class: 'btn btn-secundario', disabled: indice === 0, onclick: () => irA(indice - 1) }, icono('arrow-left'), 'Anterior'),
        botonMarcar,
        esUltima
          ? h('button', { class: 'btn btn-lima', onclick: () => finalizarSesion() }, icono('flag'), 'Finalizar sesión')
          : h('button', { class: 'btn btn-primario', onclick: () => irA(indice + 1) }, 'Siguiente', icono('arrow-right')))));
  actualizarProgreso();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function actualizarReloj() {
  const restante = Math.max(0, (tiempoFin - Date.now()) / 1000);
  const reloj = $('#reloj');
  if (!reloj) return;
  reloj.lastChild.textContent = formatoReloj(restante);
  reloj.classList.toggle('alerta', restante <= 300 && restante > 60);
  reloj.classList.toggle('critico', restante <= 60);
  if (restante <= 300 && !avisos.has(300) && sesion.duracion_seg > 600) {
    avisos.add(300);
    toast('Quedan 5 minutos: revisa las preguntas marcadas y no dejes ninguna en blanco.', { icono: 'alarm-clock', tipo: 'racha' });
  }
  if (restante <= 60 && !avisos.has(60)) {
    avisos.add(60);
    toast('¡Queda 1 minuto!', { icono: 'alarm-clock', tipo: 'error' });
  }
  if (restante <= 0) finPorTiempo();
}

function mostrarExamen() {
  respuestas = new Map(estado.preguntas.map((p) => [p.pregunta.id, { opcion_id: p.opcion_id, marcada: p.marcada }]));
  indice = Math.max(0, estado.preguntas.findIndex((p) => p.opcion_id == null));
  tiempoFin = Date.now() + sesion.restante_seg * 1000;
  avisos = new Set();
  enCurso = true;
  inicioPregunta = Date.now();
  const total = estado.sesiones.length;

  const botonEntregar = h('button', { class: 'btn btn-lima btn-sm' }, icono('send', 'icono-sm'), 'Entregar');
  botonEntregar.addEventListener('click', entregar);

  montar(principal,
    h('div', { class: 'barra-examen' },
      h('h1', {}, estado.simulacro.titulo, total > 1 ? h('span', { class: 'texto-3' }, ` · Sesión ${sesion.numero} de ${total}`) : null),
      h('div', { class: 'progreso-examen' },
        h('div', { class: 'fila-entre' }, h('span', { id: 'texto-progreso' }), h('span', { class: 'estado-guardado', id: 'estado-guardado' })),
        h('div', { class: 'barra barra-sm', id: 'barra-progreso' })),
      h('div', { class: 'reloj', id: 'reloj', role: 'timer', 'aria-label': 'Tiempo restante' }, icono('timer'), h('span')),
      botonEntregar),
    h('div', { class: 'diseno-examen' },
      h('div', { id: 'zona-pregunta' }),
      h('aside', { class: 'panel-navegador tarjeta' },
        h('h3', { class: 'tarjeta-titulo' }, icono('grid-3x3'), 'Preguntas'),
        h('div', { class: 'navegador', id: 'navegador' }, estado.preguntas.map((_, i) =>
          h('button', { type: 'button', id: `nav-${i}`, onclick: () => irA(i) }, i + 1))),
        h('div', { class: 'leyenda-navegador' },
          h('span', {}, h('i', { class: 'l-respondida' }), 'Respondida'),
          h('span', {}, h('i'), 'Sin responder'),
          h('span', {}, h('i', { class: 'l-marcada' }), 'Marcada')),
        h('button', { class: 'btn btn-primario btn-bloque', onclick: () => finalizarSesion() }, icono('flag'),
          sesion.numero < total ? `Finalizar sesión ${sesion.numero}` : 'Finalizar y ver resultado'))));

  pintarPregunta();
  actualizarReloj();
  temporizador = setInterval(actualizarReloj, 500);
}

// ---------------------------------------------------------------------------
// Fin de sesión y entrega
// ---------------------------------------------------------------------------

function trasCerrar(resultado) {
  enCurso = false;
  clearInterval(temporizador);
  if (resultado.finalizado) {
    try {
      sessionStorage.setItem(`eventos-${intentoId}`, JSON.stringify({ eventos: resultado.eventos, jugador: resultado.jugador }));
    } catch { /* sin almacenamiento */ }
    irAResultado();
  } else {
    cargar();
  }
}

async function finalizarSesion() {
  const pendientes = estado.preguntas.length - contarRespondidas();
  const ultima = sesion.numero === estado.sesiones.length;
  const ok = await confirmar({
    titulo: ultima ? '¿Terminar el simulacro?' : `¿Terminar la sesión ${sesion.numero}?`,
    mensaje: pendientes
      ? `Tienes ${pendientes} ${pendientes === 1 ? 'pregunta' : 'preguntas'} sin responder. En el ICFES una pregunta en blanco vale lo mismo que una incorrecta.`
      : 'Respondiste todas las preguntas. ¡Buen trabajo!',
    aceptar: ultima ? 'Terminar y ver resultado' : 'Terminar sesión',
    cancelar: 'Seguir revisando',
  });
  if (!ok) return;
  try {
    trasCerrar(await api.post(`/api/intentos/${intentoId}/sesiones/${sesion.numero}/finalizar`));
  } catch (error) {
    toastError(error.message);
    if (error.status === 409) cargar();
  }
}

async function entregar() {
  const quedanSesiones = sesion.numero < estado.sesiones.length;
  const ok = await confirmar({
    titulo: '¿Entregar el simulacro?',
    mensaje: quedanSesiones
      ? 'Las sesiones que aún no has presentado contarán como preguntas sin responder.'
      : 'Se calificarán tus respuestas y verás tu resultado.',
    aceptar: 'Entregar',
    cancelar: 'Seguir',
    peligro: quedanSesiones,
  });
  if (!ok) return;
  try {
    trasCerrar(await api.post(`/api/intentos/${intentoId}/finalizar`));
  } catch (error) {
    toastError(error.message);
    if (error.status === 409) cargar();
  }
}

let cerrandoPorTiempo = false;
async function finPorTiempo() {
  if (cerrandoPorTiempo) return;
  cerrandoPorTiempo = true;
  clearInterval(temporizador);
  enCurso = false;
  toast('¡Se acabó el tiempo de la sesión!', { icono: 'alarm-clock', tipo: 'error' });
  try {
    trasCerrar(await api.post(`/api/intentos/${intentoId}/sesiones/${sesion.numero}/finalizar`));
  } catch {
    // El servidor pudo haberla cerrado ya: se recarga el estado.
    cargar();
  } finally {
    cerrandoPorTiempo = false;
  }
}

// Atajos de teclado durante el examen.
document.addEventListener('keydown', (e) => {
  if (!enCurso || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
  const tecla = e.key.toLowerCase();
  if (tecla === 'n') irA(indice + 1);
  else if (tecla === 'p') irA(indice - 1);
  else if (tecla === 'm') $('.navegacion-pregunta .btn:nth-child(2)')?.click();
});

await iniciarPagina({ modoExamen: true });
if (!intentoId) window.location.replace('/simulacros');
else cargar();
