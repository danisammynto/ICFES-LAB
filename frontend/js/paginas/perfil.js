/**
 * Perfil del estudiante: datos, estadísticas, insignias (con insignia destacada) y edición.
 */
import { api } from '../core/api.js';
import { $, formatoFecha, formatoNumero, h, icono, montar } from '../core/dom.js';
import { crearAvatar } from '../core/avatar.js';
import { iniciarPagina } from '../core/layout.js';
import { cargando, conCarga, errorCarga, modal, toast, toastError } from '../core/ui.js';

const GRADOS = { 10: '10.º grado', 11: '11.º grado', egresado: 'Egresado', otro: 'Otro' };

function formularioEdicion(p, alGuardar) {
  return modal((cerrar) => {
    const form = h('form', { novalidate: true },
      h('h2', {}, 'Editar perfil'),
      h('div', { class: 'campo' }, h('label', { for: 'f-nombre' }, 'Nombre completo'),
        h('input', { class: 'entrada', id: 'f-nombre', name: 'nombre', value: p.usuario.nombre, maxlength: 80, required: true })),
      h('div', { class: 'campo' }, h('label', { for: 'f-mostrar' }, '¿Cómo quieres que te llamemos?'),
        h('input', { class: 'entrada', id: 'f-mostrar', name: 'nombre_mostrar', value: p.perfil.nombre_mostrar ?? '', maxlength: 40 })),
      h('div', { class: 'campo' }, h('label', { for: 'f-bio' }, 'Sobre ti'),
        h('textarea', { class: 'entrada', id: 'f-bio', name: 'bio', maxlength: 280, placeholder: '¿Qué quieres estudiar? ¿Cuál es tu meta?' }, p.perfil.bio ?? '')),
      h('div', { class: 'rejilla-2', style: { gap: 'var(--esp-3)' } },
        h('div', { class: 'campo' }, h('label', { for: 'f-colegio' }, 'Colegio'),
          h('input', { class: 'entrada', id: 'f-colegio', name: 'colegio', value: p.perfil.colegio ?? '', maxlength: 120 })),
        h('div', { class: 'campo' }, h('label', { for: 'f-ciudad' }, 'Ciudad'),
          h('input', { class: 'entrada', id: 'f-ciudad', name: 'ciudad', value: p.perfil.ciudad ?? '', maxlength: 80 }))),
      h('div', { class: 'campo' }, h('label', { for: 'f-grado' }, 'Grado'),
        h('select', { class: 'entrada', id: 'f-grado', name: 'grado' },
          h('option', { value: '' }, 'Sin especificar'),
          Object.entries(GRADOS).map(([valor, texto]) => h('option', { value: valor, selected: p.perfil.grado === valor }, texto)))),
      h('div', { class: 'modal-acciones' },
        h('button', { type: 'button', class: 'btn btn-secundario', onclick: () => cerrar() }, 'Cancelar'),
        h('button', { type: 'submit', class: 'btn btn-primario' }, 'Guardar')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const datos = Object.fromEntries(new FormData(form));
      try {
        const perfil = await conCarga(form.querySelector('[type="submit"]'), () => api.put('/api/perfil', datos));
        toast('Perfil actualizado.');
        cerrar();
        alGuardar(perfil);
      } catch (error) {
        toastError(error.message);
      }
    });
    return form;
  }, { etiqueta: 'Editar perfil' });
}

function pintar(p) {
  const contenedor = $('#perfil');
  const destacada = p.insignias.find((i) => i.id === p.perfil.insignia_destacada_id);
  const e = p.estadisticas;
  const dato = (nombreIcono, valor, etiqueta) => h('article', { class: 'tarjeta kpi' },
    h('div', { class: 'fila-entre' }, h('span', { class: 'kpi-etiqueta' }, etiqueta), icono(nombreIcono)),
    h('span', { class: 'kpi-valor' }, valor));

  montar(contenedor,
    h('section', { class: 'cabecera-perfil' },
      h('div', { class: 'avatar-perfil' }, crearAvatar(p.perfil.avatar, { tamano: 140, titulo: `Avatar de ${p.usuario.nombre}` }),
        h('a', { class: 'btn btn-primario btn-icono btn-sm editar-avatar', href: '/tienda', 'aria-label': 'Personalizar avatar' }, icono('palette', 'icono-sm'))),
      h('div', {},
        h('h1', {}, p.perfil.nombre_mostrar || p.usuario.nombre),
        h('p', { class: 'texto-2 mb-0' }, p.usuario.nombre),
        p.perfil.bio ? h('p', { class: 'bio' }, p.perfil.bio) : null,
        h('div', { class: 'datos-perfil mt-4' },
          h('span', { class: 'chip chip-xp' }, icono(p.nivel.nivel.icono, 'icono-sm'), `Nivel ${p.nivel.nivel.numero} · ${p.nivel.nivel.nombre}`),
          destacada ? h('span', { class: 'chip chip-lima' }, icono(destacada.icono, 'icono-sm'), destacada.nombre) : null,
          p.perfil.colegio ? h('span', { class: 'chip' }, icono('school', 'icono-sm'), p.perfil.colegio) : null,
          p.perfil.ciudad ? h('span', { class: 'chip' }, icono('map-pin', 'icono-sm'), p.perfil.ciudad) : null,
          p.perfil.grado ? h('span', { class: 'chip' }, icono('graduation-cap', 'icono-sm'), GRADOS[p.perfil.grado]) : null,
          h('span', { class: 'chip' }, icono('calendar', 'icono-sm'), `Desde ${formatoFecha(p.usuario.miembro_desde, { month: 'long', year: 'numeric' })}`))),
      h('div', { class: 'columna' },
        h('button', { class: 'btn btn-secundario', onclick: () => formularioEdicion(p, recargar) }, icono('square-pen'), 'Editar perfil'),
        h('a', { class: 'btn btn-fantasma', href: '/configuracion' }, icono('settings'), 'Configuración'))),
    h('div', { class: 'estadisticas-perfil' },
      dato('list-checks', formatoNumero(e.respondidas), 'Preguntas'),
      dato('target', e.precision != null ? `${e.precision}%` : '—', 'Precisión'),
      dato('book-open', formatoNumero(e.lecciones), 'Lecciones'),
      dato('clipboard-list', formatoNumero(e.simulacros), 'Simulacros'),
      dato('calendar-days', formatoNumero(e.dias_estudiados), 'Días de estudio'),
      dato('clock', `${e.horas} h`, 'Tiempo total'),
      dato('trophy', `${e.logros}/${e.logros_total}`, 'Logros'),
      dato('flame', `${p.racha.maxima} días`, 'Mejor racha')),
    h('section', { class: 'seccion' },
      h('div', { class: 'seccion-titulo' }, h('h2', {}, 'Mis insignias'), h('span', { class: 'texto-3 texto-sm' }, 'Toca una insignia para destacarla en tu perfil')),
      p.insignias.length
        ? h('div', { class: 'grid-insignias' }, p.insignias.map((i) => {
          const elegida = i.id === p.perfil.insignia_destacada_id;
          const tarjeta = h('button', { type: 'button', class: 'tarjeta insignia insignia-destacable', 'aria-pressed': String(elegida), title: i.descripcion },
            h('span', { class: 'medalla medalla-lg', style: { '--color': i.color } }, icono(i.icono)),
            h('strong', {}, i.nombre),
            h('span', {}, elegida ? '★ Destacada' : formatoFecha(i.obtenida_en, { day: 'numeric', month: 'short', year: 'numeric' })));
          tarjeta.addEventListener('click', async () => {
            try {
              await api.put('/api/perfil/insignia-destacada', { insignia_id: elegida ? null : i.id });
              recargar();
            } catch (error) {
              toastError(error.message);
            }
          });
          return tarjeta;
        }))
        : h('p', { class: 'texto-2' }, 'Aún no tienes insignias. Consíguelas con logros, rachas y niveles.')));
}

async function recargar() {
  try {
    pintar(await api.get('/api/perfil'));
  } catch (error) {
    montar($('#perfil'), errorCarga(error, recargar));
  }
}

await iniciarPagina({ activa: null });
montar($('#perfil'), cargando());
recargar();
