/**
 * Calendario del Saber 11 (A o B) del estudiante.
 *
 * - `preguntarCalendario()` muestra la pregunta «¿En qué calendario presentarás la prueba Saber 11
 *   del ICFES?». La primera vez que el estudiante inicia sesión es obligatoria; después se usa para
 *   cambiar la elección (desde la cuenta regresiva o desde Configuración).
 * - `pedirFechaExamen()` pide la información que falta cuando el ICFES no ha publicado una fecha
 *   única: la fecha de la citación, o cuál de las fechas oficiales le corresponde.
 *
 * Al guardar se emite el evento `icfes:calendario` (detail = nueva cuenta regresiva) para que la
 * página actualice el contador sin recargar. El progreso del estudiante no cambia.
 */
import { api } from './api.js';
import { formatoFecha, h, icono } from './dom.js';
import { modal, toastError } from './ui.js';

// Meses habituales de aplicación (se reemplazan por los de la configuración pública si cargan).
const MESES_POR_DEFECTO = { A: 'entre finales de julio y agosto', B: 'en marzo' };

let mesesCache = null;
async function mesesCalendarios() {
  if (mesesCache) return mesesCache;
  try {
    const config = await api.get('/api/config/publica', { redirigir401: false });
    mesesCache = {
      A: config.calendarios_icfes?.A?.meses || MESES_POR_DEFECTO.A,
      B: config.calendarios_icfes?.B?.meses || MESES_POR_DEFECTO.B,
    };
  } catch {
    mesesCache = { ...MESES_POR_DEFECTO };
  }
  return mesesCache;
}

/** Texto de cada opción: aunque el ICFES no haya publicado la fecha, se indica la época habitual. */
export const textoMeses = (meses) => `Normalmente se presenta ${meses} de cada año.`;

const fechaLarga = (fecha) => formatoFecha(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function avisar(respuesta) {
  window.dispatchEvent(new CustomEvent('icfes:calendario', { detail: respuesta }));
  return respuesta;
}

/**
 * Pregunta el calendario. Resuelve con la respuesta del servidor
 * ({ calendario_icfes, cuenta_regresiva, eventos, jugador }) o null si se cancela.
 */
export async function preguntarCalendario({ actual = null, obligatorio = false } = {}) {
  const meses = await mesesCalendarios();
  let elegido = actual;
  return modal((cerrar) => {
    const guardar = h('button', { class: 'btn btn-primario', type: 'button', disabled: !elegido }, 'Guardar');
    const opcion = (letra) => {
      const boton = h('button', {
        type: 'button',
        class: `opcion-calendario ${elegido === letra ? 'elegida' : ''}`,
        role: 'radio',
        'aria-checked': String(elegido === letra),
        onclick: () => {
          elegido = letra;
          boton.parentElement.querySelectorAll('.opcion-calendario').forEach((b) => {
            const activo = b === boton;
            b.classList.toggle('elegida', activo);
            b.setAttribute('aria-checked', String(activo));
          });
          guardar.disabled = false;
        },
      },
      h('span', { class: 'letra-calendario' }, letra),
      h('span', {}, h('strong', {}, `Calendario ${letra}`), h('span', { class: 'texto-sm texto-2' }, textoMeses(meses[letra]))));
      return boton;
    };
    guardar.addEventListener('click', async () => {
      guardar.disabled = true;
      try {
        cerrar(avisar(await api.put('/api/perfil/calendario', { calendario_icfes: elegido })));
      } catch (error) {
        guardar.disabled = false;
        toastError(error.message);
      }
    });
    return [
      h('h2', {}, '¿En qué calendario presentarás la prueba Saber 11 del ICFES?'),
      h('p', { class: 'texto-2' }, 'Con tu respuesta calculamos los días que faltan para tu examen según la fecha oficial publicada por el ICFES. Puedes cambiarla cuando quieras desde la cuenta regresiva o en Configuración, sin perder tu progreso.'),
      h('div', { class: 'opciones-calendario', role: 'radiogroup', 'aria-label': 'Calendario del Saber 11' }, opcion('A'), opcion('B')),
      h('div', { class: 'modal-acciones' },
        obligatorio ? null : h('button', { class: 'btn btn-secundario', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'),
        guardar),
    ];
  }, { cerrable: !obligatorio, etiqueta: 'Calendario del Saber 11', clase: 'modal-calendario' }).then((r) => r ?? null);
}

/**
 * Pide la fecha del examen cuando el ICFES no publicó una única fecha oficial:
 *   - varias fechas oficiales → el estudiante elige la de su citación;
 *   - sin publicar → puede ingresar la fecha de su citación (o borrarla).
 */
export async function pedirFechaExamen(cuenta) {
  const varias = cuenta.opciones?.length > 1;
  return modal((cerrar) => {
    const enviar = async (fecha) => {
      try {
        cerrar(avisar(await api.put('/api/perfil/calendario', { calendario_icfes: cuenta.calendario, fecha_icfes: fecha })));
      } catch (error) {
        toastError(error.message);
      }
    };

    if (varias) {
      return [
        h('h2', {}, `¿Cuál es tu fecha del ${cuenta.convocatoria}?`),
        h('p', { class: 'texto-2' }, 'El ICFES publicó varias fechas para tu calendario. Elige la que aparece en tu citación.'),
        h('div', { class: 'opciones-calendario' }, cuenta.opciones.map((o) => h('button', {
          type: 'button',
          class: `opcion-calendario ${cuenta.fecha === o.fecha ? 'elegida' : ''}`,
          onclick: () => enviar(o.fecha),
        }, icono('calendar-days'), h('span', {}, h('strong', {}, fechaLarga(o.fecha)), h('span', { class: 'texto-sm texto-2' }, o.descripcion))))),
        h('div', { class: 'modal-acciones' }, h('button', { class: 'btn btn-secundario', type: 'button', onclick: () => cerrar(null) }, 'Cancelar')),
      ];
    }

    const entrada = h('input', { class: 'entrada', type: 'date', id: 'fecha-citacion', value: cuenta.estado === 'citacion' ? cuenta.fecha : '' });
    return [
      h('h2', {}, 'Fecha de tu citación'),
      h('p', { class: 'texto-2' }, `El ICFES aún no ha publicado la fecha oficial del ${cuenta.convocatoria} (normalmente se presenta ${cuenta.meses}). Si ya tienes tu citación, escribe la fecha y la usaremos para la cuenta regresiva. Si no, la cuenta regresiva se activará cuando el ICFES la publique.`),
      h('div', { class: 'campo' }, h('label', { for: 'fecha-citacion' }, 'Fecha de la prueba según tu citación'), entrada),
      h('div', { class: 'modal-acciones' },
        cuenta.estado === 'citacion' ? h('button', { class: 'btn btn-fantasma', type: 'button', onclick: () => enviar(null) }, 'Borrar fecha') : null,
        h('button', { class: 'btn btn-secundario', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'),
        h('button', {
          class: 'btn btn-primario',
          type: 'button',
          onclick: () => (entrada.value ? enviar(entrada.value) : toastError('Escribe la fecha de tu citación.')),
        }, 'Guardar')),
    ];
  }, { etiqueta: 'Fecha del examen', clase: 'modal-calendario' }).then((r) => r ?? null);
}

/** Texto principal de la cuenta regresiva según el estado de la fecha. */
export function textoCuentaRegresiva(cuenta) {
  if (cuenta.fecha && ['oficial', 'elegida', 'citacion'].includes(cuenta.estado)) {
    if (cuenta.dias === 0) return `¡Hoy es el día! ${cuenta.convocatoria}. Confía en tu preparación.`;
    const origen = cuenta.estado === 'citacion' ? ' (fecha de tu citación)' : ' (fecha oficial del ICFES)';
    return `${cuenta.convocatoria}: ${fechaLarga(cuenta.fecha)}${origen}`;
  }
  return cuenta.mensaje;
}
