/**
 * Pruebas unitarias de la lógica pura (no requieren base de datos).
 * Ejecutar: npm test
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Los módulos leen la configuración al importarse: se definen valores de prueba.
process.env.DATABASE_URL ??= 'postgresql://prueba:prueba@localhost:5432/prueba';
process.env.JWT_SECRET ??= 'secreto-de-pruebas-unitarias-con-mas-de-32-caracteres';

let puntaje;
let progreso;
let practica;
let intenciones;
let fechas;
let texto;
let contenido;
let simulacros;
let aleatorio;
let recomendaciones;
let claude;

before(async () => {
  puntaje = await import('../../backend/src/services/puntaje.service.js');
  progreso = await import('../../backend/src/services/progreso.service.js');
  practica = await import('../../backend/src/services/practica.service.js');
  intenciones = await import('../../backend/src/services/vanty/intenciones.js');
  fechas = await import('../../backend/src/utils/fechas.js');
  texto = await import('../../backend/src/utils/texto.js');
  contenido = await import('../../backend/src/services/contenido.service.js');
  simulacros = await import('../../backend/src/services/simulacros.service.js');
  aleatorio = await import('../../backend/src/utils/aleatorio.js');
  recomendaciones = await import('../../backend/src/services/vanty/recomendaciones.js');
  claude = await import('../../backend/src/services/vanty/claude.js');
});

describe('Puntajes ICFES', () => {
  it('pondera el puntaje de un área por dificultad', () => {
    assert.equal(puntaje.puntajeArea([]), 0);
    assert.equal(puntaje.puntajeArea([{ dificultad: 1, correcta: true }, { dificultad: 3, correcta: false }]), 40);
    assert.equal(puntaje.puntajeArea([{ dificultad: 2, correcta: true }, { dificultad: 2, correcta: true }]), 100);
  });

  it('calcula el global como el ICFES: 5 × (3·MAT + 3·LEC + 3·SOC + 3·CIE + ING) / 13', () => {
    const areas = [
      { puntaje: 60, peso: 3 }, { puntaje: 70, peso: 3 }, { puntaje: 50, peso: 3 }, { puntaje: 65, peso: 3 }, { puntaje: 80, peso: 1 },
    ];
    const esperado = Math.round((5 * (3 * (60 + 70 + 50 + 65) + 80)) / 13);
    assert.equal(puntaje.puntajeGlobal(areas), esperado);
    assert.equal(puntaje.puntajeGlobal([{ puntaje: 100, peso: 3 }]), 500);
    assert.equal(puntaje.puntajeGlobal([]), 0);
  });

  it('asigna estrellas por porcentaje (50/70/90)', () => {
    assert.equal(puntaje.estrellasPara(49), 0);
    assert.equal(puntaje.estrellasPara(50), 1);
    assert.equal(puntaje.estrellasPara(75), 2);
    assert.equal(puntaje.estrellasPara(90), 3);
  });

  it('calcula la pendiente de una tendencia lineal', () => {
    assert.equal(puntaje.pendiente([{ x: 0, y: 50 }, { x: 1, y: 52 }, { x: 2, y: 54 }]), 2);
    assert.equal(puntaje.pendiente([{ x: 0, y: 50 }]), 0);
  });
});

describe('Dominio de subtemas y práctica adaptativa', () => {
  it('el dominio empieza como promedio simple y luego pondera lo reciente', () => {
    assert.equal(progreso.aplicarDominio(0, 0, [true]), 100);
    assert.equal(progreso.aplicarDominio(0, 0, [true, false]), 50);
    const conRecientesBuenas = progreso.aplicarDominio(0, 0, [false, false, false, false, false, true, true, true]);
    const conRecientesMalas = progreso.aplicarDominio(0, 0, [true, true, true, false, false, false, false, false]);
    assert.ok(conRecientesBuenas > conRecientesMalas, 'las respuestas recientes deben pesar más');
  });

  it('elige la dificultad objetivo según el dominio', () => {
    assert.equal(practica.dificultadObjetivo(0, 0), 1);
    assert.equal(practica.dificultadObjetivo(30, 5), 1);
    assert.equal(practica.dificultadObjetivo(55, 5), 2);
    assert.equal(practica.dificultadObjetivo(85, 5), 3);
  });

  it('prioriza preguntas nuevas sobre las ya acertadas', () => {
    const ahora = Date.now();
    const nueva = practica.prioridadPregunta({ veces: 0, dificultad: 2 }, 2, ahora);
    const acertadaHoy = practica.prioridadPregunta({ veces: 1, ultima: new Date(ahora - 3_600_000), ultima_correcta: true, dificultad: 2 }, 2, ahora);
    const fallada = practica.prioridadPregunta({ veces: 1, ultima: new Date(ahora - 3_600_000), ultima_correcta: false, dificultad: 2 }, 2, ahora);
    assert.ok(nueva > fallada && fallada > acertadaHoy);
  });
});

describe('Vanty: detección de intención', () => {
  const casos = [
    ['Hola Vanty', 'saludo'],
    ['¿Qué debo estudiar hoy?', 'recomendacion'],
    ['Genera una pregunta de geometría difícil', 'generar_pregunta'],
    ['Explícame mi último error', 'explicar_pregunta'],
    ['¿Cómo voy?', 'rendimiento'],
    ['Estoy muy estresado por el examen', 'motivacion'],
    ['Dame estrategias para el examen del ICFES', 'estrategia'],
    ['¿Qué es el teorema de Pitágoras?', 'duda_academica'],
  ];
  for (const [mensaje, esperada] of casos) {
    it(`"${mensaje}" → ${esperada}`, () => {
      assert.equal(intenciones.detectarIntencion(mensaje).intencion, esperada);
    });
  }

  it('reconoce materia, subtema y dificultad', () => {
    const r = intenciones.detectarIntencion('Genera una pregunta difícil de probabilidad');
    assert.equal(r.materia, 'matematicas');
    assert.equal(r.subtema, 'probabilidad');
    assert.equal(r.dificultad, 3);
  });

  it('un adjunto de pregunta implica explicar esa pregunta', () => {
    assert.equal(intenciones.detectarIntencion('¿por qué?', { adjunto: { pregunta_id: 3 } }).intencion, 'explicar_pregunta');
  });
});

describe('Utilidades de fechas y texto', () => {
  it('opera con fechas de calendario sin desfases', () => {
    assert.equal(fechas.diasEntre('2026-09-18', '2027-08-08'), 324);
    assert.equal(fechas.sumarDias('2026-12-31', 1), '2027-01-01');
    assert.equal(fechas.inicioSemana('2026-09-18'), '2026-09-14'); // viernes → lunes
    assert.ok(fechas.esFechaValida('2027-02-28'));
    assert.ok(!fechas.esFechaValida('2027-02-30'));
    assert.ok(!fechas.esFechaValida('mañana'));
  });

  it('normaliza y recorta textos', () => {
    assert.equal(texto.normalizar('  Pitágoras  '), 'pitagoras');
    assert.equal(texto.recortar('uno dos tres cuatro cinco seis', 15), 'uno dos tres…');
    assert.equal(texto.porcentaje(1, 3), 33.3);
    assert.equal(texto.porcentaje(1, 0), 0);
  });

  it('el barajado con semilla es reproducible', () => {
    const a = aleatorio.barajar([1, 2, 3, 4, 5, 6], aleatorio.crearGenerador(42));
    const b = aleatorio.barajar([1, 2, 3, 4, 5, 6], aleatorio.crearGenerador(42));
    assert.deepEqual(a, b);
    assert.deepEqual([...a].sort(), [1, 2, 3, 4, 5, 6]);
  });
});

describe('Validación del contenido académico', () => {
  const base = {
    codigo: 'MAT-ALG-99',
    subtema: 'algebra',
    dificultad: 2,
    enunciado: '¿Cuánto es 2 + 2?',
    explicacion: 'Se suman las unidades.',
    opciones: [
      { letra: 'A', texto: '3', correcta: false },
      { letra: 'B', texto: '4', correcta: true },
      { letra: 'C', texto: '5', correcta: false },
      { letra: 'D', texto: '22', correcta: false },
    ],
  };
  const subtemas = new Set(['algebra']);

  it('acepta una pregunta válida', () => {
    assert.deepEqual(contenido.validarPregunta(base, { subtemas }), []);
  });

  it('rechaza dos respuestas correctas, subtemas inexistentes y opciones incompletas', () => {
    const dosCorrectas = { ...base, opciones: base.opciones.map((o) => ({ ...o, correcta: true })) };
    assert.ok(contenido.validarPregunta(dosCorrectas, { subtemas }).some((e) => e.includes('1 opción correcta')));
    assert.ok(contenido.validarPregunta({ ...base, subtema: 'inventado' }, { subtemas }).some((e) => e.includes('no existe')));
    assert.ok(contenido.validarPregunta({ ...base, opciones: base.opciones.slice(0, 3) }, { subtemas }).some((e) => e.includes('4 opciones')));
  });
});

describe('Recomendaciones de un simulacro', () => {
  it('recomienda reforzar el área débil y no dejar preguntas en blanco', () => {
    const items = [
      { subtema_slug: 'reading', subtema_nombre: 'Reading', es_correcta: false, opcion_id: 1, tiempo_ms: 60000, tiempo_estimado_seg: 90 },
      { subtema_slug: 'reading', subtema_nombre: 'Reading', es_correcta: false, opcion_id: null, tiempo_ms: 0, tiempo_estimado_seg: 90 },
    ];
    const recs = simulacros.recomendacionesDeResultado({
      materias: [{ nombre: 'Inglés', puntaje: 0, items }],
      items,
      omitidas: 1,
      total: 2,
      porcentaje: 0,
      tiempoUsado: 60,
      tiempoDisponible: 1800,
      tipo: 'mini',
    });
    assert.ok(recs.some((r) => r.titulo === 'Refuerza Inglés'));
    assert.ok(recs.some((r) => r.titulo === 'No dejes preguntas en blanco'));
    assert.ok(recs.length <= 5);
  });
});

describe('Vanty: recomendaciones y preguntas generadas', () => {
  it('ordena las recomendaciones por prioridad (racha en riesgo, tema débil, cobertura, simulacro)', () => {
    const recs = recomendaciones.generarRecomendaciones({
      respondidas_total: 40,
      racha: { actual: 5, estudio_hoy: false },
      debilidades: [{ slug: 'probabilidad', nombre: 'Probabilidad', materia: 'Matemáticas', precision: 35, respondidas: 8 }],
      fortalezas: [],
      areas: [
        { slug: 'matematicas', nombre: 'Matemáticas', respondidas: 20, precision: 50, tiempo_seg: 100, tiempo_esperado_seg: 120 },
        { slug: 'ingles', nombre: 'Inglés', respondidas: 0, precision: null, tiempo_seg: null, tiempo_esperado_seg: null },
      ],
      dias_desde_simulacro: null,
      siguiente_nivel: null,
      icfes: { dias: 200 },
      meta_puntaje: null,
      proyeccion: null,
    });
    assert.deepEqual(recs.map((r) => r.tipo), ['racha', 'debilidad', 'cobertura', 'simulacro']);
    assert.equal(recs[1].accion.url, '/practica?subtema=probabilidad');
  });

  it('valida la estructura de una pregunta generada por la IA', () => {
    const valida = {
      contexto: 'Una tienda ofrece 20 % de descuento en un artículo de $100.000.',
      enunciado: '¿Cuál es el precio final?',
      opciones: [
        { texto: '$80.000', correcta: true, retroalimentacion: 'Correcto: se resta el descuento.' },
        { texto: '$20.000', correcta: false, retroalimentacion: 'Ese es el valor del descuento.' },
        { texto: '$100.000', correcta: false, retroalimentacion: 'Ese es el precio inicial.' },
        { texto: '$120.000', correcta: false, retroalimentacion: 'Sumaste el descuento en vez de restarlo.' },
      ],
      explicacion: 'El 20 % de 100.000 es 20.000; 100.000 − 20.000 = 80.000.',
      competencia: 'Formulación y ejecución',
    };
    assert.equal(claude.validarPreguntaGenerada(valida).opciones.length, 4);
    assert.throws(() => claude.validarPreguntaGenerada({ ...valida, opciones: valida.opciones.slice(0, 3) }), /4 opciones/);
    assert.throws(
      () => claude.validarPreguntaGenerada({ ...valida, opciones: valida.opciones.map((o) => ({ ...o, correcta: true })) }),
      /exactamente una/,
    );
  });
});
