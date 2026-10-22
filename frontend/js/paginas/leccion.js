/**
 * Lección: la explicación completa del tema (texto, subtítulos, tablas, imágenes, fórmulas,
 * ejemplos y recuadros) seguida de las preguntas del banco de ese tema. Al terminar se registra
 * la lección y se entregan las recompensas.
 */
import { api } from '../core/api.js';
import { $, h, icono, montar, parametro } from '../core/dom.js';
import { bloqueTexto, textoRico } from '../core/texto-rico.js';
import { crearPregunta } from '../core/pregunta.js';
import { iniciarPagina, procesarRecompensas } from '../core/layout.js';
import { cargando, confirmar, conCarga, errorCarga, toastError, vacio } from '../core/ui.js';

const id = Number.parseInt(parametro('id'), 10);
const inicio = Date.now();
// Ejercicios de comprobación incluidos en la lección (opcionales) y preguntas del banco del tema.
const ejercicios = { total: 0, respondidos: 0, aciertos: 0 };
const banco = { total: 0, respondidas: 0, aciertos: 0, enEstaVisita: 0 };

function actualizarProgreso() {
  const barra = $('#progreso-ejercicios');
  if (!barra) return;
  const total = banco.total + ejercicios.total;
  const hechas = banco.respondidas + ejercicios.respondidos;
  const porcentaje = total ? Math.round((100 * hechas) / total) : 100;
  barra.style.setProperty('--valor', `${porcentaje}%`);
  $('#texto-ejercicios').textContent = total ? `${hechas} de ${total} preguntas` : 'Sin preguntas';
}

// ---------------------------------------------------------------------------
// Bloques de contenido
// ---------------------------------------------------------------------------

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
      montar(retro, ...[
        h('div', { class: `resultado-respuesta ${acierto ? 'acierto' : 'error'}` },
          icono(acierto ? 'circle-check' : 'circle-x'), h('strong', {}, acierto ? '¡Bien hecho!' : `La respuesta correcta es la ${'ABCD'[bloque.correcta]}`)),
        bloque.explicacion ? h('div', { class: 'explicacion' }, bloqueTexto(bloque.explicacion)) : null,
      ].filter(Boolean));
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

function bloqueTabla(bloque) {
  const celda = (etiqueta, texto) => h(etiqueta, { class: 'texto-rico' }, textoRico(texto ?? ''));
  return h('div', { class: 'tabla-leccion' },
    h('table', {},
      bloque.encabezado ? h('thead', {}, h('tr', {}, bloque.encabezado.map((c) => celda('th', c)))) : null,
      h('tbody', {}, bloque.filas.map((fila) => h('tr', {}, fila.map((c) => celda('td', c)))))));
}

function bloqueRecuadro(bloque, clase, nombreIcono, tituloPorDefecto) {
  return h('section', { class: `bloque ${clase}` },
    h('h3', {}, icono(nombreIcono), bloque.titulo || tituloPorDefecto),
    bloqueTexto(bloque.contenido ?? ''));
}

function renderizarBloque(bloque) {
  switch (bloque.tipo) {
    case 'texto':
      return bloqueTexto(bloque.contenido);
    case 'subtitulo':
      return h(bloque.nivel >= 3 ? 'h3' : 'h2', { class: `subtitulo-leccion nivel-${bloque.nivel >= 3 ? 3 : 2}` }, bloque.texto);
    case 'concepto':
      return bloqueRecuadro(bloque, 'bloque-concepto', 'lightbulb', 'Idea clave');
    case 'tip':
      // Si el contenido empieza con "Tip ICFES:", el título ya lo dice.
      return bloqueRecuadro({ ...bloque, contenido: (bloque.contenido ?? '').replace(/^\s*(\*\*)?tip icfes:?(\*\*)?:?\s*/i, '') }, 'bloque-tip', 'sparkles', 'Tip ICFES');
    case 'alerta':
      return bloqueRecuadro(bloque, 'bloque-alerta', 'triangle-alert', 'Cuidado');
    case 'formula':
      return h('section', { class: 'bloque bloque-formula' },
        h('div', { class: 'formula', role: 'math' }, bloque.contenido),
        bloque.nota ? h('p', { class: 'nota' }, bloque.nota) : null);
    case 'ejemplo':
      return h('section', { class: 'bloque bloque-ejemplo' },
        h('h3', {}, icono('pencil'), bloque.titulo ? `Ejemplo: ${bloque.titulo}` : 'Ejemplo resuelto'),
        bloque.enunciado ? bloqueTexto(bloque.enunciado) : null,
        bloque.contenido ? bloqueTexto(bloque.contenido) : null,
        bloque.pasos?.length ? h('ol', { class: 'pasos' }, bloque.pasos.map((p) => h('li', {}, h('div', { class: 'texto-rico crecer' }, bloqueTexto(p))))) : null,
        bloque.respuesta ? h('span', { class: 'respuesta' }, icono('circle-check', 'icono-sm'), bloque.respuesta) : null);
    case 'lista':
      return h('section', { class: 'bloque bloque-lista' },
        bloque.titulo ? h('h3', {}, icono('list-checks'), bloque.titulo) : null,
        h(bloque.ordenada ? 'ol' : 'ul', { class: 'texto-rico' }, bloque.items.map((item) => h('li', {}, bloqueTexto(item)))));
    case 'tabla':
      return bloqueTabla(bloque);
    case 'imagen':
      return h('figure', { class: 'figura-leccion' },
        h('img', { src: bloque.src, alt: bloque.alt || '', loading: 'lazy' }),
        bloque.pie ? h('figcaption', {}, bloque.pie) : null);
    case 'ejercicio':
      return bloqueEjercicio(bloque);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Preguntas del banco del tema (después de la explicación)
// ---------------------------------------------------------------------------

function tarjetaPregunta(pregunta, numero, total) {
  const botonResponder = h('button', { class: 'btn btn-primario', disabled: true }, 'Responder');
  const acciones = h('div', { class: 'acciones-pregunta' }, botonResponder);
  const componente = crearPregunta(pregunta, { modo: 'practica', numero, total, onSeleccion: () => { botonResponder.disabled = false; } });
  const inicioPregunta = Date.now();
  let respondida = Boolean(pregunta.ultima);

  botonResponder.addEventListener('click', async () => {
    const opcionId = componente.seleccion();
    if (!opcionId) return;
    try {
      const resultado = await conCarga(botonResponder, () => api.post('/api/practica/responder', {
        pregunta_id: pregunta.id,
        opcion_id: opcionId,
        tiempo_ms: Date.now() - inicioPregunta,
        origen: 'leccion',
      }));
      componente.mostrarSolucion(resultado);
      banco.enEstaVisita += 1;
      if (!respondida) banco.respondidas += 1;
      respondida = true;
      if (resultado.correcta) banco.aciertos += 1;
      actualizarProgreso();
      procesarRecompensas(resultado);
      // montar() no filtra hijos nulos: solo se pasa el enlace cuando hace falta.
      montar(acciones, ...(resultado.correcta
        ? []
        : [h('a', { class: 'btn btn-secundario', href: `/vanty?pregunta=${pregunta.id}&opcion=${opcionId}` }, icono('bot'), 'Pregúntale a Vanty')]));
    } catch (error) {
      toastError(error.message);
    }
  });

  return h('div', { class: 'tarjeta tarjeta-pregunta-tema' },
    pregunta.ultima
      ? h('div', { class: `chip ${pregunta.ultima.correcta ? 'chip-exito' : 'chip-durazno'}`, style: { marginBottom: 'var(--esp-3)' } },
        icono(pregunta.ultima.correcta ? 'circle-check' : 'history', 'icono-sm'), pregunta.ultima.correcta ? 'Ya la acertaste' : 'Ya la intentaste: vuelve a probar')
      : null,
    componente.elemento,
    acciones);
}

async function cargarPreguntasTema(leccion, contenedor) {
  montar(contenedor, cargando('Cargando las preguntas del tema…'));
  try {
    const datos = await api.get(`/api/practica/subtema/${encodeURIComponent(leccion.subtema.slug)}`);
    banco.total = datos.preguntas.length;
    banco.respondidas = datos.preguntas.filter((p) => p.ultima).length;
    actualizarProgreso();
    if (!datos.preguntas.length) {
      montar(contenedor, h('section', { class: 'preguntas-tema' },
        h('h2', { class: 'subtitulo-leccion nivel-2' }, icono('target'), 'Preguntas de este tema'),
        vacio('clipboard-list', 'Este tema aún no tiene preguntas', 'Cuando se agreguen al banco aparecerán aquí.')));
      return;
    }
    montar(contenedor, h('section', { class: 'preguntas-tema', id: 'preguntas-tema' },
      h('div', { class: 'cabecera-preguntas-tema' },
        h('h2', { class: 'subtitulo-leccion nivel-2' }, icono('target'), `Preguntas de este tema (${datos.preguntas.length})`),
        h('p', { class: 'texto-2' }, 'Responde las preguntas tipo ICFES de este tema. Cada respuesta suma a tu progreso y a tu dominio del tema.')),
      datos.preguntas.map((p, i) => tarjetaPregunta(p, i + 1, datos.preguntas.length))));
  } catch (error) {
    montar(contenedor, errorCarga(error, () => cargarPreguntasTema(leccion, contenedor)));
  }
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

function panelFinal(leccion, resultado) {
  const total = banco.total + ejercicios.total;
  const aciertos = banco.aciertos + ejercicios.aciertos;
  return h('article', { class: 'tarjeta fin-leccion animar-entrada' },
    h('img', { src: '/img/vanty.svg', alt: '' }),
    h('h2', {}, resultado.primera_vez ? '¡Lección completada!' : '¡Repaso completado!'),
    h('p', { class: 'texto-2' }, total
      ? `Acertaste ${aciertos} de las ${banco.enEstaVisita + ejercicios.respondidos} preguntas que respondiste hoy. Sigue practicando para afianzar el tema.`
      : 'Ahora pon a prueba lo aprendido con preguntas tipo ICFES.'),
    h('div', { class: 'fila' },
      h('a', { class: 'btn btn-primario', href: `/practica?subtema=${leccion.subtema.slug}` }, icono('target'), `Practicar ${leccion.subtema.nombre}`),
      leccion.siguiente ? h('a', { class: 'btn btn-secundario', href: `/leccion?id=${leccion.siguiente.id}` }, 'Siguiente lección', icono('arrow-right')) : null,
      h('a', { class: 'btn btn-fantasma', href: `/materia?slug=${leccion.materia.slug}` }, `Volver a ${leccion.materia.nombre}`)));
}

async function completar(leccion, boton) {
  const pendientes = (ejercicios.total - ejercicios.respondidos) + (banco.total - banco.respondidas);
  if (pendientes > 0) {
    const seguir = await confirmar({
      titulo: 'Tienes preguntas pendientes',
      mensaje: `Te faltan ${pendientes} ${pendientes === 1 ? 'pregunta' : 'preguntas'} de este tema. Resolverlas te ayuda a fijar lo aprendido. ¿Quieres completar la lección de todos modos?`,
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
    // El resumen se toma de las primeras frases de la explicación: si coincide con el primer párrafo,
    // no se repite en la cabecera.
    const normalizar = (texto) => String(texto ?? '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    const primerParrafo = normalizar(leccion.bloques.find((b) => b.tipo === 'texto')?.contenido);
    const resumen = normalizar(leccion.resumen).replace(/…$/, '');
    const resumenRepetido = resumen.length > 20 && primerParrafo.startsWith(resumen.slice(0, 60));
    const zonaPreguntas = h('div', { id: 'zona-preguntas' });
    const botonCompletar = h('button', { class: 'btn btn-lima btn-lg btn-bloque' }, icono('circle-check'), leccion.completada ? 'Marcar repaso' : 'Completar lección');
    botonCompletar.addEventListener('click', () => completar(leccion, botonCompletar));

    montar(contenedor,
      h('div', { class: 'diseno-leccion' },
        h('div', { class: 'contenido-leccion' },
          h('header', { class: 'cabecera-leccion' },
            h('div', { class: 'fila envolver', style: { marginBottom: '10px' } },
              h('span', { class: 'chip', style: { background: `color-mix(in srgb, ${leccion.materia.color} 18%, transparent)`, color: 'var(--texto)' } }, icono(leccion.materia.icono, 'icono-sm'), leccion.materia.nombre),
              h('span', { class: 'chip' }, icono('clock', 'icono-sm'), `${leccion.duracion_min} min de lectura`),
              leccion.subtema.preguntas ? h('a', { class: 'chip', href: '#preguntas-tema' }, icono('target', 'icono-sm'), `${leccion.subtema.preguntas} preguntas`) : null,
              leccion.completada ? h('span', { class: 'chip chip-exito' }, icono('circle-check', 'icono-sm'), 'Completada') : null),
            h('h1', {}, leccion.titulo),
            resumenRepetido ? null : h('p', {}, leccion.resumen)),
          bloques,
          zonaPreguntas,
          h('div', { id: 'zona-final' })),
        h('aside', { class: 'panel-leccion', id: 'panel-completar' },
          h('div', { class: 'tarjeta' },
            h('h3', { class: 'tarjeta-titulo' }, icono('gift'), 'Recompensa'),
            h('div', { class: 'recompensas-leccion' },
              h('span', { class: 'chip chip-xp' }, icono('zap', 'icono-sm'), leccion.completada ? '+5 XP (repaso)' : `+${leccion.recompensa.xp} XP`),
              leccion.completada ? null : h('span', { class: 'chip chip-monedas' }, icono('coins', 'icono-sm'), `+${leccion.recompensa.monedas}`)),
            h('div', { class: 'progreso-lectura mt-4' },
              h('div', { class: 'fila-entre' }, h('span', { id: 'texto-ejercicios' }), h('span', { class: 'texto-3' }, 'Preguntas del tema')),
              h('div', { class: 'barra', id: 'progreso-ejercicios', style: { '--color': 'var(--lima-600)' } })),
            h('div', { class: 'mt-4' }, botonCompletar)),
          h('div', { class: 'tarjeta tarjeta-solo-escritorio' },
            h('h3', { class: 'tarjeta-titulo' }, icono('bot'), '¿Te quedó una duda?'),
            h('p', { class: 'texto-sm texto-2' }, 'Pregúntale a Vanty sobre este tema: te lo explica con otros ejemplos.'),
            h('a', { class: 'btn btn-secundario btn-sm btn-bloque', href: `/vanty?tema=${encodeURIComponent(leccion.subtema.nombre)}` }, 'Hablar con Vanty')))));
    actualizarProgreso();
    cargarPreguntasTema(leccion, zonaPreguntas);
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
