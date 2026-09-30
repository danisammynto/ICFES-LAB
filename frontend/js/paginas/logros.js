/**
 * Logros, niveles, insignias, racha y retos.
 */
import { api } from '../core/api.js';
import { $, formatoFecha, formatoNumero, h, icono, montar } from '../core/dom.js';
import { iniciarPagina } from '../core/layout.js';
import { activarPestanas, cargando, errorCarga } from '../core/ui.js';
import { tarjetaReto } from './simulacros-comun.js';

const NOMBRE_RAREZA = { comun: 'Común', rara: 'Rara', epica: 'Épica', legendaria: 'Legendaria' };

function resumen(niveles, logros, insignias, racha) {
  const actual = niveles.actual;
  const obtenidos = logros.filter((l) => l.desbloqueado).length;
  const dato = (nombreIcono, valor, etiqueta) => h('article', { class: 'tarjeta kpi' },
    h('div', { class: 'fila-entre' }, h('span', { class: 'kpi-etiqueta' }, etiqueta), icono(nombreIcono)),
    h('span', { class: 'kpi-valor' }, valor));
  return [
    h('article', { class: 'tarjeta tarjeta-nivel' },
      h('span', { class: 'medalla medalla-lg' }, icono(actual.nivel.icono)),
      h('div', { class: 'crecer' },
        h('p', {}, `Nivel ${actual.nivel.numero}`),
        h('h2', {}, actual.nivel.nombre),
        h('div', { class: 'barra', style: { '--valor': `${actual.progreso}%`, '--color': 'var(--lima)' } }),
        h('p', {}, actual.siguiente ? `${formatoNumero(actual.xp)} XP · faltan ${formatoNumero(actual.siguiente.faltan)} para ${actual.siguiente.nombre}` : `${formatoNumero(actual.xp)} XP · ¡Nivel máximo!`))),
    dato('trophy', `${obtenidos}/${logros.length}`, 'Logros'),
    dato('award', `${insignias.filter((i) => i.obtenida).length}`, 'Insignias'),
    dato('flame', `${racha.actual} días`, 'Racha actual'),
  ];
}

function panelLogros(logros) {
  const ordenados = [...logros].sort((a, b) => Number(b.desbloqueado) - Number(a.desbloqueado) || b.progreso.porcentaje - a.progreso.porcentaje);
  return h('div', { class: 'grid-logros' }, ordenados.map((l) => h('article', { class: `tarjeta logro ${l.desbloqueado ? 'desbloqueado' : 'pendiente'}` },
    h('span', { class: 'medalla', style: { '--color': l.desbloqueado ? 'var(--primario)' : 'var(--texto-3)' } }, icono(l.icono)),
    h('div', { class: 'crecer' },
      h('h3', {}, l.nombre),
      h('p', {}, l.descripcion),
      l.desbloqueado ? null : h('div', { class: 'barra barra-sm', style: { '--valor': `${l.progreso.porcentaje}%`, '--color': 'var(--cielo)' } }),
      h('div', { class: 'fila-entre' },
        h('span', {}, l.desbloqueado ? `Desbloqueado ${formatoFecha(l.desbloqueado_en, { day: 'numeric', month: 'short' })}` : `${formatoNumero(l.progreso.valor)} / ${formatoNumero(l.progreso.meta)}`),
        h('span', {}, [l.recompensa.xp ? `+${l.recompensa.xp} XP` : null, l.recompensa.monedas ? `+${l.recompensa.monedas} monedas` : null].filter(Boolean).join(' · '))),
      l.insignia ? h('span', { class: 'chip chip-lima mt-4' }, icono(l.insignia.icono, 'icono-sm'), `Insignia: ${l.insignia.nombre}`) : null))));
}

function panelNiveles(niveles) {
  return h('div', { class: 'tarjeta' }, h('div', { class: 'ruta-niveles' }, niveles.niveles.map((n) => h('div', { class: `nivel-ruta ${n.alcanzado ? 'alcanzado' : ''}` },
    h('span', { class: 'medalla', style: { '--color': n.color } }, icono(n.icono)),
    h('div', {},
      h('div', { class: 'fila envolver gap-2' },
        h('h3', {}, `Nivel ${n.numero} · ${n.nombre}`),
        n.numero === niveles.actual.nivel.numero ? h('span', { class: 'chip chip-xp' }, 'Tu nivel actual') : n.alcanzado ? h('span', { class: 'chip chip-exito' }, icono('check', 'icono-sm'), 'Alcanzado') : h('span', { class: 'chip' }, icono('lock', 'icono-sm'), 'Bloqueado')),
      h('span', { class: 'xp' }, `${formatoNumero(n.xp_minimo)} XP${n.recompensa_monedas ? ` · recompensa: ${n.recompensa_monedas} monedas` : ''}`),
      h('p', { class: 'texto-2 texto-sm mb-0' }, n.descripcion),
      h('ul', {},
        n.desbloqueos.map((d) => h('li', {}, d)),
        n.subtemas.length ? h('li', {}, h('strong', {}, 'Subtemas: '), n.subtemas.join(', ')) : null,
        n.retos.length ? h('li', {}, h('strong', {}, 'Retos: '), n.retos.join(', ')) : null))))));
}

function panelInsignias(insignias) {
  return h('div', { class: 'grid-insignias' }, insignias.map((i) => h('article', { class: 'tarjeta insignia', title: i.descripcion },
    h('span', { class: `medalla medalla-lg ${i.obtenida ? '' : 'bloqueada'}`, style: { '--color': i.color } }, icono(i.icono)),
    h('strong', {}, i.nombre),
    h('span', { class: `rareza ${i.rareza}` }, NOMBRE_RAREZA[i.rareza]),
    h('span', {}, i.obtenida ? `Obtenida ${formatoFecha(i.obtenida_en, { day: 'numeric', month: 'short' })}` : i.origen === 'tienda' ? `En la tienda · ${i.precio_monedas} monedas` : i.descripcion))));
}

function panelRacha(r) {
  const primero = new Date(`${r.calendario[0].fecha}T12:00:00`);
  const relleno = (primero.getDay() + 6) % 7;
  return [
    h('article', { class: 'tarjeta seccion' },
      h('div', { class: 'racha-grande' },
        h('img', { src: '/img/fuego.svg', alt: '' }),
        h('div', { class: 'dato' }, h('strong', {}, r.actual), h('span', { class: 'texto-2 texto-sm' }, 'días de racha')),
        h('div', { class: 'dato' }, h('strong', {}, r.maxima), h('span', { class: 'texto-2 texto-sm' }, 'récord personal')),
        h('div', { class: 'dato' }, h('strong', {}, r.protectores), h('span', { class: 'texto-2 texto-sm' }, 'protectores (máx. 3)'))),
      r.en_riesgo ? h('div', { class: 'alerta mt-4' }, icono('triangle-alert'), h('span', {}, '¡Tu racha está en riesgo! Estudia hoy para mantenerla.')) : null),
    h('article', { class: 'tarjeta seccion' },
      h('h3', { class: 'tarjeta-titulo' }, icono('calendar-days'), 'Tus últimos 6 meses'),
      h('div', { class: 'calendario calendario-largo' },
        Array.from({ length: relleno }, () => h('span', { class: 'vacio-dia' })),
        r.calendario.map((d) => h('span', { class: d.nivel ? `n${d.nivel}` : '', title: `${formatoFecha(d.fecha, { day: 'numeric', month: 'short' })}: ${d.minutos} min` })))),
    h('section', {},
      h('div', { class: 'seccion-titulo' }, h('h2', {}, 'Recompensas por racha'), h('a', { href: '/tienda', class: 'texto-sm' }, 'Comprar protectores')),
      h('div', { class: 'hitos' }, r.recompensas.map((hito) => h('div', { class: `hito ${hito.obtenida ? 'obtenido' : ''}` },
        h('span', { class: 'dias' }, hito.dias),
        h('div', {},
          h('strong', {}, hito.nombre),
          h('p', {}, [`+${hito.xp} XP`, `+${hito.monedas} monedas`, hito.protectores ? `${hito.protectores} protector${hito.protectores > 1 ? 'es' : ''}` : null, hito.insignia ? `insignia ${hito.insignia}` : null].filter(Boolean).join(' · ')),
          hito.obtenida ? h('p', { class: 'negrita' }, '✓ Obtenida') : null))))),
  ];
}

async function cargarLogros() {
  montar($('#panel-logros'), cargando());
  try {
    const [{ logros }, niveles, { insignias }, racha, simulacros] = await Promise.all([
      api.get('/api/gamificacion/logros'),
      api.get('/api/gamificacion/niveles'),
      api.get('/api/gamificacion/insignias'),
      api.get('/api/gamificacion/racha'),
      api.get('/api/simulacros'),
    ]);
    montar($('#resumen-logros'), resumen(niveles, logros, insignias, racha));
    montar($('#panel-logros'), panelLogros(logros));
    montar($('#panel-niveles'), panelNiveles(niveles));
    montar($('#panel-insignias'), panelInsignias(insignias));
    montar($('#panel-racha'), panelRacha(racha));
    montar($('#panel-retos'), h('div', { class: 'retos' }, simulacros.retos.map(tarjetaReto)));
  } catch (error) {
    montar($('#panel-logros'), errorCarga(error, cargarLogros));
  }
}

await iniciarPagina({ activa: 'logros' });
const activar = activarPestanas($('.pestanas'), {
  alCambiar: (id) => window.history.replaceState(null, '', `#${id.replace('tab-', '')}`),
});
if (window.location.hash) activar(`tab-${window.location.hash.slice(1)}`);
cargarLogros();
