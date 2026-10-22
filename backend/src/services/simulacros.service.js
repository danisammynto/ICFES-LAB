/**
 * Simulacros completos, minisimulacros y retos.
 *
 * Flujo:
 *   1. iniciarSimulacro   → selecciona las preguntas y crea el intento con sus sesiones.
 *   2. iniciarSesion      → arranca el cronómetro de la sesión (el tiempo lo controla el servidor).
 *   3. guardarRespuesta   → autoguardado de cada respuesta / marca de revisión.
 *   4. finalizarSesion    → pasa a la siguiente sesión o califica el intento.
 *   5. obtenerResultado   → puntaje, rendimiento por área, recomendaciones y revisión.
 *
 * Si una sesión vence sin que el estudiante la cierre, se cierra automáticamente en la
 * siguiente consulta; las preguntas sin responder cuentan como omitidas.
 */
import { pool, transaccion, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { AppError, conflicto, noEncontrado, solicitudInvalida } from '../utils/AppError.js';
import { barajar, crearGenerador, hashTexto } from '../utils/aleatorio.js';
import { cargarPreguntas } from './preguntas.service.js';
import { actualizarProgreso, registrarEstadistica } from './progreso.service.js';
import { registrarEstudio } from './racha.service.js';
import { otorgar, resumenJugador } from './gamificacion.service.js';
import { evaluarLogros } from './logros.service.js';
import { estrellasPara, puntajeArea, puntajeGlobal } from './puntaje.service.js';
import { porcentaje as calcularPorcentaje } from '../utils/texto.js';

// ---------------------------------------------------------------------------
// Banco de preguntas y tamaño estimado de cada plantilla
// ---------------------------------------------------------------------------

async function bancoPorMateria(cliente = pool) {
  const filas = await varias(
    `SELECT m.slug, count(p.id)::int AS total
       FROM materias m
       LEFT JOIN temas t ON t.materia_id = m.id
       LEFT JOIN subtemas s ON s.tema_id = t.id
       LEFT JOIN preguntas p ON p.subtema_id = s.id AND p.activa AND p.publica
      GROUP BY m.slug`,
    [],
    cliente,
  );
  return Object.fromEntries(filas.map((f) => [f.slug, f.total]));
}

/** Duración de una sesión: la configurada, o proporcional si el banco no alcanza. */
function duracionSesion(duracionMin, seleccionadas, solicitadas) {
  const completa = duracionMin * 60;
  if (seleccionadas >= solicitadas || solicitadas === 0) return completa;
  return Math.max(60 * seleccionadas, Math.round((completa * seleccionadas) / solicitadas));
}

/** Reparte `cantidad` entre las sesiones en proporción a lo que pide cada una. */
function repartir(cantidad, solicitudes) {
  const total = solicitudes.reduce((s, n) => s + n, 0);
  if (!total) return solicitudes.map(() => 0);
  const base = solicitudes.map((n) => Math.floor((cantidad * n) / total));
  let resto = cantidad - base.reduce((s, n) => s + n, 0);
  for (let i = 0; resto > 0 && i < base.length; i += 1) {
    if (solicitudes[i] > base[i]) {
      base[i] += 1;
      resto -= 1;
    }
  }
  return base;
}

/**
 * Cuántas preguntas tendrá cada sesión con el banco actual (sin seleccionarlas).
 * La clave "*" de la configuración se reparte entre todas las áreas.
 */
function estimarSesiones(config, banco) {
  const disponibleTotal = Object.values(banco).reduce((s, n) => s + n, 0);
  const solicitudPorMateria = {};
  for (const sesion of config.sesiones) {
    for (const [materia, n] of Object.entries(sesion.preguntas)) {
      solicitudPorMateria[materia] = (solicitudPorMateria[materia] ?? 0) + n;
    }
  }
  const tomar = {};
  for (const [materia, n] of Object.entries(solicitudPorMateria)) {
    tomar[materia] = Math.min(n, materia === '*' ? disponibleTotal : banco[materia] ?? 0);
  }
  const porSesion = config.sesiones.map(() => 0);
  const solicitadasPorSesion = config.sesiones.map((s) => Object.values(s.preguntas).reduce((a, b) => a + b, 0));
  for (const materia of Object.keys(tomar)) {
    const reparto = repartir(tomar[materia], config.sesiones.map((s) => s.preguntas[materia] ?? 0));
    reparto.forEach((n, i) => { porSesion[i] += n; });
  }
  return config.sesiones.map((s, i) => ({
    numero: s.numero,
    titulo: s.titulo,
    preguntas: porSesion[i],
    duracion_min: Math.round(duracionSesion(s.duracion_min, porSesion[i], solicitadasPorSesion[i]) / 60),
  }));
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export async function listarSimulacros(usuarioId) {
  const { nivel } = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1`, [usuarioId]);
  const plantillas = await varias(
    `SELECT id, tipo, numero, codigo, titulo, descripcion, icono, config, nivel_requerido,
            requiere_simulacro_id, porcentaje_aprobacion, xp_recompensa, monedas_recompensa
       FROM simulacros WHERE activo ORDER BY tipo, numero`,
  );
  const resumenes = await varias(
    `SELECT simulacro_id, count(*)::int AS intentos, max(puntaje_global) AS mejor_puntaje,
            max(porcentaje) AS mejor_porcentaje, max(estrellas) AS estrellas, bool_or(aprobado) AS aprobado,
            max(creado_en) AS ultima_fecha
       FROM resultados WHERE usuario_id = $1 GROUP BY simulacro_id`,
    [usuarioId],
  );
  const enCurso = await varias(
    `SELECT id, simulacro_id FROM intentos_simulacro WHERE usuario_id = $1 AND estado = 'en_curso'`,
    [usuarioId],
  );
  const banco = await bancoPorMateria();
  const resumenPor = new Map(resumenes.map((r) => [r.simulacro_id, r]));
  const enCursoPor = new Map(enCurso.map((i) => [i.simulacro_id, i.id]));

  const tarjeta = (s) => {
    const r = resumenPor.get(s.id);
    const sesiones = estimarSesiones(s.config, banco);
    return {
      id: s.id,
      tipo: s.tipo,
      numero: s.numero,
      codigo: s.codigo,
      titulo: s.titulo,
      descripcion: s.descripcion,
      icono: s.icono,
      sesiones,
      preguntas: sesiones.reduce((a, x) => a + x.preguntas, 0),
      // Preguntas de la estructura completa (p. ej. 254 en un simulacro completo del Saber 11). Si el banco
      // aún no alcanza, `preguntas` es menor y se usan todas las disponibles.
      preguntas_objetivo: s.config.sesiones.reduce((a, x) => a + Object.values(x.preguntas).reduce((b, n) => b + n, 0), 0),
      duracion_min: sesiones.reduce((a, x) => a + x.duracion_min, 0),
      recompensa: { xp: s.xp_recompensa, monedas: s.monedas_recompensa },
      intento_en_curso: enCursoPor.get(s.id) ?? null,
      intentos: r?.intentos ?? 0,
      completado: Boolean(r),
      mejor_puntaje: r?.mejor_puntaje ?? null,
      mejor_porcentaje: r?.mejor_porcentaje ?? null,
      estrellas: r?.estrellas ?? 0,
      ultima_fecha: r?.ultima_fecha ?? null,
    };
  };

  const completos = plantillas.filter((s) => s.tipo === 'completo').map(tarjeta);
  const minis = plantillas.filter((s) => s.tipo === 'mini').map((s) => ({
    ...tarjeta(s),
    bloqueado: s.requiere_simulacro_id != null && !resumenPor.has(s.requiere_simulacro_id),
  }));
  const retos = plantillas.filter((s) => s.tipo === 'reto').map((s) => ({
    ...tarjeta(s),
    nivel_requerido: s.nivel_requerido,
    porcentaje_aprobacion: s.porcentaje_aprobacion,
    bloqueado: s.nivel_requerido > nivel,
    superado: Boolean(resumenPor.get(s.id)?.aprobado),
  }));

  const estadisticas = await una(
    `SELECT count(*) FILTER (WHERE s.tipo = 'completo')::int AS completos,
            count(*) FILTER (WHERE s.tipo = 'mini')::int AS minis,
            round(avg(r.puntaje_global) FILTER (WHERE s.tipo = 'completo'))::int AS promedio_completos,
            round(avg(r.porcentaje))::int AS promedio_porcentaje
       FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
      WHERE r.usuario_id = $1`,
    [usuarioId],
  );

  return { completos, minis, retos, estadisticas, nivel };
}

export async function historial(usuarioId, limite = 20) {
  return varias(
    `SELECT r.intento_id, r.puntaje_global, r.porcentaje, r.aciertos, r.total, r.estrellas, r.aprobado,
            r.tiempo_usado_seg, r.creado_en, s.tipo, s.titulo, s.numero
       FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
      WHERE r.usuario_id = $1
      ORDER BY r.creado_en DESC
      LIMIT $2`,
    [usuarioId, limite],
  );
}

// ---------------------------------------------------------------------------
// Selección de preguntas
// ---------------------------------------------------------------------------

/** Agrupa preguntas que comparten contexto en "unidades" que se mantienen juntas. */
function agruparEnUnidades(preguntas) {
  const porContexto = new Map();
  const unidades = [];
  for (const p of preguntas) {
    if (p.contexto_id != null) {
      if (!porContexto.has(p.contexto_id)) {
        const unidad = [];
        porContexto.set(p.contexto_id, unidad);
        unidades.push(unidad);
      }
      porContexto.get(p.contexto_id).push(p);
    } else {
      unidades.push([p]);
    }
  }
  return unidades;
}

async function materiaMasDebil(cliente, usuarioId, materias) {
  const filas = await varias(
    `SELECT m.slug, count(r.id)::int AS n, avg(CASE WHEN r.es_correcta THEN 1.0 ELSE 0 END) AS precision
       FROM materias m
       LEFT JOIN respuestas r ON r.materia_id = m.id AND r.usuario_id = $1 AND r.creado_en > now() - interval '60 days'
      GROUP BY m.slug`,
    [usuarioId],
    cliente,
  );
  const candidatas = filas.filter((f) => materias.includes(f.slug));
  const conDatos = candidatas.filter((f) => f.n >= 3).sort((a, b) => a.precision - b.precision);
  if (conDatos.length) return conDatos[0].slug;
  return candidatas[Math.floor(Math.random() * candidatas.length)]?.slug ?? materias[0];
}

/**
 * Selecciona las preguntas de cada sesión según la configuración de la plantilla.
 *   fija          → barajado con semilla (mismo simulacro para todos)
 *   aleatoria     → barajado aleatorio
 *   adaptativa    → prioriza preguntas no vistas o falladas y subtemas débiles
 *   materia_debil → "*" se convierte en el área con menor precisión
 * Las preguntas dentro del rango de dificultad van primero; si no alcanzan, se completa
 * con otras dificultades.
 */
async function seleccionarPreguntas(cliente, usuarioId, simulacro) {
  const config = simulacro.config;
  const [dificultadMin, dificultadMax] = config.dificultad ?? [1, 3];
  const estrategia = config.seleccion ?? 'aleatoria';
  const aleatorio = estrategia === 'fija' ? crearGenerador(config.semilla ?? simulacro.id * 7919) : Math.random;

  const bancoFilas = await varias(
    `SELECT p.id, p.dificultad, p.contexto_id, p.subtema_id, m.slug AS materia
       FROM preguntas p
       JOIN subtemas s ON s.id = p.subtema_id
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
      WHERE p.activa AND p.publica
      ORDER BY p.id`,
    [],
    cliente,
  );
  const materias = [...new Set(bancoFilas.map((p) => p.materia))];

  // Historial del estudiante (solo para la estrategia adaptativa).
  const historialPregunta = new Map();
  const dominioSubtema = new Map();
  if (estrategia === 'adaptativa' || estrategia === 'materia_debil') {
    const hist = await varias(
      `SELECT DISTINCT ON (pregunta_id) pregunta_id, es_correcta
         FROM respuestas WHERE usuario_id = $1
        ORDER BY pregunta_id, creado_en DESC`,
      [usuarioId],
      cliente,
    );
    hist.forEach((h) => historialPregunta.set(h.pregunta_id, h.es_correcta));
    const dom = await varias(`SELECT subtema_id, dominio FROM progreso WHERE usuario_id = $1`, [usuarioId], cliente);
    dom.forEach((d) => dominioSubtema.set(d.subtema_id, d.dominio));
  }

  // Resuelve la clave "*" en cantidades por materia.
  const sesionesConfig = [];
  for (const sesion of config.sesiones) {
    const preguntas = { ...sesion.preguntas };
    if (preguntas['*']) {
      const n = preguntas['*'];
      delete preguntas['*'];
      if (estrategia === 'materia_debil') {
        const debil = await materiaMasDebil(cliente, usuarioId, materias);
        preguntas[debil] = (preguntas[debil] ?? 0) + n;
      } else {
        const orden = barajar(materias, aleatorio);
        for (let i = 0; i < n; i += 1) {
          const m = orden[i % orden.length];
          preguntas[m] = (preguntas[m] ?? 0) + 1;
        }
      }
    }
    sesionesConfig.push({ ...sesion, preguntas });
  }

  // Ordena las unidades de cada materia según la estrategia.
  const listaPorMateria = {};
  for (const materia of materias) {
    const deMateria = bancoFilas.filter((p) => p.materia === materia);
    let unidades = agruparEnUnidades(deMateria);
    const enRango = (u) => u.filter((p) => p.dificultad >= dificultadMin && p.dificultad <= dificultadMax).length / u.length;

    if (estrategia === 'adaptativa' || estrategia === 'materia_debil') {
      const valor = (u) => {
        const prioridad = u.reduce((s, p) => {
          const h = historialPregunta.get(p.id);
          const base = h === undefined ? 3 : h === false ? 2 : 0;
          const debilidad = (100 - (dominioSubtema.get(p.subtema_id) ?? 50)) / 50;
          return s + base + debilidad;
        }, 0) / u.length;
        return enRango(u) * 10 + prioridad + Math.random();
      };
      unidades = unidades.map((u) => ({ u, v: valor(u) })).sort((a, b) => b.v - a.v).map((x) => x.u);
    } else {
      const generadorMateria = estrategia === 'fija'
        ? crearGenerador((config.semilla ?? simulacro.id) + hashTexto(materia))
        : Math.random;
      unidades = barajar(unidades, generadorMateria)
        .map((u, i) => ({ u, i, r: enRango(u) }))
        .sort((a, b) => b.r - a.r || a.i - b.i)
        .map((x) => x.u);
    }
    listaPorMateria[materia] = unidades.flat();
  }

  // Reparte cada materia entre las sesiones y arma cada sesión mezclando áreas.
  const cursor = Object.fromEntries(materias.map((m) => [m, 0]));
  const repartoPorMateria = {};
  for (const materia of materias) {
    const solicitudes = sesionesConfig.map((s) => s.preguntas[materia] ?? 0);
    const disponibles = listaPorMateria[materia].length;
    repartoPorMateria[materia] = repartir(
      Math.min(disponibles, solicitudes.reduce((a, b) => a + b, 0)),
      solicitudes,
    );
  }

  return sesionesConfig.map((sesion, indice) => {
    const elegidas = [];
    for (const materia of materias) {
      const n = repartoPorMateria[materia][indice];
      elegidas.push(...listaPorMateria[materia].slice(cursor[materia], cursor[materia] + n));
      cursor[materia] += n;
    }
    // "Preguntas mezcladas": se barajan las unidades de todas las áreas (el contexto compartido
    // se mantiene junto).
    const unidades = barajar(agruparEnUnidades(elegidas), aleatorio);
    const ids = unidades.flat().map((p) => p.id);
    const solicitadas = Object.values(sesion.preguntas).reduce((a, b) => a + b, 0);
    return {
      numero: sesion.numero,
      titulo: sesion.titulo,
      duracion_seg: duracionSesion(sesion.duracion_min, ids.length, solicitadas),
      preguntas: ids,
    };
  });
}

// ---------------------------------------------------------------------------
// Intentos
// ---------------------------------------------------------------------------

export async function iniciarSimulacro(usuarioId, simulacroId) {
  return transaccion(async (cliente) => {
    const simulacro = await una(`SELECT * FROM simulacros WHERE id = $1 AND activo`, [simulacroId], cliente);
    if (!simulacro) throw noEncontrado('El simulacro no existe.');

    const enCurso = await una(
      `SELECT id FROM intentos_simulacro WHERE usuario_id = $1 AND simulacro_id = $2 AND estado = 'en_curso'`,
      [usuarioId, simulacroId],
      cliente,
    );
    if (enCurso) return { intento_id: enCurso.id, reanudado: true };

    const { nivel } = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1`, [usuarioId], cliente);
    if (simulacro.nivel_requerido > nivel) {
      throw new AppError(403, `Este reto se desbloquea en el nivel ${simulacro.nivel_requerido}.`, { codigo: 'BLOQUEADO' });
    }
    if (simulacro.requiere_simulacro_id) {
      const previo = await una(
        `SELECT 1 AS si FROM resultados WHERE usuario_id = $1 AND simulacro_id = $2 LIMIT 1`,
        [usuarioId, simulacro.requiere_simulacro_id],
        cliente,
      );
      if (!previo) throw new AppError(403, 'Completa el minisimulacro anterior para desbloquear este.', { codigo: 'BLOQUEADO' });
    }

    const sesiones = await seleccionarPreguntas(cliente, usuarioId, simulacro);
    if (!sesiones.some((s) => s.preguntas.length)) {
      throw conflicto('Todavía no hay preguntas suficientes en el banco para este simulacro.');
    }

    const intento = await una(
      `INSERT INTO intentos_simulacro (usuario_id, simulacro_id) VALUES ($1, $2) RETURNING id`,
      [usuarioId, simulacroId],
      cliente,
    );
    for (const sesion of sesiones.filter((s) => s.preguntas.length)) {
      await cliente.query(
        `INSERT INTO intento_sesiones (intento_id, numero, titulo, duracion_seg) VALUES ($1, $2, $3, $4)`,
        [intento.id, sesion.numero, sesion.titulo, sesion.duracion_seg],
      );
      await cliente.query(
        `INSERT INTO intento_preguntas (intento_id, pregunta_id, sesion_numero, orden)
         SELECT $1, x.pregunta_id, $2, x.orden
           FROM unnest($3::int[]) WITH ORDINALITY AS x(pregunta_id, orden)`,
        [intento.id, sesion.numero, sesion.preguntas],
      );
    }
    // Si alguna sesión quedó vacía, la actual es la primera con preguntas.
    const primera = sesiones.find((s) => s.preguntas.length);
    await cliente.query(`UPDATE intentos_simulacro SET sesion_actual = $2 WHERE id = $1`, [intento.id, primera.numero]);
    return { intento_id: intento.id, reanudado: false };
  });
}

async function bloquearIntento(cliente, usuarioId, intentoId) {
  const intento = await una(
    `SELECT i.id, i.estado, i.sesion_actual, i.simulacro_id
       FROM intentos_simulacro i
      WHERE i.id = $1 AND i.usuario_id = $2
      FOR UPDATE`,
    [intentoId, usuarioId],
    cliente,
  );
  if (!intento) throw noEncontrado('El intento no existe.');
  return intento;
}

function segundosRestantes(sesion, ahora = Date.now()) {
  if (!sesion.iniciada_en) return sesion.duracion_seg;
  const transcurridos = (ahora - new Date(sesion.iniciada_en).getTime()) / 1000;
  return Math.max(0, Math.round(sesion.duracion_seg - transcurridos));
}

/**
 * Cierra la sesión actual si su tiempo se agotó; si era la última, califica el intento.
 * Se ejecuta dentro de una transacción con el intento bloqueado.
 */
async function cerrarSesionVencida(cliente, usuarioId, intento) {
  if (intento.estado !== 'en_curso') return null;
  const sesion = await una(
    `SELECT numero, iniciada_en, duracion_seg, finalizada_en FROM intento_sesiones
      WHERE intento_id = $1 AND numero = $2`,
    [intento.id, intento.sesion_actual],
    cliente,
  );
  if (!sesion?.iniciada_en || sesion.finalizada_en) return null;
  const vencida = segundosRestantes(sesion) <= 0
    && Date.now() - new Date(sesion.iniciada_en).getTime() > (sesion.duracion_seg + REGLAS.simulacro.graciaSegundos) * 1000;
  if (!vencida) return null;
  return cerrarSesion(cliente, usuarioId, intento, sesion.numero);
}

async function cerrarSesion(cliente, usuarioId, intento, numero) {
  await cliente.query(
    `UPDATE intento_sesiones
        SET finalizada_en = LEAST(now(), iniciada_en + make_interval(secs => duracion_seg))
      WHERE intento_id = $1 AND numero = $2 AND finalizada_en IS NULL`,
    [intento.id, numero],
  );
  const siguiente = await una(
    `SELECT numero FROM intento_sesiones WHERE intento_id = $1 AND numero > $2 ORDER BY numero LIMIT 1`,
    [intento.id, numero],
    cliente,
  );
  if (siguiente) {
    await cliente.query(`UPDATE intentos_simulacro SET sesion_actual = $2 WHERE id = $1`, [intento.id, siguiente.numero]);
    intento.sesion_actual = siguiente.numero;
    return { siguiente_sesion: siguiente.numero, finalizado: false, eventos: [] };
  }
  const calificacion = await calificarIntento(cliente, usuarioId, intento.id);
  intento.estado = 'finalizado';
  return { finalizado: true, ...calificacion };
}

/** Estado completo del intento para el frontend. */
export async function obtenerIntento(usuarioId, intentoId) {
  const cierre = await transaccion(async (cliente) => {
    const intento = await bloquearIntento(cliente, usuarioId, intentoId);
    return cerrarSesionVencida(cliente, usuarioId, intento);
  });

  const intento = await una(
    `SELECT i.id, i.estado, i.sesion_actual, i.iniciado_en, i.finalizado_en,
            s.id AS simulacro_id, s.tipo, s.numero, s.titulo, s.descripcion, s.icono, s.porcentaje_aprobacion
       FROM intentos_simulacro i JOIN simulacros s ON s.id = i.simulacro_id
      WHERE i.id = $1 AND i.usuario_id = $2`,
    [intentoId, usuarioId],
  );
  const sesiones = await varias(
    `SELECT ses.numero, ses.titulo, ses.duracion_seg, ses.iniciada_en, ses.finalizada_en,
            count(ip.pregunta_id)::int AS total,
            count(ip.opcion_id)::int AS respondidas
       FROM intento_sesiones ses
       LEFT JOIN intento_preguntas ip ON ip.intento_id = ses.intento_id AND ip.sesion_numero = ses.numero
      WHERE ses.intento_id = $1
      GROUP BY ses.id
      ORDER BY ses.numero`,
    [intentoId],
  );

  const ahora = Date.now();
  const respuesta = {
    intento: {
      id: intento.id,
      estado: intento.estado,
      sesion_actual: intento.sesion_actual,
      iniciado_en: intento.iniciado_en,
      finalizado_en: intento.finalizado_en,
    },
    simulacro: {
      id: intento.simulacro_id,
      tipo: intento.tipo,
      numero: intento.numero,
      titulo: intento.titulo,
      descripcion: intento.descripcion,
      icono: intento.icono,
      porcentaje_aprobacion: intento.porcentaje_aprobacion,
    },
    sesiones: sesiones.map((s) => ({
      numero: s.numero,
      titulo: s.titulo,
      duracion_seg: s.duracion_seg,
      iniciada: Boolean(s.iniciada_en),
      finalizada: Boolean(s.finalizada_en),
      restante_seg: s.finalizada_en ? 0 : segundosRestantes(s, ahora),
      total: s.total,
      respondidas: s.respondidas,
    })),
    preguntas: [],
    sesion_cerrada_automaticamente: Boolean(cierre),
  };

  const actual = sesiones.find((s) => s.numero === intento.sesion_actual);
  if (intento.estado === 'en_curso' && actual?.iniciada_en && !actual.finalizada_en) {
    const filas = await varias(
      `SELECT pregunta_id, orden, opcion_id, marcada FROM intento_preguntas
        WHERE intento_id = $1 AND sesion_numero = $2 ORDER BY orden`,
      [intentoId, actual.numero],
    );
    const preguntas = await cargarPreguntas(filas.map((f) => f.pregunta_id));
    respuesta.preguntas = filas.map((f, i) => ({
      orden: f.orden,
      opcion_id: f.opcion_id,
      marcada: f.marcada,
      pregunta: preguntas[i],
    }));
  }
  return respuesta;
}

export async function iniciarSesion(usuarioId, intentoId, numero) {
  return transaccion(async (cliente) => {
    const intento = await bloquearIntento(cliente, usuarioId, intentoId);
    if (intento.estado !== 'en_curso') throw conflicto('Este simulacro ya terminó.');
    if (intento.sesion_actual !== numero) throw conflicto('Esa no es la sesión actual del simulacro.');
    await cliente.query(
      `UPDATE intento_sesiones SET iniciada_en = coalesce(iniciada_en, now())
        WHERE intento_id = $1 AND numero = $2`,
      [intentoId, numero],
    );
    return { ok: true };
  });
}

/**
 * Autoguardado de una respuesta. `cambios` puede incluir opcionId (número o null para
 * borrar la selección), marcada (booleano) y tiempoMs (tiempo adicional dedicado).
 */
export async function guardarRespuesta(usuarioId, intentoId, preguntaId, cambios) {
  return transaccion(async (cliente) => {
    const intento = await bloquearIntento(cliente, usuarioId, intentoId);
    if (intento.estado !== 'en_curso') throw conflicto('Este simulacro ya terminó.');

    const sesion = await una(
      `SELECT numero, iniciada_en, duracion_seg, finalizada_en FROM intento_sesiones
        WHERE intento_id = $1 AND numero = $2`,
      [intentoId, intento.sesion_actual],
      cliente,
    );
    if (!sesion?.iniciada_en || sesion.finalizada_en) throw conflicto('La sesión no está activa.');
    const transcurrido = (Date.now() - new Date(sesion.iniciada_en).getTime()) / 1000;
    if (transcurrido > sesion.duracion_seg + REGLAS.simulacro.graciaSegundos) {
      throw new AppError(409, 'Se acabó el tiempo de esta sesión.', { codigo: 'TIEMPO_AGOTADO' });
    }

    const fila = await una(
      `SELECT sesion_numero FROM intento_preguntas WHERE intento_id = $1 AND pregunta_id = $2`,
      [intentoId, preguntaId],
      cliente,
    );
    if (!fila || fila.sesion_numero !== sesion.numero) {
      throw solicitudInvalida('La pregunta no pertenece a la sesión actual.');
    }

    const tieneOpcion = Object.prototype.hasOwnProperty.call(cambios, 'opcionId');
    if (tieneOpcion && cambios.opcionId != null) {
      const opcion = await una(
        `SELECT 1 AS si FROM opciones WHERE id = $1 AND pregunta_id = $2`,
        [cambios.opcionId, preguntaId],
        cliente,
      );
      if (!opcion) throw solicitudInvalida('La opción no pertenece a la pregunta.');
    }

    const tiempo = Math.min(Math.max(0, Math.round(cambios.tiempoMs ?? 0)), REGLAS.topes.tiempoPreguntaMs);
    await cliente.query(
      `UPDATE intento_preguntas
          SET opcion_id = CASE WHEN $3 THEN $4::int ELSE opcion_id END,
              marcada = coalesce($5, marcada),
              tiempo_ms = tiempo_ms + $6,
              respondida_en = CASE WHEN $3 THEN now() ELSE respondida_en END
        WHERE intento_id = $1 AND pregunta_id = $2`,
      [intentoId, preguntaId, tieneOpcion, tieneOpcion ? cambios.opcionId : null, cambios.marcada ?? null, tiempo],
    );
    return { ok: true, guardado_en: new Date().toISOString() };
  });
}

export async function finalizarSesion(usuarioId, intentoId, numero) {
  return transaccion(async (cliente) => {
    const intento = await bloquearIntento(cliente, usuarioId, intentoId);
    if (intento.estado !== 'en_curso') throw conflicto('Este simulacro ya terminó.');
    if (intento.sesion_actual !== numero) throw conflicto('Esa no es la sesión actual del simulacro.');
    const sesion = await una(
      `SELECT iniciada_en FROM intento_sesiones WHERE intento_id = $1 AND numero = $2`,
      [intentoId, numero],
      cliente,
    );
    if (!sesion?.iniciada_en) throw conflicto('La sesión aún no ha comenzado.');
    return cerrarSesion(cliente, usuarioId, intento, numero);
  });
}

/** Entrega el simulacro completo (cierra todas las sesiones pendientes y califica). */
export async function finalizarIntento(usuarioId, intentoId) {
  return transaccion(async (cliente) => {
    const intento = await bloquearIntento(cliente, usuarioId, intentoId);
    if (intento.estado !== 'en_curso') throw conflicto('Este simulacro ya terminó.');
    await cliente.query(
      `UPDATE intento_sesiones
          SET finalizada_en = CASE WHEN iniciada_en IS NULL THEN now()
                                   ELSE LEAST(now(), iniciada_en + make_interval(secs => duracion_seg)) END
        WHERE intento_id = $1 AND finalizada_en IS NULL`,
      [intentoId],
    );
    return { finalizado: true, ...(await calificarIntento(cliente, usuarioId, intentoId)) };
  });
}

export async function abandonarIntento(usuarioId, intentoId) {
  return transaccion(async (cliente) => {
    const intento = await bloquearIntento(cliente, usuarioId, intentoId);
    if (intento.estado !== 'en_curso') throw conflicto('Este simulacro ya terminó.');
    await cliente.query(
      `UPDATE intentos_simulacro SET estado = 'abandonado', finalizado_en = now() WHERE id = $1`,
      [intentoId],
    );
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Calificación
// ---------------------------------------------------------------------------

async function calificarIntento(cliente, usuarioId, intentoId) {
  const intento = await una(
    `SELECT i.id, i.simulacro_id, s.tipo, s.titulo, s.xp_recompensa, s.monedas_recompensa, s.porcentaje_aprobacion
       FROM intentos_simulacro i JOIN simulacros s ON s.id = i.simulacro_id
      WHERE i.id = $1`,
    [intentoId],
    cliente,
  );

  await cliente.query(
    `UPDATE intento_preguntas ip
        SET es_correcta = coalesce((SELECT o.es_correcta FROM opciones o WHERE o.id = ip.opcion_id), FALSE)
      WHERE ip.intento_id = $1`,
    [intentoId],
  );

  const items = await varias(
    `SELECT ip.pregunta_id, ip.opcion_id, ip.es_correcta, ip.tiempo_ms, ip.sesion_numero,
            p.dificultad, p.subtema_id, p.tiempo_estimado_seg,
            s.nombre AS subtema_nombre, s.slug AS subtema_slug,
            m.id AS materia_id, m.slug AS materia_slug, m.nombre AS materia_nombre, m.peso_global, m.orden
       FROM intento_preguntas ip
       JOIN preguntas p ON p.id = ip.pregunta_id
       JOIN subtemas s ON s.id = p.subtema_id
       JOIN temas t ON t.id = s.tema_id
       JOIN materias m ON m.id = t.materia_id
      WHERE ip.intento_id = $1
      ORDER BY ip.sesion_numero, ip.orden`,
    [intentoId],
    cliente,
  );
  const sesiones = await varias(
    `SELECT duracion_seg, iniciada_en, finalizada_en FROM intento_sesiones WHERE intento_id = $1`,
    [intentoId],
    cliente,
  );

  const total = items.length;
  const aciertos = items.filter((i) => i.es_correcta).length;
  const omitidas = items.filter((i) => i.opcion_id == null).length;
  const errores = total - aciertos - omitidas;
  const porcentaje = calcularPorcentaje(aciertos, total);
  const tiempoUsado = sesiones.reduce((suma, s) => {
    if (!s.iniciada_en) return suma;
    const fin = s.finalizada_en ? new Date(s.finalizada_en).getTime() : Date.now();
    return suma + Math.min(s.duracion_seg, Math.max(0, Math.round((fin - new Date(s.iniciada_en).getTime()) / 1000)));
  }, 0);
  const tiempoDisponible = sesiones.reduce((suma, s) => suma + s.duracion_seg, 0);

  // Rendimiento por área.
  const porMateria = new Map();
  for (const item of items) {
    if (!porMateria.has(item.materia_id)) {
      porMateria.set(item.materia_id, { materia_id: item.materia_id, slug: item.materia_slug, nombre: item.materia_nombre, peso: item.peso_global, orden: item.orden, items: [] });
    }
    porMateria.get(item.materia_id).items.push(item);
  }
  const materias = [...porMateria.values()].sort((a, b) => a.orden - b.orden).map((m) => {
    const respondidas = m.items.filter((i) => i.opcion_id != null);
    return {
      ...m,
      aciertos: m.items.filter((i) => i.es_correcta).length,
      total: m.items.length,
      puntaje: puntajeArea(m.items.map((i) => ({ dificultad: i.dificultad, correcta: i.es_correcta }))),
      tiempo_promedio_ms: respondidas.length
        ? Math.round(respondidas.reduce((s, i) => s + i.tiempo_ms, 0) / respondidas.length)
        : 0,
    };
  });
  const global = puntajeGlobal(materias);
  const estrellas = estrellasPara(porcentaje);
  const aprobado = porcentaje >= intento.porcentaje_aprobacion;

  // Registro en el historial de respuestas (solo las contestadas) y estadísticas.
  const respondidas = items.filter((i) => i.opcion_id != null);
  const origen = intento.tipo === 'reto' ? 'reto' : 'simulacro';
  if (respondidas.length) {
    await cliente.query(
      `INSERT INTO respuestas (usuario_id, pregunta_id, opcion_id, materia_id, subtema_id, es_correcta, tiempo_ms, origen, intento_id)
       SELECT $1, ip.pregunta_id, ip.opcion_id, t.materia_id, p.subtema_id, ip.es_correcta,
              LEAST(ip.tiempo_ms, $4), $2, $3
         FROM intento_preguntas ip
         JOIN preguntas p ON p.id = ip.pregunta_id
         JOIN subtemas s ON s.id = p.subtema_id
         JOIN temas t ON t.id = s.tema_id
        WHERE ip.intento_id = $3 AND ip.opcion_id IS NOT NULL`,
      [usuarioId, origen, intentoId, REGLAS.topes.tiempoPreguntaMs],
    );
  }

  const eventos = [];
  for (const m of materias) {
    const contestadas = m.items.filter((i) => i.opcion_id != null);
    if (!contestadas.length) continue;
    await registrarEstadistica(cliente, usuarioId, m.materia_id, {
      respondidas: contestadas.length,
      correctas: contestadas.filter((i) => i.es_correcta).length,
      tiempoMs: contestadas.reduce((s, i) => s + Math.min(i.tiempo_ms, REGLAS.topes.tiempoPreguntaMs), 0),
    });
  }
  const porSubtema = new Map();
  for (const item of respondidas) {
    if (!porSubtema.has(item.subtema_id)) porSubtema.set(item.subtema_id, []);
    porSubtema.get(item.subtema_id).push(item.es_correcta);
  }
  for (const [subtemaId, resultados] of porSubtema) {
    eventos.push(...(await actualizarProgreso(cliente, usuarioId, subtemaId, resultados)));
  }

  eventos.push(...(await registrarEstudio(cliente, usuarioId, {
    segundos: tiempoUsado,
    preguntas: respondidas.length,
    correctas: aciertos,
    simulacros: 1,
  })));

  // Recompensas: completas la primera vez; reducidas en repeticiones.
  const previos = await una(
    `SELECT count(*)::int AS n FROM resultados WHERE usuario_id = $1 AND simulacro_id = $2`,
    [usuarioId, intento.simulacro_id],
    cliente,
  );
  const factor = previos.n > 0 ? REGLAS.factorRepeticionSimulacro : 1;
  let xp = aciertos * REGLAS.xp.bonusPorAciertoSimulacro;
  let monedas = 0;
  if (intento.tipo !== 'reto' || aprobado) {
    xp += intento.xp_recompensa;
    monedas += intento.monedas_recompensa + (intento.tipo !== 'completo' ? estrellas * REGLAS.monedas.porEstrella : 0);
  }
  xp = Math.round(xp * factor);
  monedas = Math.round(monedas * factor);
  eventos.push(...(await otorgar(cliente, usuarioId, { xp, monedas, motivo: `simulacro_${intento.tipo}`, referencia: `intento:${intentoId}` })));

  const recomendaciones = recomendacionesDeResultado({
    materias,
    items,
    omitidas,
    total,
    porcentaje,
    tiempoUsado,
    tiempoDisponible,
    tipo: intento.tipo,
  });

  const resultado = await una(
    `INSERT INTO resultados (intento_id, usuario_id, simulacro_id, puntaje_global, porcentaje, aciertos, errores, omitidas,
                             total, tiempo_usado_seg, estrellas, aprobado, xp_ganado, monedas_ganadas, recomendaciones)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [intentoId, usuarioId, intento.simulacro_id, global, porcentaje, aciertos, errores, omitidas, total,
      tiempoUsado, estrellas, aprobado, xp, monedas, JSON.stringify(recomendaciones)],
    cliente,
  );
  for (const m of materias) {
    await cliente.query(
      `INSERT INTO resultados_materia (resultado_id, materia_id, aciertos, total, puntaje, tiempo_promedio_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [resultado.id, m.materia_id, m.aciertos, m.total, m.puntaje, m.tiempo_promedio_ms],
    );
  }
  await cliente.query(
    `UPDATE intentos_simulacro SET estado = 'finalizado', finalizado_en = now(), tiempo_usado_seg = $2 WHERE id = $1`,
    [intentoId, tiempoUsado],
  );

  eventos.push(...(await evaluarLogros(cliente, usuarioId, { estudio: true })));
  return { resultado_id: resultado.id, eventos, jugador: await resumenJugador(cliente, usuarioId) };
}

/** Recomendaciones automáticas a partir del resultado de un simulacro. */
export function recomendacionesDeResultado({ materias, items, omitidas, total, porcentaje, tiempoUsado, tiempoDisponible, tipo }) {
  const recs = [];

  const debiles = materias.filter((m) => m.puntaje < 60).sort((a, b) => a.puntaje - b.puntaje).slice(0, 2);
  for (const m of debiles) {
    const subtemas = new Map();
    for (const i of m.items) {
      if (!subtemas.has(i.subtema_slug)) subtemas.set(i.subtema_slug, { nombre: i.subtema_nombre, slug: i.subtema_slug, ok: 0, n: 0 });
      const s = subtemas.get(i.subtema_slug);
      s.n += 1;
      if (i.es_correcta) s.ok += 1;
    }
    const peor = [...subtemas.values()].sort((a, b) => a.ok / a.n - b.ok / b.n)[0];
    recs.push({
      tipo: 'debilidad',
      titulo: `Refuerza ${m.nombre}`,
      texto: `Obtuviste ${m.puntaje}/100 en ${m.nombre}. Empieza por ${peor.nombre}: acertaste ${peor.ok} de ${peor.n}.`,
      accion: { etiqueta: `Practicar ${peor.nombre}`, url: `/practica?subtema=${peor.slug}` },
    });
  }

  if (omitidas > 0) {
    recs.push({
      tipo: 'estrategia',
      titulo: 'No dejes preguntas en blanco',
      texto: `Dejaste ${omitidas} de ${total} sin responder. En el ICFES una pregunta omitida vale lo mismo que una incorrecta: descarta opciones y elige la más probable.`,
      accion: null,
    });
  }

  const contestadas = items.filter((i) => i.opcion_id != null);
  if (contestadas.length) {
    const promedioSeg = contestadas.reduce((s, i) => s + i.tiempo_ms, 0) / contestadas.length / 1000;
    const esperadoSeg = contestadas.reduce((s, i) => s + i.tiempo_estimado_seg, 0) / contestadas.length;
    if (promedioSeg > esperadoSeg * 1.4) {
      recs.push({
        tipo: 'tiempo',
        titulo: 'Trabaja tu ritmo',
        texto: `Tardaste en promedio ${Math.round(promedioSeg)} s por pregunta (lo recomendable es cerca de ${Math.round(esperadoSeg)} s). Practica con el reto Relámpago para ganar agilidad.`,
        accion: { etiqueta: 'Ver retos', url: '/logros#retos' },
      });
    } else if (tiempoUsado < tiempoDisponible * 0.4 && porcentaje < 60) {
      recs.push({
        tipo: 'tiempo',
        titulo: 'Usa todo tu tiempo',
        texto: 'Terminaste muy rápido y con varios errores. Relee los contextos y verifica cada opción antes de responder.',
        accion: null,
      });
    }
  }

  if (porcentaje >= 80) {
    recs.push({
      tipo: 'fortaleza',
      titulo: '¡Excelente resultado!',
      texto: tipo === 'mini'
        ? 'Estás listo para el siguiente minisimulacro del camino. ¡Sigue así!'
        : 'Pon a prueba tu nivel con un reto o un simulacro completo.',
      accion: { etiqueta: 'Ir a simulacros', url: '/simulacros' },
    });
  }

  recs.push({
    tipo: 'vanty',
    titulo: 'Repasa tus errores con Vanty',
    texto: 'Pídele a Vanty que te explique las preguntas que fallaste y te proponga ejercicios similares.',
    accion: { etiqueta: 'Hablar con Vanty', url: '/vanty' },
  });
  return recs.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Resultado y revisión
// ---------------------------------------------------------------------------

export async function obtenerResultado(usuarioId, intentoId) {
  const resultado = await una(
    `SELECT r.*, s.tipo, s.titulo, s.numero, s.porcentaje_aprobacion, s.id AS simulacro_id
       FROM resultados r JOIN simulacros s ON s.id = r.simulacro_id
      WHERE r.intento_id = $1 AND r.usuario_id = $2`,
    [intentoId, usuarioId],
  );
  if (!resultado) throw noEncontrado('El resultado no existe o el simulacro aún no ha terminado.');

  const materias = await varias(
    `SELECT rm.aciertos, rm.total, rm.puntaje, rm.tiempo_promedio_ms,
            m.slug, m.nombre, m.nombre_corto, m.color, m.icono
       FROM resultados_materia rm JOIN materias m ON m.id = rm.materia_id
      WHERE rm.resultado_id = $1
      ORDER BY m.orden`,
    [resultado.id],
  );

  const filas = await varias(
    `SELECT pregunta_id, sesion_numero, orden, opcion_id, es_correcta, tiempo_ms, marcada
       FROM intento_preguntas WHERE intento_id = $1
      ORDER BY sesion_numero, orden`,
    [intentoId],
  );
  const preguntas = await cargarPreguntas(filas.map((f) => f.pregunta_id), { conSolucion: true });
  const revision = filas.map((f, i) => ({
    sesion: f.sesion_numero,
    orden: f.orden,
    opcion_id: f.opcion_id,
    correcta: f.es_correcta,
    omitida: f.opcion_id == null,
    tiempo_ms: f.tiempo_ms,
    marcada: f.marcada,
    pregunta: preguntas[i],
  }));

  const anterior = await una(
    `SELECT puntaje_global, porcentaje, creado_en FROM resultados
      WHERE usuario_id = $1 AND simulacro_id = $2 AND creado_en < $3
      ORDER BY creado_en DESC LIMIT 1`,
    [usuarioId, resultado.simulacro_id, resultado.creado_en],
  );
  const siguienteMini = resultado.tipo === 'mini'
    ? await una(`SELECT id, titulo FROM simulacros WHERE tipo = 'mini' AND numero = $1 AND activo`, [resultado.numero + 1])
    : null;

  return {
    resultado: {
      intento_id: intentoId,
      tipo: resultado.tipo,
      titulo: resultado.titulo,
      numero: resultado.numero,
      puntaje_global: resultado.puntaje_global,
      porcentaje: resultado.porcentaje,
      aciertos: resultado.aciertos,
      errores: resultado.errores,
      omitidas: resultado.omitidas,
      total: resultado.total,
      tiempo_usado_seg: resultado.tiempo_usado_seg,
      estrellas: resultado.estrellas,
      aprobado: resultado.aprobado,
      porcentaje_aprobacion: resultado.porcentaje_aprobacion,
      xp_ganado: resultado.xp_ganado,
      monedas_ganadas: resultado.monedas_ganadas,
      recomendaciones: resultado.recomendaciones,
      creado_en: resultado.creado_en,
    },
    materias,
    revision,
    anterior,
    siguiente: siguienteMini,
  };
}
