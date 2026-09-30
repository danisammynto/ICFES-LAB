/**
 * Componente de pregunta tipo ICFES (enunciado, contexto, imagen, 4 opciones, solución).
 *
 * Modos:
 *   'practica' → el estudiante elige y confirma; luego se muestra la solución.
 *   'examen'   → elegir una opción la guarda (onSeleccion); nunca se muestra la solución.
 *   'revision' → solo lectura, con la solución y la opción elegida.
 */
import { h, icono } from './dom.js';
import { bloqueTexto } from './texto-rico.js';

const NOMBRES_DIFICULTAD = { 1: 'Baja', 2: 'Media', 3: 'Alta' };

export function indicadorDificultad(nivel) {
  return h('span', { class: 'dificultad', title: `Dificultad ${NOMBRES_DIFICULTAD[nivel] ?? ''}`.trim() },
    [1, 2, 3].map((n) => h('span', { class: n <= nivel ? 'activa' : '' })),
    h('span', { class: 'solo-lector' }, `Dificultad ${NOMBRES_DIFICULTAD[nivel]}`));
}

function metadatos(pregunta, { numero, total }) {
  return h('div', { class: 'pregunta-meta' },
    numero ? h('span', { class: 'pregunta-numero' }, total ? `Pregunta ${numero} de ${total}` : `Pregunta ${numero}`) : null,
    h('span', { class: 'chip', style: { background: `color-mix(in srgb, ${pregunta.materia.color} 16%, transparent)`, color: 'var(--texto)' } },
      icono(pregunta.materia.icono || 'book-open', 'icono-sm'), pregunta.materia.nombre),
    h('span', { class: 'texto-3 texto-sm' }, pregunta.subtema.nombre),
    indicadorDificultad(pregunta.dificultad),
    pregunta.origen === 'vanty' ? h('span', { class: 'chip chip-lima' }, icono('sparkles', 'icono-sm'), 'Creada por Vanty') : null);
}

function contexto(pregunta) {
  if (!pregunta.contexto) return null;
  const c = pregunta.contexto;
  return h('section', { class: 'pregunta-contexto', 'aria-label': 'Contexto' },
    c.titulo ? h('h4', {}, c.titulo) : null,
    bloqueTexto(c.contenido),
    c.imagen ? h('img', { src: c.imagen.url, alt: c.imagen.alt, loading: 'lazy' }) : null,
    c.fuente ? h('p', { class: 'pregunta-fuente' }, c.fuente) : null);
}

/**
 * @returns {{ elemento: HTMLElement, seleccion: () => number|null, bloquear: () => void, mostrarSolucion: (sol) => void }}
 */
export function crearPregunta(pregunta, {
  modo = 'practica', seleccion = null, numero = null, total = null, onSeleccion = null, conContexto = true,
} = {}) {
  let elegida = seleccion;
  let bloqueada = modo === 'revision';

  const botones = pregunta.opciones.map((opcion) => {
    const boton = h('button', {
      type: 'button',
      class: 'opcion',
      role: 'radio',
      'aria-checked': String(opcion.id === elegida),
      tabindex: '-1',
      dataset: { id: opcion.id },
    },
    h('span', { class: 'opcion-letra', 'aria-hidden': 'true' }, opcion.letra),
    h('span', { class: 'opcion-texto' }, h('span', { class: 'solo-lector' }, `Opción ${opcion.letra}: `), opcion.texto));
    boton.addEventListener('click', () => elegir(opcion.id));
    return boton;
  });

  const grupo = h('div', { class: 'opciones', role: 'radiogroup', 'aria-label': 'Opciones de respuesta' }, botones);
  const zonaSolucion = h('div', { class: 'pregunta-solucion', 'aria-live': 'polite' });

  function actualizarFoco() {
    const indice = Math.max(0, pregunta.opciones.findIndex((o) => o.id === elegida));
    botones.forEach((b, i) => b.setAttribute('tabindex', i === indice ? '0' : '-1'));
  }

  function elegir(id) {
    if (bloqueada) return;
    elegida = id;
    botones.forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.id) === id)));
    actualizarFoco();
    onSeleccion?.(id);
  }

  // Navegación con teclado: flechas para moverse, A–D o 1–4 para elegir.
  grupo.addEventListener('keydown', (e) => {
    if (bloqueada) return;
    const actual = botones.indexOf(document.activeElement);
    const mover = (delta) => {
      e.preventDefault();
      const siguiente = botones[(actual + delta + botones.length) % botones.length];
      siguiente.focus();
      elegir(Number(siguiente.dataset.id));
    };
    if (['ArrowDown', 'ArrowRight'].includes(e.key)) mover(1);
    else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) mover(-1);
    const tecla = e.key.toUpperCase();
    const indice = 'ABCD'.indexOf(tecla) >= 0 ? 'ABCD'.indexOf(tecla) : '1234'.indexOf(e.key);
    if (indice >= 0 && botones[indice]) {
      e.preventDefault();
      botones[indice].focus();
      elegir(Number(botones[indice].dataset.id));
    }
  });
  actualizarFoco();

  const elemento = h('article', { class: `pregunta pregunta-${modo}` },
    metadatos(pregunta, { numero, total }),
    conContexto ? contexto(pregunta) : null,
    h('div', { class: 'pregunta-enunciado' }, bloqueTexto(pregunta.enunciado)),
    pregunta.imagen ? h('figure', { class: 'pregunta-imagen' }, h('img', { src: pregunta.imagen.url, alt: pregunta.imagen.alt, loading: 'lazy' })) : null,
    grupo,
    zonaSolucion);

  /** Marca correcta/incorrecta y muestra la explicación y la retroalimentación. */
  function mostrarSolucion({ opciones, explicacion, opcion_elegida_id: elegidaServidor }) {
    bloqueada = true;
    const elegidaFinal = elegidaServidor !== undefined ? elegidaServidor : elegida;
    const correcta = opciones.find((o) => o.es_correcta);
    botones.forEach((boton) => {
      const id = Number(boton.dataset.id);
      const datos = opciones.find((o) => o.id === id);
      boton.disabled = true;
      boton.classList.toggle('correcta', Boolean(datos?.es_correcta));
      boton.classList.toggle('incorrecta', id === elegidaFinal && !datos?.es_correcta);
      boton.classList.toggle('elegida', id === elegidaFinal);
      if (datos?.retroalimentacion && (datos.es_correcta || id === elegidaFinal)) {
        boton.querySelector('.opcion-texto').append(h('span', { class: 'opcion-retro' }, datos.retroalimentacion));
      }
    });
    const acerto = elegidaFinal != null && elegidaFinal === correcta?.id;
    zonaSolucion.replaceChildren(
      h('div', { class: `resultado-respuesta ${elegidaFinal == null ? 'omitida' : acerto ? 'acierto' : 'error'}` },
        icono(elegidaFinal == null ? 'circle-help' : acerto ? 'circle-check' : 'circle-x'),
        h('strong', {}, elegidaFinal == null ? `Sin responder · la correcta era la ${correcta?.letra}` : acerto ? '¡Correcto!' : `Incorrecto · la respuesta era la ${correcta?.letra}`)),
      h('div', { class: 'explicacion' }, h('h4', {}, icono('lightbulb'), 'Explicación'), bloqueTexto(explicacion ?? '')));
  }

  if (modo === 'revision' && pregunta.opciones.some((o) => o.es_correcta !== undefined)) {
    mostrarSolucion({ opciones: pregunta.opciones, explicacion: pregunta.explicacion, opcion_elegida_id: seleccion });
  }

  return {
    elemento,
    /** Elige la opción por posición (0–3); útil para atajos de teclado de la página. */
    elegirIndice: (i) => { if (pregunta.opciones[i]) elegir(pregunta.opciones[i].id); },
    seleccion: () => elegida,
    bloquear: () => { bloqueada = true; botones.forEach((b) => { b.disabled = true; }); },
    mostrarSolucion,
    enfocar: () => (botones.find((b) => b.getAttribute('tabindex') === '0') ?? botones[0]).focus(),
  };
}
