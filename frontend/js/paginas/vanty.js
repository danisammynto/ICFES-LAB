/**
 * Chat con Vanty, la IA tutora.
 * · Las respuestas llegan en streaming (Server-Sent Events).
 * · Las preguntas generadas aparecen como tarjetas interactivas dentro del chat.
 * · ?pregunta=ID&opcion=ID abre una conversación para explicar una pregunta fallada.
 */
import { api, flujo } from '../core/api.js';
import { $, formatoNumero, h, icono, montar, parametro, tiempoRelativo } from '../core/dom.js';
import { bloqueTexto } from '../core/texto-rico.js';
import { crearAvatar } from '../core/avatar.js';
import { crearPregunta } from '../core/pregunta.js';
import { iniciarPagina, procesarRecompensas, usuario } from '../core/layout.js';
import { cargando, confirmar, toastError, vacio } from '../core/ui.js';

const SUGERENCIAS = [
  ['lightbulb', '¿Qué debo estudiar hoy?'],
  ['target', 'Genera una pregunta de mi tema más débil'],
  ['circle-help', 'Explícame mi último error'],
  ['chart-line', '¿Cómo voy?'],
  ['flag', 'Dame estrategias para el ICFES'],
  ['heart', 'Motívame'],
];

const lista = $('#mensajes');
const entrada = $('#mensaje-nuevo');
let conversacionActual = null;
let enviando = false;
let usados = 0;
let limite = 80;

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

function avatarVanty() {
  return h('span', { class: 'avatar-mensaje' }, h('img', { src: '/img/vanty.svg', alt: 'Vanty' }));
}

function avatarUsuario() {
  return h('span', { class: 'avatar-mensaje' }, crearAvatar(usuario()?.avatar, { tamano: 36, titulo: 'Tú' }));
}

function burbujaUsuario(texto, fecha = null) {
  return h('div', { class: 'mensaje usuario' }, avatarUsuario(),
    h('div', {}, h('div', { class: 'burbuja' }, texto), fecha ? h('div', { class: 'meta-mensaje' }, tiempoRelativo(fecha)) : null));
}

/** Burbuja de Vanty; devuelve el elemento y una función para actualizar su texto. */
function burbujaVanty({ texto = '', fecha = null, proveedor = null } = {}) {
  const cuerpo = h('div', { class: 'texto-rico' });
  const burbuja = h('div', { class: 'burbuja' }, cuerpo);
  const meta = h('div', { class: 'meta-mensaje' });
  const elemento = h('div', { class: 'mensaje vanty' }, avatarVanty(), h('div', { class: 'crecer', style: { minWidth: 0 } }, burbuja, meta));
  const pintar = (t) => {
    if (t) montar(cuerpo, bloqueTexto(t));
    else montar(cuerpo, h('span', { class: 'escribiendo', 'aria-label': 'Vanty está escribiendo' }, h('span'), h('span'), h('span')));
  };
  const pie = (f, p) => { meta.textContent = [f ? tiempoRelativo(f) : '', p === 'claude' ? 'IA' : p === 'local' ? 'modo local' : ''].filter(Boolean).join(' · '); };
  pintar(texto);
  pie(fecha, proveedor);
  return { elemento, burbuja, pintar, pie };
}

/** Tarjeta de pregunta interactiva dentro de un mensaje de Vanty. */
function tarjetaPregunta(pregunta, respuestaPrevia = null) {
  const contenedor = h('div', { class: 'tarjeta-pregunta-chat' });
  const acciones = h('div', { class: 'acciones-tarjeta' });
  const yaRespondida = Boolean(respuestaPrevia);
  const componente = crearPregunta(pregunta, {
    modo: yaRespondida ? 'revision' : 'practica',
    seleccion: respuestaPrevia?.opcion_id ?? null,
    onSeleccion: () => { botonResponder.disabled = false; },
  });
  const inicio = Date.now();
  const botonResponder = h('button', { class: 'btn btn-primario btn-sm', disabled: true }, 'Responder');

  const accionesTrasResponder = (opcionId, correcta) => montar(acciones,
    h('button', {
      class: 'btn btn-secundario btn-sm',
      onclick: () => enviar(correcta ? '¿Puedes explicarme más a fondo esta pregunta?' : '¿Por qué mi respuesta es incorrecta?', { pregunta_id: pregunta.id, opcion_id: opcionId }),
    }, icono('circle-help', 'icono-sm'), correcta ? 'Explícame más' : '¿Por qué fallé?'),
    h('button', { class: 'btn btn-primario btn-sm', onclick: () => enviar('Genera otra pregunta similar') }, icono('rotate-ccw', 'icono-sm'), 'Otra similar'));

  botonResponder.addEventListener('click', async () => {
    const opcionId = componente.seleccion();
    if (!opcionId) return;
    botonResponder.disabled = true;
    try {
      const resultado = await api.post('/api/practica/responder', { pregunta_id: pregunta.id, opcion_id: opcionId, tiempo_ms: Date.now() - inicio, origen: 'vanty' });
      componente.mostrarSolucion(resultado);
      procesarRecompensas(resultado);
      accionesTrasResponder(opcionId, resultado.correcta);
    } catch (error) {
      botonResponder.disabled = false;
      toastError(error.message);
    }
  });

  if (yaRespondida) accionesTrasResponder(respuestaPrevia.opcion_id, respuestaPrevia.es_correcta);
  else acciones.append(botonResponder);
  contenedor.append(componente.elemento, acciones);
  return contenedor;
}

function desplazarAlFinal() {
  lista.scrollTop = lista.scrollHeight;
}

function bienvenida() {
  montar(lista, h('div', { class: 'bienvenida-vanty' },
    h('img', { src: '/img/vanty.svg', alt: '' }),
    h('h2', {}, `¡Hola, ${usuario()?.nombre_mostrar ?? ''}! Soy Vanty`),
    h('p', { class: 'texto-2' }, 'Tu tutora para el ICFES. Resuelvo dudas, te explico tus errores, te recomiendo qué estudiar y te genero preguntas a tu medida.'),
    h('div', { class: 'sugerencias' }, SUGERENCIAS.map(([ico, texto]) => h('button', { type: 'button', onclick: () => enviar(texto) }, icono(ico, 'icono-sm'), ` ${texto}`)))));
}

// ---------------------------------------------------------------------------
// Conversaciones
// ---------------------------------------------------------------------------

async function cargarConversaciones() {
  const { conversaciones } = await api.get('/api/vanty/conversaciones');
  const contenedor = $('#lista-conversaciones');
  if (!conversaciones.length) {
    montar(contenedor, h('p', { class: 'texto-sm texto-3' }, 'Aún no tienes conversaciones.'));
    return conversaciones;
  }
  montar(contenedor, conversaciones.map((c) => {
    const borrar = h('button', { class: 'btn btn-fantasma btn-icono btn-sm eliminar', 'aria-label': `Eliminar "${c.titulo}"` }, icono('trash-2', 'icono-sm'));
    borrar.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmar({ titulo: '¿Eliminar la conversación?', mensaje: `"${c.titulo}" se borrará definitivamente.`, aceptar: 'Eliminar', peligro: true });
      if (!ok) return;
      await api.del(`/api/vanty/conversaciones/${c.id}`).catch((err) => toastError(err.message));
      if (conversacionActual === c.id) { conversacionActual = null; bienvenida(); }
      cargarConversaciones();
    });
    const boton = h('div', {
      class: `conversacion ${c.id === conversacionActual ? 'activa' : ''}`, role: 'button', tabindex: '0', title: c.ultimo_mensaje ?? '',
    }, icono('message-circle', 'icono-sm'), h('span', { class: 'titulo' }, c.titulo), borrar);
    const abrir = () => { abrirConversacion(c.id); cerrarPanelMovil(); };
    boton.addEventListener('click', abrir);
    boton.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    return boton;
  }));
  return conversaciones;
}

async function abrirConversacion(id) {
  conversacionActual = id;
  document.querySelectorAll('.conversacion').forEach((el) => el.classList.remove('activa'));
  montar(lista, cargando('Cargando conversación…'));
  try {
    const { mensajes } = await api.get(`/api/vanty/conversaciones/${id}`);
    montar(lista);
    if (!mensajes.length) bienvenida();
    for (const m of mensajes) {
      if (m.rol === 'usuario') {
        lista.append(burbujaUsuario(m.contenido, m.creado_en));
      } else {
        const b = burbujaVanty({ texto: m.contenido, fecha: m.creado_en, proveedor: m.proveedor });
        if (m.tipo === 'pregunta' && m.pregunta) b.burbuja.append(tarjetaPregunta(m.pregunta, m.respuesta));
        lista.append(b.elemento);
      }
    }
    desplazarAlFinal();
    cargarConversaciones();
  } catch (error) {
    toastError(error.message);
    bienvenida();
  }
}

async function asegurarConversacion() {
  if (conversacionActual) return conversacionActual;
  const nueva = await api.post('/api/vanty/conversaciones', {});
  conversacionActual = nueva.id;
  return nueva.id;
}

// ---------------------------------------------------------------------------
// Envío con streaming
// ---------------------------------------------------------------------------

function actualizarUso() {
  $('#uso-vanty').textContent = `${formatoNumero(usados)}/${formatoNumero(limite)} hoy`;
}

async function enviar(texto, adjunto = null) {
  const contenido = texto.trim();
  if (!contenido || enviando) return;
  enviando = true;
  $('#boton-enviar').disabled = true;
  entrada.value = '';
  ajustarAltura();

  try {
    const id = await asegurarConversacion();
    if (lista.querySelector('.bienvenida-vanty, .cargando')) montar(lista);
    lista.append(burbujaUsuario(contenido));
    const respuesta = burbujaVanty();
    lista.append(respuesta.elemento);
    desplazarAlFinal();

    let acumulado = '';
    let pendiente = false;
    const repintar = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => { pendiente = false; respuesta.pintar(acumulado); desplazarAlFinal(); });
    };

    await flujo(`/api/vanty/conversaciones/${id}/mensajes`, { contenido, adjunto }, (evento, datos) => {
      switch (evento) {
        case 'delta':
          acumulado += datos.texto;
          repintar();
          break;
        case 'reinicio':
          acumulado = '';
          repintar();
          break;
        case 'tarjeta':
          respuesta.burbuja.append(tarjetaPregunta(datos.pregunta));
          desplazarAlFinal();
          break;
        case 'fin':
          acumulado = datos.mensaje.contenido;
          respuesta.pintar(acumulado);
          respuesta.pie(datos.mensaje.creado_en, datos.mensaje.proveedor);
          procesarRecompensas({ eventos: datos.eventos });
          usados += 1;
          actualizarUso();
          desplazarAlFinal();
          break;
        case 'error':
          respuesta.pintar(`_${datos.mensaje}_`);
          break;
        default:
          break;
      }
    });
    cargarConversaciones();
  } catch (error) {
    toastError(error.message);
    lista.querySelector('.mensaje.vanty:last-child')?.remove();
  } finally {
    enviando = false;
    $('#boton-enviar').disabled = false;
    entrada.focus();
  }
}

// ---------------------------------------------------------------------------
// Panel de análisis
// ---------------------------------------------------------------------------

async function cargarAnalisis() {
  try {
    const { recomendaciones, resumen } = await api.get('/api/vanty/recomendaciones');
    montar($('#recomendaciones-vanty'), recomendaciones.map((r) => h('div', { class: 'recomendacion' },
      h('strong', {}, r.titulo), h('p', {}, r.texto),
      r.accion ? h('a', { class: 'btn btn-secundario btn-sm', href: r.accion.url }, r.accion.etiqueta) : null)));
    const grupo = (titulo, items, clase) => (items.length
      ? h('div', { class: 'mb-4' }, h('p', { class: 'texto-sm negrita mb-0', style: { marginBottom: '6px' } }, titulo),
        h('div', { class: 'chips' }, items.map((t) => h('span', { class: `chip ${clase}` }, `${t.nombre} · ${t.precision}%`))))
      : null);
    const conDatos = resumen.areas.filter((a) => a.respondidas > 0);
    montar($('#resumen-analisis'),
      grupo('Temas débiles', resumen.debilidades, 'chip-error'),
      grupo('Temas fuertes', resumen.fortalezas, 'chip-exito'),
      conDatos.length
        ? h('div', {}, h('p', { class: 'texto-sm negrita', style: { marginBottom: '6px' } }, 'Tiempo por pregunta'),
          conDatos.map((a) => h('div', { class: 'fila-entre texto-sm' }, h('span', { class: 'texto-2' }, a.nombre), h('span', {}, a.tiempo_seg ? `${a.tiempo_seg} s (ideal ${a.tiempo_esperado_seg} s)` : '—'))))
        : h('p', { class: 'texto-sm texto-3' }, 'Responde algunas preguntas para que Vanty pueda analizarte.'));
  } catch {
    montar($('#recomendaciones-vanty'), vacio('circle-alert', 'Sin recomendaciones', 'No pudimos cargar el análisis.'));
  }
}

// ---------------------------------------------------------------------------
// Interacción
// ---------------------------------------------------------------------------

function ajustarAltura() {
  entrada.style.height = 'auto';
  entrada.style.height = `${Math.min(entrada.scrollHeight, 180)}px`;
  $('#contador').textContent = `${entrada.value.length}/2000`;
}

function cerrarPanelMovil() {
  $('#panel-conversaciones').classList.remove('abierto');
  $('#boton-conversaciones').setAttribute('aria-expanded', 'false');
}

entrada.addEventListener('input', ajustarAltura);
entrada.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviar(entrada.value);
  }
});
$('#compositor').addEventListener('submit', (e) => { e.preventDefault(); enviar(entrada.value); });
$('#nueva-conversacion').addEventListener('click', () => {
  conversacionActual = null;
  bienvenida();
  cargarConversaciones();
  cerrarPanelMovil();
  entrada.focus();
});
$('#boton-conversaciones').addEventListener('click', () => {
  const panel = $('#panel-conversaciones');
  const abierto = panel.classList.toggle('abierto');
  $('#boton-conversaciones').setAttribute('aria-expanded', String(abierto));
});
montar($('#sugerencias'), SUGERENCIAS.slice(0, 4).map(([ico, texto]) => h('button', { type: 'button', onclick: () => enviar(texto) }, icono(ico, 'icono-sm'), ` ${texto}`)));

// ---------------------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------------------

await iniciarPagina({ activa: 'vanty' });
try {
  const estado = await api.get('/api/vanty/estado');
  usados = estado.usados_hoy;
  limite = estado.limite_diario;
  montar($('#modo-vanty'), icono(estado.modo === 'claude' ? 'sparkles' : 'bot', 'icono-sm'), estado.modo === 'claude' ? 'IA avanzada' : 'Modo local');
  $('#modo-vanty').classList.add(estado.modo === 'claude' ? 'chip-lima' : 'chip-cielo');
  $('#modo-vanty').title = estado.modo === 'claude'
    ? `Vanty responde con Claude (${estado.modelo}).`
    : 'Vanty responde con su base de conocimiento y tus datos. Configura ANTHROPIC_API_KEY para activar la IA.';
  actualizarUso();
} catch { /* el chat funciona aunque falle el estado */ }

cargarAnalisis();
const conversaciones = await cargarConversaciones().catch(() => []);
const preguntaId = Number.parseInt(parametro('pregunta'), 10);
const tema = parametro('tema');

if (Number.isInteger(preguntaId)) {
  const opcionId = Number.parseInt(parametro('opcion'), 10);
  window.history.replaceState(null, '', '/vanty');
  bienvenida();
  enviar('¿Por qué mi respuesta es incorrecta en esta pregunta? Explícamela paso a paso.', {
    pregunta_id: preguntaId,
    opcion_id: Number.isInteger(opcionId) ? opcionId : null,
  });
} else if (conversaciones.length && !tema) {
  abrirConversacion(conversaciones[0].id);
} else {
  bienvenida();
  if (tema) {
    entrada.value = `Explícame ${tema} con un ejemplo`;
    ajustarAltura();
    entrada.focus();
  }
}
