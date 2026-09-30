/**
 * Lección: bloques de contenido (texto, conceptos, fórmulas, ejemplos, tips) y ejercicios
 * de comprobación. Al terminar se registra la lección y se entregan las recompensas.
 */
import { api } from '../core/api.js';
import { $, h, icono, montar, parametro } from '../core/dom.js';
import { bloqueTexto } from '../core/texto-rico.js';
import { iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { cargando, confirmar, conCarga, errorCarga, toastError, vacio } from '../core/ui.js';

const id = Number.parseInt(parametro('id'), 10);
const inicio = Date.now();
const ejercicios = { total: 0, respondidos: 0, aciertos: 0 };

function actualizarProgreso() {
  const barra = $('#progreso-ejercicios');
  if (!barra) return;
  const porcentaje = ejercicios.total ? Math.round((100 * ejercicios.respondidos) / ejercicios.total) : 100;
  barra.style.setProperty('--valor', `${porcentaje}%`);
  $('#texto-ejercicios').textContent = `${ejercicios.respondidos} de ${ejercicios.total} ejercicios`;
}

function bloqueEjercicio(bloque) {
  ejercicios.total += 1;
  let respondido = false;
  const retro = h('div', { class: 'retro', 'aria-live': 'polite' });
  const botones = bloque.opciones.map((texto, indice) => {
    const boton = h('button', { type: 'button', class: 'opcion' },
      h('span', { class: 'opcion-letra' }, 'ABCD'[indice]), h('span', { class: 'opcion-texto' }, texto));
    boton.addEventListener('click', () => {
      if (respondido) return;
      respondido = true;
      const acierto = indice === bloque.correcta;
      ejercicios.respondidos += 1;
      if (acierto) ejercicios.aciertos += 1;
      botones.forEach((b, i) => {
        b.disabled = true;
        if (i === bloque.correcta) b.classList.add('correcta');
        if (i === indice && !acierto) b.classList.add('incorrecta');
      });
      montar(retro,
        h('div', { class: `resultado-respuesta ${acierto ? 'acierto' : 'error'}` },
          icono(acierto ? 'circle-check' : 'circle-x'), h('strong', {}, acierto ? '¡Bien hecho!' : `La respuesta correcta es la ${'ABCD'[bloque.correcta]}`)),
        bloque.explicacion ? h('div', { class: 'explicacion' }, bloqueTexto(bloque.explicacion)) : null);
      actualizarProgreso();
    });
    return boton;
  });
  return h('section', { class: 'bloque bloque-ejercicio' },
    h('h3', {}, icono('puzzle'), 'Comprueba lo aprendido'),
    bloqueTexto(bloque.enunciado),
    h('div', { class: 'opciones-ejercicio' }, botones),
    retro);
}

function renderizarBloque(bloque) {
  switch (bloque.tipo) {
    case 'texto':
      return bloqueTexto(bloque.contenido);
    case 'concepto':
      return h('section', { class: 'bloque bloque-concepto' }, h('h3', {}, icono('lightbulb'), bloque.titulo || 'Idea clave'), bloqueTexto(bloque.contenido));
    case 'formula':
      return h('section', { class: 'bloque bloque-formula' },
        h('div', { class: 'formula', role: 'math' }, bloque.contenido),
        bloque.nota ? h('p', { class: 'nota' }, bloque.nota) : null);
    case 'ejemplo':
      return h('section', { class: 'bloque bloque-ejemplo' },
        h('h3', {}, icono('pencil'), bloque.titulo || 'Ejemplo resuelto'),
        bloque.enunciado ? bloqueTexto(bloque.enunciado) : null,
        bloque.pasos?.length ? h('ol', { class: 'pasos' }, bloque.pasos.map((p) => h('li', {}, h('div', { class: 'texto-rico crecer' }, bloqueTexto(p))))) : null,
        bloque.respuesta ? h('span', { class: 'respuesta' }, icono('circle-check', 'icono-sm'), bloque.respuesta) : null);
    case 'lista':
      return h('section', { class: 'bloque bloque-lista' },
        bloque.titulo ? h('h3', {}, icono('list-checks'), bloque.titulo) : null,
        h('ul', { class: 'texto-rico' }, bloque.items.map((item) => h('li', {}, bloqueTexto(item)))));
    case 'tip':
      // El título ya dice "Tip ICFES": se omite si el contenido empieza igual.
      return h('section', { class: 'bloque bloque-tip' }, h('h3', {}, icono('sparkles'), 'Tip ICFES'),
        bloqueTexto(bloque.contenido.replace(/^\s*(\*\*)?tip icfes:?(\*\*)?:?\s*/i, '')));
    case 'ejercicio':
      return bloqueEjercicio(bloque);
    default:
      return null;
  }
}

function panelFinal(leccion, resultado) {
  return h('article', { class: 'tarjeta fin-leccion animar-entrada' },
    h('img', { src: '/img/vanty.svg', alt: '' }),
    h('h2', {}, resultado.primera_vez ? '¡Lección completada!' : '¡Repaso completado!'),
    h('p', { class: 'texto-2' }, `Acertaste ${ejercicios.aciertos} de ${ejercicios.total} ejercicios. Ahora pon a prueba lo aprendido con preguntas tipo ICFES.`),
    h('div', { class: 'fila' },
      h('a', { class: 'btn btn-primario', href: `/practica?subtema=${leccion.subtema.slug}` }, icono('target'), `Practicar ${leccion.subtema.nombre}`),
      leccion.siguiente ? h('a', { class: 'btn btn-secundario', href: `/leccion?id=${leccion.siguiente.id}` }, 'Siguiente lección', icono('arrow-right')) : null,
      h('a', { class: 'btn btn-fantasma', href: `/materia?slug=${leccion.materia.slug}` }, `Volver a ${leccion.materia.nombre}`)));
}

async function completar(leccion, boton) {
  if (ejercicios.respondidos < ejercicios.total) {
    const seguir = await confirmar({
      titulo: 'Tienes ejercicios pendientes',
      mensaje: 'Resolverlos te ayuda a fijar lo aprendido. ¿Quieres completar la lección de todos modos?',
      aceptar: 'Completar',
      cancelar: 'Seguir estudiando',
    });
    if (!seguir) return;
  }
  try {
    const resultado = await conCarga(boton, () => api.post(`/api/lecciones/${leccion.id}/completar`, {
      tiempo_seg: Math.round((Date.now() - inicio) / 1000),
      aciertos: ejercicios.aciertos,
      total: ejercicios.total,
    }));
    procesarRecompensas(resultado);
    const zona = $('#zona-final');
    montar(zona, panelFinal(leccion, resultado));
    zona.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#panel-completar')?.remove();
  } catch (error) {
    toastError(error.message);
  }
}

async function cargarLeccion() {
  const contenedor = $('#leccion');
  montar(contenedor, cargando('Preparando tu lección…'));
  try {
    const leccion = await api.get(`/api/lecciones/${id}`);
    document.title = `${leccion.titulo} · ICFES Lab`;
    const miga = $('#miga');
    miga.href = `/materia?slug=${leccion.materia.slug}#${leccion.subtema.slug}`;
    miga.lastChild.textContent = ` ${leccion.materia.nombre} · ${leccion.subtema.nombre}`;

    const bloques = leccion.bloques.map(renderizarBloque).filter(Boolean);
    const botonCompletar = h('button', { class: 'btn btn-lima btn-lg btn-bloque' }, icono('circle-check'), leccion.completada ? 'Marcar repaso' : 'Completar lección');
    botonCompletar.addEventListener('click', () => completar(leccion, botonCompletar));

    montar(contenedor,
      h('div', { class: 'diseno-leccion' },
        h('div', { class: 'contenido-leccion' },
          h('header', { class: 'cabecera-leccion' },
            h('div', { class: 'fila envolver', style: { marginBottom: '10px' } },
              h('span', { class: 'chip', style: { background: `color-mix(in srgb, ${leccion.materia.color} 18%, transparent)`, color: 'var(--texto)' } }, icono(leccion.materia.icono, 'icono-sm'), leccion.materia.nombre),
              h('span', { class: 'chip' }, icono('clock', 'icono-sm'), `${leccion.duracion_min} min`),
              leccion.completada ? h('span', { class: 'chip chip-exito' }, icono('circle-check', 'icono-sm'), 'Completada') : null),
            h('h1', {}, leccion.titulo),
            h('p', {}, leccion.resumen)),
          bloques,
          h('div', { id: 'zona-final' })),
        h('aside', { class: 'panel-leccion', id: 'panel-completar' },
          h('div', { class: 'tarjeta' },
            h('h3', { class: 'tarjeta-titulo' }, icono('gift'), 'Recompensa'),
            h('div', { class: 'recompensas-leccion' },
              h('span', { class: 'chip chip-xp' }, icono('zap', 'icono-sm'), leccion.completada ? '+5 XP (repaso)' : `+${leccion.recompensa.xp} XP`),
              leccion.completada ? null : h('span', { class: 'chip chip-monedas' }, icono('coins', 'icono-sm'), `+${leccion.recompensa.monedas}`)),
            h('div', { class: 'progreso-lectura mt-4' },
              h('div', { class: 'fila-entre' }, h('span', { id: 'texto-ejercicios' }), h('span', { class: 'texto-3' }, 'Ejercicios')),
              h('div', { class: 'barra', id: 'progreso-ejercicios', style: { '--color': 'var(--lima-600)' } })),
            h('div', { class: 'mt-4' }, botonCompletar)),
          h('div', { class: 'tarjeta tarjeta-solo-escritorio' },
            h('h3', { class: 'tarjeta-titulo' }, icono('bot'), '¿Te quedó una duda?'),
            h('p', { class: 'texto-sm texto-2' }, 'Pregúntale a Vanty sobre este tema: te lo explica con otros ejemplos.'),
            h('a', { class: 'btn btn-secundario btn-sm btn-bloque', href: `/vanty?tema=${encodeURIComponent(leccion.subtema.nombre)}` }, 'Hablar con Vanty')))));
    actualizarProgreso();
  } catch (error) {
    if (error.codigo === 'BLOQUEADO') {
      montar(contenedor, vacio('lock', 'Lección bloqueada', error.message, h('a', { class: 'btn btn-primario', href: '/materias' }, 'Volver a Materias')));
    } else {
      montar(contenedor, errorCarga(error, cargarLeccion));
    }
  }
}

await iniciarPagina({ activa: 'materias' });
if (!Number.isInteger(id)) window.location.replace('/materias');
else cargarLeccion();
