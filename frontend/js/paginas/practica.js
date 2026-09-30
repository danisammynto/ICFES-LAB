/**
 * Práctica adaptativa por subtema o por materia.
 * Cada respuesta se califica en el servidor y devuelve la explicación y las recompensas.
 */
import { api } from '../core/api.js';
import { $, formatoReloj, h, icono, montar, parametro } from '../core/dom.js';
import { crearPregunta } from '../core/pregunta.js';
import { iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { cargando, conCarga, errorCarga, toastError, vacio } from '../core/ui.js';

const subtema = parametro('subtema');
const materia = parametro('materia');
const vistas = [];
const sesion = { respondidas: 0, correctas: 0, seguidas: 0 };
let cronometro = null;

function actualizarMarcador(dominio) {
  $('#m-respondidas').textContent = sesion.respondidas;
  $('#m-precision').textContent = sesion.respondidas ? `${Math.round((100 * sesion.correctas) / sesion.respondidas)}%` : '—';
  $('#m-seguidas').textContent = sesion.seguidas;
  if (dominio != null) $('#m-dominio').textContent = `${Math.round(dominio)}%`;
}

function iniciarCronometro(elemento) {
  clearInterval(cronometro);
  const inicio = Date.now();
  const pintar = () => { elemento.textContent = formatoReloj((Date.now() - inicio) / 1000); };
  pintar();
  cronometro = setInterval(pintar, 1000);
  return () => { clearInterval(cronometro); return Date.now() - inicio; };
}

function finDeSesion() {
  return vacio('party-popper', '¡Respondiste todas las preguntas disponibles!',
    `Resultado de la sesión: ${sesion.correctas} de ${sesion.respondidas} correctas. Vuelve mañana para repasar las que fallaste o prueba con otro tema.`,
    h('div', { class: 'fila envolver', style: { justifyContent: 'center' } },
      h('button', { class: 'btn btn-primario', onclick: () => { vistas.length = 0; siguiente(); } }, icono('rotate-ccw'), 'Repasar de nuevo'),
      h('a', { class: 'btn btn-secundario', href: '/materias' }, 'Elegir otro tema')));
}

async function siguiente() {
  const zona = $('#zona-pregunta');
  montar(zona, cargando('Buscando una pregunta para ti…'));
  try {
    const consulta = new URLSearchParams();
    if (subtema) consulta.set('subtema', subtema);
    if (materia) consulta.set('materia', materia);
    if (vistas.length) consulta.set('excluir', vistas.join(','));
    const datos = await api.get(`/api/practica/siguiente?${consulta}`);

    $('#titulo-practica').textContent = subtema ? `Práctica: ${datos.subtema.nombre}` : `Práctica: ${datos.materia.nombre}`;
    $('#subtitulo-practica').textContent = `${datos.materia.nombre} · Dificultad objetivo: ${['', 'baja', 'media', 'alta'][datos.dificultad_objetivo]}`;
    const miga = $('#miga');
    miga.href = `/materia?slug=${datos.materia.slug}`;
    miga.lastChild.textContent = ` ${datos.materia.nombre}`;
    actualizarMarcador(datos.dominio);

    if (!datos.pregunta) {
      montar(zona, h('div', { class: 'tarjeta' }, finDeSesion()));
      return;
    }
    mostrarPregunta(datos.pregunta);
  } catch (error) {
    if (error.codigo === 'BLOQUEADO') {
      montar(zona, h('div', { class: 'tarjeta' }, vacio('lock', 'Tema bloqueado', error.message, h('a', { class: 'btn btn-primario', href: '/materias' }, 'Ver materias'))));
    } else {
      montar(zona, errorCarga(error, siguiente));
    }
  }
}

function mostrarPregunta(pregunta) {
  vistas.push(pregunta.id);
  const reloj = h('span', { class: 'cronometro', 'aria-label': 'Tiempo en esta pregunta' }, icono('timer', 'icono-sm'), h('span'));
  const detenerReloj = iniciarCronometro(reloj.lastChild);
  const botonResponder = h('button', { class: 'btn btn-primario btn-lg', disabled: true }, 'Responder');
  const acciones = h('div', { class: 'acciones-pregunta' }, botonResponder);
  const componente = crearPregunta(pregunta, {
    modo: 'practica',
    onSeleccion: () => { botonResponder.disabled = false; },
  });

  botonResponder.addEventListener('click', async () => {
    const opcionId = componente.seleccion();
    if (!opcionId) return;
    const tiempo = detenerReloj();
    try {
      const resultado = await conCarga(botonResponder, () => api.post('/api/practica/responder', {
        pregunta_id: pregunta.id,
        opcion_id: opcionId,
        tiempo_ms: tiempo,
        origen: 'practica',
      }));
      componente.mostrarSolucion(resultado);
      sesion.respondidas += 1;
      if (resultado.correcta) { sesion.correctas += 1; sesion.seguidas += 1; } else { sesion.seguidas = 0; }
      actualizarMarcador();
      procesarRecompensas(resultado);

      const botonSiguiente = h('button', { class: 'btn btn-primario btn-lg', onclick: siguiente }, 'Siguiente pregunta', icono('arrow-right'));
      montar(acciones,
        resultado.correcta ? null : h('a', {
          class: 'btn btn-secundario btn-lg',
          href: `/vanty?pregunta=${pregunta.id}&opcion=${opcionId}`,
        }, icono('bot'), 'Pregúntale a Vanty'),
        botonSiguiente);
      botonSiguiente.focus();
    } catch (error) {
      toastError(error.message);
    }
  });

  montar($('#zona-pregunta'), h('div', { class: 'tarjeta tarjeta-pregunta animar-entrada' },
    h('div', { class: 'fila-entre', style: { marginBottom: 'var(--esp-4)' } }, h('span', { class: 'texto-3 texto-sm' }, `Pregunta ${sesion.respondidas + 1} de la sesión`), reloj),
    componente.elemento,
    acciones));
  preguntaActual = componente;
}

// Atajos de teclado: A–D (o 1–4) eligen opción y Enter responde o pasa a la siguiente.
let preguntaActual = null;
document.addEventListener('keydown', (e) => {
  if (!preguntaActual || e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.target.closest?.('.opciones')) return; // El propio grupo de opciones ya maneja las teclas.
  const indice = 'abcd'.indexOf(e.key.toLowerCase()) >= 0 ? 'abcd'.indexOf(e.key.toLowerCase()) : '1234'.indexOf(e.key);
  if (indice >= 0) preguntaActual.elegirIndice(indice);
  else if (e.key === 'Enter' && e.target === document.body) $('.acciones-pregunta .btn-primario:not(:disabled)')?.click();
});

await iniciarPagina({ activa: 'materias' });
if (!subtema && !materia) window.location.replace('/materias');
else siguiente();
