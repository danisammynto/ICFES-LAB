/**
 * Pruebas unitarias de los requisitos de nivel y del calendario del ICFES (no requieren base de datos).
 * Ejecutar: npm test
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.JWT_SECRET ??= 'secreto-de-pruebas-unitarias-con-mas-de-32-caracteres';

let niveles;
let config;

before(async () => {
  niveles = await import('../../backend/src/services/niveles.service.js');
  config = await import('../../backend/src/services/config.service.js');
});

const metricasBase = {
  xp: 1200,
  dias_activos: 8,
  respondidas: 160,
  correctas: 100,
  precision: 62.5,
  temario: {
    areas: [
      { nombre: 'Matemáticas', completados: 3, total: 12, porcentaje: 25 },
      { nombre: 'Inglés', completados: 3, total: 9, porcentaje: 33.3 },
    ],
    completados: 6,
    total: 21,
    porcentaje: 28.6,
    minimo_area: 25,
  },
  actividades: { hechas: 20, total: 188, porcentaje: 10.6, detalle: [] },
};

const explorador = {
  numero: 2,
  nombre: 'Explorador',
  xp_minimo: 1000,
  requisitos: { dias_activos: 7, respondidas: 150, precision: 55, temario_area: 25 },
};

describe('Requisitos de nivel', () => {
  it('sube solo si cumple la XP y todos los requisitos académicos', () => {
    assert.equal(niveles.cumpleNivel(explorador, metricasBase), true);
    assert.equal(niveles.cumpleNivel(explorador, { ...metricasBase, precision: 54.9 }), false);
    assert.equal(niveles.cumpleNivel(explorador, { ...metricasBase, xp: 999 }), false);
    const sinTemario = { ...metricasBase, temario: { ...metricasBase.temario, minimo_area: 20 } };
    assert.equal(niveles.cumpleNivel(explorador, sinTemario), false, 'el temario se exige en cada área');
  });

  it('lista los requisitos con su avance y calcula el progreso hacia el nivel', () => {
    const lista = niveles.requisitosDeNivel(explorador, { ...metricasBase, respondidas: 75 });
    assert.deepEqual(lista.map((r) => r.clave), ['xp', 'dias_activos', 'respondidas', 'precision', 'temario_area']);
    assert.equal(lista.find((r) => r.clave === 'respondidas').cumplido, false);
    // 4 requisitos completos + 1 a la mitad → 90 %.
    assert.equal(niveles.avanceHacia(lista), 90);
  });

  it('el nivel Experto exige el 90 % de todas las actividades', () => {
    const experto = { numero: 4, nombre: 'Experto', xp_minimo: 9000, requisitos: { actividades: 90 } };
    const casi = { ...metricasBase, xp: 9500, actividades: { ...metricasBase.actividades, porcentaje: 89.9 } };
    assert.equal(niveles.cumpleNivel(experto, casi), false);
    assert.equal(niveles.cumpleNivel(experto, { ...casi, actividades: { ...casi.actividades, porcentaje: 90 } }), true);
  });
});

describe('Calendario del ICFES', () => {
  const base = {
    A: { convocatoria: 'Saber 11 Calendario A 2027', meses: 'entre finales de julio y agosto', fechas: [], fuente: null },
    B: { convocatoria: 'Saber 11 Calendario B 2027', meses: 'en marzo', fechas: [], fuente: null },
  };

  it('sin fecha oficial publicada no inventa días e informa los meses habituales', () => {
    const e = config.estadoCalendario('B', base, null, '2026-10-21');
    assert.equal(e.estado, 'sin_publicar');
    assert.equal(e.dias, null);
    assert.equal(e.fecha, null);
    assert.match(e.mensaje, /aún no ha publicado/);
    assert.match(e.mensaje, /en marzo/);
    assert.match(e.mensaje, /del Saber 11 Calendario B 2027/);
  });

  it('usa la fecha de la citación mientras no haya fecha oficial', () => {
    const e = config.estadoCalendario('B', base, '2027-03-14', '2026-10-21');
    assert.equal(e.estado, 'citacion');
    assert.equal(e.dias, 144);
    assert.equal(e.oficial, false);
  });

  it('con una fecha oficial la usa, y con varias pide elegir la de la citación', () => {
    const una = { ...base, A: { ...base.A, fechas: [{ fecha: '2027-08-08', descripcion: 'Aplicación' }], fuente: 'Resolución de prueba' } };
    const oficial = config.estadoCalendario('A', una, '2027-07-01', '2026-10-21');
    assert.equal(oficial.estado, 'oficial');
    assert.equal(oficial.fecha, '2027-08-08');

    const varias = { ...base, A: { ...base.A, fechas: [{ fecha: '2027-08-01', descripcion: 'Grupo 1' }, { fecha: '2027-08-08', descripcion: 'Grupo 2' }] } };
    assert.equal(config.estadoCalendario('A', varias, null, '2026-10-21').estado, 'varias');
    const elegida = config.estadoCalendario('A', varias, '2027-08-08', '2026-10-21');
    assert.equal(elegida.estado, 'elegida');
    assert.equal(elegida.fecha, '2027-08-08');
  });

  it('las fechas oficiales que ya pasaron no cuentan', () => {
    const pasada = { ...base, B: { ...base.B, fechas: [{ fecha: '2026-03-15', descripcion: 'Aplicación' }] } };
    assert.equal(config.estadoCalendario('B', pasada, null, '2026-10-21').estado, 'sin_publicar');
  });
});
