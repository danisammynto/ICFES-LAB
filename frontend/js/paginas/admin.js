/**
 * Panel de administración.
 */
import { api } from '../core/api.js';
import { $, formatoFecha, formatoNumero, h, icono, montar, tiempoRelativo } from '../core/dom.js';
import { indicadorDificultad } from '../core/pregunta.js';
import { iniciarPagina } from '../core/layout.js';
import { alfa, grafica, PALETA } from '../core/graficas.js';
import { activarPestanas, cargando, conCarga, errorCarga, modal, toast, toastError } from '../core/ui.js';

let subtemas = [];
const filtros = { materia: '', q: '', estado: 'activas', pagina: 1 };

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

async function cargarResumen() {
  const panel = $('#panel-resumen');
  montar(panel, cargando());
  try {
    const r = await api.get('/api/admin/resumen');
    const g = r.general;
    const kpi = (nombreIcono, etiqueta, valor) => h('article', { class: 'tarjeta kpi' },
      h('div', { class: 'fila-entre' }, h('span', { class: 'kpi-etiqueta' }, etiqueta), icono(nombreIcono)), h('span', { class: 'kpi-valor' }, formatoNumero(valor)));
    montar(panel,
      h('div', { class: 'kpis-admin' },
        kpi('users', 'Usuarios', g.usuarios), kpi('user-round', 'Activos (7 días)', g.activos_7),
        kpi('list-checks', 'Preguntas activas', g.preguntas), kpi('book-open', 'Lecciones', g.lecciones),
        kpi('zap', 'Respuestas (24 h)', g.respuestas_24h), kpi('clipboard-list', 'Simulacros', g.simulacros),
        kpi('bot', 'Mensajes a Vanty', g.mensajes_vanty)),
      h('div', { class: 'rejilla-2' },
        h('article', { class: 'tarjeta' }, h('h3', { class: 'tarjeta-titulo' }, icono('chart-column'), 'Banco de preguntas por área'),
          h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla' },
            h('thead', {}, h('tr', {}, ['Área', 'Total', 'Baja', 'Media', 'Alta'].map((t) => h('th', {}, t)))),
            h('tbody', {}, r.por_materia.map((m) => h('tr', {}, h('td', {}, m.nombre), h('td', {}, h('strong', {}, m.preguntas)), h('td', {}, m.faciles), h('td', {}, m.medias), h('td', {}, m.dificiles))))))),
        h('article', { class: 'tarjeta' }, h('h3', { class: 'tarjeta-titulo' }, icono('calendar-days'), 'Actividad de los últimos 14 días'),
          h('div', { class: 'grafica' }, h('canvas', { id: 'g-actividad' })))));
    grafica($('#g-actividad'), {
      data: {
        labels: r.actividad.map((a) => formatoFecha(a.fecha, { day: 'numeric', month: 'short' })),
        datasets: [
          { type: 'bar', label: 'Estudiantes activos', data: r.actividad.map((a) => a.usuarios), backgroundColor: alfa(PALETA.cielo, 0.7), borderRadius: 6, yAxisID: 'y' },
          { type: 'line', label: 'Preguntas respondidas', data: r.actividad.map((a) => a.preguntas), borderColor: PALETA.indigo, tension: 0.3, yAxisID: 'y1' },
        ],
      },
      options: { scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: 'right', grid: { display: false } } } },
    });
  } catch (error) {
    montar(panel, errorCarga(error, cargarResumen));
  }
}

// ---------------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------------

function formularioPregunta(existente = null) {
  const p = existente;
  const correcta = p?.opciones.find((o) => o.es_correcta)?.letra ?? 'A';
  return modal((cerrar) => {
    const form = h('form', { novalidate: true },
      h('h2', {}, p ? `Editar ${p.codigo}` : 'Nueva pregunta'),
      h('div', { class: 'rejilla-3', style: { gap: 'var(--esp-3)' } },
        h('div', { class: 'campo' }, h('label', { for: 'p-codigo' }, 'Código'),
          h('input', { class: 'entrada', id: 'p-codigo', name: 'codigo', required: true, maxlength: 40, value: p?.codigo ?? '', readonly: Boolean(p), placeholder: 'MAT-ALG-11' })),
        h('div', { class: 'campo' }, h('label', { for: 'p-subtema' }, 'Subtema'),
          h('select', { class: 'entrada', id: 'p-subtema', name: 'subtema', required: true },
            subtemas.map((s) => h('option', { value: s.slug, selected: p?.subtema.slug === s.slug }, `${s.materia} · ${s.nombre}`)))),
        h('div', { class: 'campo' }, h('label', { for: 'p-dificultad' }, 'Dificultad'),
          h('select', { class: 'entrada', id: 'p-dificultad', name: 'dificultad' },
            [[1, 'Baja'], [2, 'Media'], [3, 'Alta']].map(([v, t]) => h('option', { value: v, selected: (p?.dificultad ?? 2) === v }, t))))),
      h('div', { class: 'rejilla-2', style: { gap: 'var(--esp-3)' } },
        h('div', { class: 'campo' }, h('label', { for: 'p-competencia' }, 'Competencia'),
          h('input', { class: 'entrada', id: 'p-competencia', name: 'competencia', maxlength: 120, value: p?.competencia ?? '' })),
        h('div', { class: 'campo' }, h('label', { for: 'p-tiempo' }, 'Tiempo estimado (segundos)'),
          h('input', { class: 'entrada', id: 'p-tiempo', name: 'tiempo_estimado_seg', type: 'number', min: 15, max: 600, value: p?.tiempo_estimado_seg ?? 120 }))),
      h('div', { class: 'campo' }, h('label', { for: 'p-contexto' }, 'Contexto (opcional; admite tablas con "|")'),
        h('textarea', { class: 'entrada', id: 'p-contexto', name: 'contexto' }, p?.contexto?.contenido ?? '')),
      h('div', { class: 'campo' }, h('label', { for: 'p-enunciado' }, 'Enunciado'),
        h('textarea', { class: 'entrada', id: 'p-enunciado', name: 'enunciado', required: true }, p?.enunciado ?? '')),
      h('div', { class: 'rejilla-2', style: { gap: 'var(--esp-3)' } },
        h('div', { class: 'campo' }, h('label', { for: 'p-imagen' }, 'Imagen (opcional: /img/... o https://)'),
          h('input', { class: 'entrada', id: 'p-imagen', name: 'imagen', value: p?.imagen?.url ?? '' })),
        h('div', { class: 'campo' }, h('label', { for: 'p-imagen-alt' }, 'Descripción de la imagen'),
          h('input', { class: 'entrada', id: 'p-imagen-alt', name: 'imagen_alt', value: p?.imagen?.alt ?? '' }))),
      h('p', { class: 'etiqueta' }, 'Opciones (marca la correcta)'),
      ['A', 'B', 'C', 'D'].map((letra, i) => h('div', { class: 'opcion-form' },
        h('span', { class: 'letra' }, letra),
        h('div', { class: 'columna', style: { gap: '6px' } },
          h('input', { class: 'entrada', name: `opcion_${letra}`, required: true, placeholder: `Texto de la opción ${letra}`, value: p?.opciones[i]?.texto ?? '', 'aria-label': `Texto de la opción ${letra}` }),
          h('input', { class: 'entrada', name: `retro_${letra}`, placeholder: 'Retroalimentación: por qué es correcta o incorrecta', value: p?.opciones[i]?.retroalimentacion ?? '', 'aria-label': `Retroalimentación de la opción ${letra}` }),
          h('label', { class: 'correcta' }, h('input', { type: 'radio', name: 'correcta', value: letra, checked: correcta === letra }), 'Es la respuesta correcta')))),
      h('div', { class: 'campo' }, h('label', { for: 'p-explicacion' }, 'Explicación detallada'),
        h('textarea', { class: 'entrada', id: 'p-explicacion', name: 'explicacion', required: true }, p?.explicacion ?? '')),
      h('div', { class: 'campo' }, h('label', { for: 'p-etiquetas' }, 'Etiquetas (separadas por comas)'),
        h('input', { class: 'entrada', id: 'p-etiquetas', name: 'etiquetas', value: (p?.etiquetas ?? []).join(', ') })),
      h('div', { class: 'modal-acciones' },
        h('button', { type: 'button', class: 'btn btn-secundario', onclick: () => cerrar() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'btn btn-primario' }, 'Guardar pregunta')));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const datos = {
        codigo: String(f.get('codigo')).trim().toUpperCase(),
        subtema: f.get('subtema'),
        dificultad: Number(f.get('dificultad')),
        competencia: String(f.get('competencia')).trim() || null,
        contexto: String(f.get('contexto')).trim() || null,
        enunciado: String(f.get('enunciado')).trim(),
        imagen: String(f.get('imagen')).trim() || null,
        imagen_alt: String(f.get('imagen_alt')).trim() || null,
        tiempo_estimado_seg: Number(f.get('tiempo_estimado_seg')) || 120,
        explicacion: String(f.get('explicacion')).trim(),
        etiquetas: String(f.get('etiquetas')).split(',').map((t) => t.trim()).filter(Boolean),
        opciones: ['A', 'B', 'C', 'D'].map((letra) => ({
          letra,
          texto: String(f.get(`opcion_${letra}`)).trim(),
          correcta: f.get('correcta') === letra,
          retroalimentacion: String(f.get(`retro_${letra}`)).trim() || null,
        })),
      };
      try {
        await conCarga(form.querySelector('[type="submit"]'), () => (p ? api.put(`/api/admin/preguntas/${p.id}`, datos) : api.post('/api/admin/preguntas', datos)));
        toast(p ? 'Pregunta actualizada.' : 'Pregunta creada.');
        cerrar();
        cargarPreguntas();
      } catch (error) {
        toastError(error.detalles?.length ? error.detalles.map((d) => d.mensaje ?? d).join(' · ') : error.message);
      }
    });
    return form;
  }, { clase: 'modal-grande', etiqueta: 'Formulario de pregunta' });
}

function importarJson() {
  const entrada = h('input', { type: 'file', accept: '.json,application/json', class: 'oculto' });
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files[0];
    if (!archivo) return;
    try {
      const datos = JSON.parse(await archivo.text());
      const r = await api.post('/api/admin/preguntas/importar', datos);
      toast(`Importación lista: ${r.total} preguntas (${r.nuevas} nuevas, ${r.actualizadas} actualizadas).`);
      cargarPreguntas();
    } catch (error) {
      modal((cerrar) => [
        h('h2', {}, 'No se pudo importar'),
        h('p', { class: 'texto-2' }, error instanceof SyntaxError ? 'El archivo no es un JSON válido.' : error.message),
        error.detalles?.length ? h('ul', { class: 'errores-importacion' }, error.detalles.map((d) => h('li', {}, typeof d === 'string' ? d : d.mensaje))) : null,
        h('p', { class: 'texto-sm texto-3 mt-4' }, 'El formato está descrito en database/contenido/FORMATO.md.'),
        h('div', { class: 'modal-acciones' }, h('button', { class: 'btn btn-primario', onclick: () => cerrar() }, 'Entendido')),
      ], { etiqueta: 'Error de importación' });
    }
  });
  document.body.append(entrada);
  entrada.click();
  setTimeout(() => entrada.remove(), 60_000);
}

async function cargarPreguntas() {
  const zona = $('#tabla-preguntas');
  montar(zona, cargando());
  try {
    const consulta = new URLSearchParams({ estado: filtros.estado, pagina: String(filtros.pagina) });
    if (filtros.materia) consulta.set('materia', filtros.materia);
    if (filtros.q) consulta.set('q', filtros.q);
    const r = await api.get(`/api/admin/preguntas?${consulta}`);
    const paginas = Math.max(1, Math.ceil(r.total / r.por_pagina));
    montar(zona,
      h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, ['Código', 'Área · subtema', 'Dif.', 'Enunciado', 'Uso', 'Estado', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, r.preguntas.map((p) => h('tr', {},
          h('td', {}, h('strong', {}, p.codigo)),
          h('td', {}, h('span', { class: 'fila gap-2' }, h('span', { style: { width: '9px', height: '9px', borderRadius: '50%', background: p.color, display: 'inline-block' } }), `${p.materia} · ${p.subtema}`)),
          h('td', {}, indicadorDificultad(p.dificultad)),
          h('td', { class: 'enunciado' }, h('span', {}, p.enunciado)),
          h('td', {}, `${p.respuestas} resp.${p.acierto != null ? ` · ${p.acierto}%` : ''}`),
          h('td', {}, p.activa ? h('span', { class: 'chip chip-exito' }, 'Activa') : h('span', { class: 'chip' }, 'Inactiva')),
          h('td', {}, h('div', { class: 'fila gap-2' },
            h('button', { class: 'btn btn-fantasma btn-sm', 'aria-label': `Editar ${p.codigo}`, onclick: async () => formularioPregunta(await api.get(`/api/admin/preguntas/${p.id}`)) }, icono('pencil', 'icono-sm')),
            h('button', {
              class: 'btn btn-fantasma btn-sm',
              'aria-label': p.activa ? `Desactivar ${p.codigo}` : `Activar ${p.codigo}`,
              onclick: async () => {
                try {
                  await api.patch(`/api/admin/preguntas/${p.id}/estado`, { activa: !p.activa });
                  cargarPreguntas();
                } catch (error) { toastError(error.message); }
              },
            }, icono(p.activa ? 'eye-off' : 'eye', 'icono-sm'))))))))),
      h('div', { class: 'paginacion' },
        h('span', {}, `${formatoNumero(r.total)} preguntas · página ${r.pagina} de ${paginas}`),
        h('button', { class: 'btn btn-secundario btn-sm', disabled: r.pagina <= 1, onclick: () => { filtros.pagina -= 1; cargarPreguntas(); } }, icono('chevron-left', 'icono-sm')),
        h('button', { class: 'btn btn-secundario btn-sm', disabled: r.pagina >= paginas, onclick: () => { filtros.pagina += 1; cargarPreguntas(); } }, icono('chevron-right', 'icono-sm'))));
  } catch (error) {
    montar(zona, errorCarga(error, cargarPreguntas));
  }
}

function pintarPanelPreguntas() {
  const materias = [...new Map(subtemas.map((s) => [s.materia_slug, s.materia])).entries()];
  const selectorMateria = h('select', { class: 'entrada', id: 'f-materia' }, h('option', { value: '' }, 'Todas las áreas'), materias.map(([slug, nombre]) => h('option', { value: slug }, nombre)));
  const selectorEstado = h('select', { class: 'entrada', id: 'f-estado' }, [['activas', 'Activas'], ['inactivas', 'Inactivas'], ['todas', 'Todas']].map(([v, t]) => h('option', { value: v }, t)));
  const busqueda = h('input', { class: 'entrada', id: 'f-busqueda', type: 'search', placeholder: 'Código o texto del enunciado' });
  let espera;
  busqueda.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => { filtros.q = busqueda.value.trim(); filtros.pagina = 1; cargarPreguntas(); }, 350);
  });
  selectorMateria.addEventListener('change', () => { filtros.materia = selectorMateria.value; filtros.pagina = 1; cargarPreguntas(); });
  selectorEstado.addEventListener('change', () => { filtros.estado = selectorEstado.value; filtros.pagina = 1; cargarPreguntas(); });

  montar($('#panel-preguntas'), h('article', { class: 'tarjeta' },
    h('div', { class: 'filtros-admin' },
      h('div', { class: 'campo' }, h('label', { for: 'f-materia' }, 'Área'), selectorMateria),
      h('div', { class: 'campo' }, h('label', { for: 'f-estado' }, 'Estado'), selectorEstado),
      h('div', { class: 'campo crecer' }, h('label', { for: 'f-busqueda' }, 'Buscar'), busqueda),
      h('button', { class: 'btn btn-secundario', onclick: importarJson }, icono('upload'), 'Importar JSON'),
      h('button', { class: 'btn btn-primario', onclick: () => formularioPregunta() }, icono('plus'), 'Nueva pregunta')),
    h('div', { id: 'tabla-preguntas' })));
  cargarPreguntas();
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

async function cargarUsuarios(q = '') {
  const zona = $('#tabla-usuarios');
  montar(zona, cargando());
  try {
    const r = await api.get(`/api/admin/usuarios${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    montar(zona, h('div', { class: 'tabla-contenedor' }, h('table', { class: 'tabla' },
      h('thead', {}, h('tr', {}, ['Nombre', 'Correo', 'Nivel', 'Racha', 'Respuestas', 'Último acceso', 'Rol', 'Activo'].map((t) => h('th', {}, t)))),
      h('tbody', {}, r.usuarios.map((u) => {
        const rol = h('select', { class: 'entrada', style: { minHeight: '34px', padding: '4px 8px' }, 'aria-label': `Rol de ${u.nombre}` },
          h('option', { value: 'estudiante', selected: u.rol === 'estudiante' }, 'Estudiante'),
          h('option', { value: 'admin', selected: u.rol === 'admin' }, 'Admin'));
        rol.addEventListener('change', async () => {
          try { await api.patch(`/api/admin/usuarios/${u.id}`, { rol: rol.value }); toast('Rol actualizado.'); } catch (error) { toastError(error.message); rol.value = u.rol; }
        });
        const activo = h('input', { type: 'checkbox', checked: u.activo, 'aria-label': `Cuenta activa de ${u.nombre}` });
        activo.addEventListener('change', async () => {
          try { await api.patch(`/api/admin/usuarios/${u.id}`, { activo: activo.checked }); toast(activo.checked ? 'Cuenta activada.' : 'Cuenta desactivada.'); } catch (error) { toastError(error.message); activo.checked = !activo.checked; }
        });
        return h('tr', {},
          h('td', {}, h('strong', {}, u.nombre)), h('td', {}, u.email), h('td', {}, `${u.nivel} · ${formatoNumero(u.xp)} XP`),
          h('td', {}, `${u.racha} días`), h('td', {}, formatoNumero(u.respuestas)),
          h('td', {}, u.ultimo_acceso ? tiempoRelativo(u.ultimo_acceso) : '—'),
          h('td', {}, rol), h('td', {}, h('label', { class: 'interruptor' }, activo)));
      })))),
    h('p', { class: 'texto-sm texto-3 mt-4' }, `${formatoNumero(r.total)} usuarios`));
  } catch (error) {
    montar(zona, errorCarga(error, () => cargarUsuarios(q)));
  }
}

function pintarPanelUsuarios() {
  const busqueda = h('input', { class: 'entrada', type: 'search', placeholder: 'Buscar por nombre o correo', 'aria-label': 'Buscar usuarios' });
  let espera;
  busqueda.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => cargarUsuarios(busqueda.value.trim()), 350); });
  montar($('#panel-usuarios'), h('article', { class: 'tarjeta' }, h('div', { class: 'filtros-admin' }, h('div', { class: 'campo crecer' }, busqueda)), h('div', { id: 'tabla-usuarios' })));
  cargarUsuarios();
}

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

async function pintarConfiguracion() {
  const panel = $('#panel-configuracion');
  montar(panel, cargando());
  const c = await api.get('/api/admin/configuracion');
  const form = h('form', { class: 'tarjeta', novalidate: true, style: { maxWidth: '720px' } },
    h('h2', { class: 'tarjeta-titulo' }, icono('calendar'), 'Fecha global del ICFES'),
    h('p', { class: 'texto-2' }, 'Se usa en la cuenta regresiva de todos los estudiantes que no hayan definido su propia fecha.'),
    h('div', { class: 'rejilla-2', style: { gap: 'var(--esp-3)' } },
      h('div', { class: 'campo' }, h('label', { for: 'c-fecha' }, 'Fecha del examen'), h('input', { class: 'entrada', type: 'date', id: 'c-fecha', name: 'fecha', value: c.fecha_icfes.fecha ?? '', required: true })),
      h('div', { class: 'campo' }, h('label', { for: 'c-nombre' }, 'Nombre'), h('input', { class: 'entrada', id: 'c-nombre', name: 'nombre', value: c.fecha_icfes.nombre ?? '', maxlength: 80 }))),
    h('label', { class: 'interruptor mb-4' }, h('input', { type: 'checkbox', name: 'estimada', checked: Boolean(c.fecha_icfes.estimada) }), h('span', {}, 'Marcar como fecha estimada (aún no oficial)')),
    h('hr'),
    h('h2', { class: 'tarjeta-titulo' }, icono('bot'), 'Vanty'),
    h('div', { class: 'campo', style: { maxWidth: '280px' } }, h('label', { for: 'c-limite' }, 'Límite diario de mensajes por estudiante'),
      h('input', { class: 'entrada', type: 'number', id: 'c-limite', name: 'limite_diario', min: 1, max: 1000, value: c.vanty.limite_diario ?? 80 })),
    h('div', { class: 'acciones-form', style: { display: 'flex', justifyContent: 'flex-end' } }, h('button', { class: 'btn btn-primario', type: 'submit' }, 'Guardar configuración')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await conCarga(form.querySelector('[type="submit"]'), () => api.put('/api/admin/configuracion', {
        fecha_icfes: { fecha: form.fecha.value, nombre: form.nombre.value.trim() || 'Saber 11', estimada: form.estimada.checked },
        vanty: { limite_diario: Number(form.limite_diario.value) },
      }));
      toast('Configuración guardada.');
    } catch (error) {
      toastError(error.message);
    }
  });
  montar(panel, form);
}

// ---------------------------------------------------------------------------

await iniciarPagina({ activa: 'admin' });
const cargados = new Set();
activarPestanas($('.pestanas'), {
  alCambiar: (id) => {
    if (cargados.has(id)) return;
    cargados.add(id);
    if (id === 'tab-preguntas') pintarPanelPreguntas();
    if (id === 'tab-usuarios') pintarPanelUsuarios();
    if (id === 'tab-configuracion') pintarConfiguracion().catch((error) => montar($('#panel-configuracion'), errorCarga(error)));
  },
});
({ subtemas } = await api.get('/api/admin/catalogo'));
cargados.add('tab-resumen');
cargarResumen();
