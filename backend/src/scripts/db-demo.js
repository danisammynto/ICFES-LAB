/**
 * Datos de demostración (solo para desarrollo y presentaciones).
 *
 * Crea (o recrea) dos cuentas con historial realista de 6 semanas:
 *   · Estudiante:     demo@icfeslab.co  / IcfesLab2026
 *   · Administrador:  admin@icfeslab.co / AdminLab2026
 *
 * Uso: npm run db:demo      (en producción exige --forzar)
 */
import { env } from '../config/env.js';
import { pool, transaccion, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { crearGenerador } from '../utils/aleatorio.js';
import { fechaLocal, sumarDias } from '../utils/fechas.js';
import { hashPassword } from '../services/auth.service.js';
import { aplicarDominio } from '../services/progreso.service.js';
import { estrellasPara, puntajeArea, puntajeGlobal } from '../services/puntaje.service.js';
import { evaluarLogros } from '../services/logros.service.js';
import { recomendacionesDeResultado } from '../services/simulacros.service.js';

const ESTUDIANTE = { email: 'demo@icfeslab.co', password: 'IcfesLab2026', nombre: 'Valentina Ríos Cárdenas' };
const ADMIN = { email: 'admin@icfeslab.co', password: 'AdminLab2026', nombre: 'Administración ICFES Lab' };
const DIAS = 42;

if (env.esProduccion && !process.argv.includes('--forzar')) {
  console.error('✖ db:demo está pensado para desarrollo. Usa --forzar si de verdad quieres ejecutarlo en producción.');
  process.exit(1);
}

const azar = crearGenerador(20260918);
const entre = (min, max) => min + Math.floor(azar() * (max - min + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

// Perfil de habilidad: precisión inicial y mejora a lo largo de las 6 semanas.
const HABILIDAD = {
  matematicas: [0.5, 0.2],
  'lectura-critica': [0.66, 0.12],
  'ciencias-naturales': [0.48, 0.16],
  'sociales-ciudadanas': [0.58, 0.1],
  ingles: [0.4, 0.14],
};

/** Instante local (UTC-5 en Colombia) para una fecha y hora. */
function instante(fecha, hora, minuto) {
  const desfase = env.zonaHoraria === 'America/Bogota' ? '-05:00' : 'Z';
  return new Date(`${fecha}T${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00${desfase}`);
}

/** Días con estudio: dos rachas largas (12 y 9 días) y días sueltos. Hoy queda pendiente. */
function diaActivo(desdeHoy) {
  if (desdeHoy === 0) return false;
  if (desdeHoy >= 1 && desdeHoy <= 9) return true;
  if (desdeHoy === 10) return false;
  if (desdeHoy >= 20 && desdeHoy <= 31) return true;
  if (desdeHoy === 32) return false;
  return azar() < 0.58;
}

async function main() {
  const hoy = fechaLocal();
  const resumen = await transaccion(async (cliente) => {
    await cliente.query(`DELETE FROM usuarios WHERE lower(email) IN ($1, $2)`, [ESTUDIANTE.email, ADMIN.email]);

    await cliente.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, 'admin')`,
      [ADMIN.nombre, ADMIN.email, await hashPassword(ADMIN.password)],
    );
    const { id: usuarioId } = await una(
      `INSERT INTO usuarios (nombre, email, password_hash, ultimo_acceso, creado_en)
       VALUES ($1, $2, $3, now(), now() - interval '43 days') RETURNING id`,
      [ESTUDIANTE.nombre, ESTUDIANTE.email, await hashPassword(ESTUDIANTE.password)],
      cliente,
    );
    await cliente.query(
      `UPDATE perfiles SET nombre_mostrar = 'Valentina', grado = '11', colegio = 'Institución Educativa Demo',
              ciudad = 'Medellín', meta_diaria_min = 30, meta_puntaje = 330,
              bio = 'Quiero estudiar Ingeniería Biomédica. ¡Vamos por los 330 puntos!'
        WHERE usuario_id = $1`,
      [usuarioId],
    );

    // Banco de preguntas con su materia y opciones.
    const preguntas = await varias(
      `SELECT p.id, p.subtema_id, p.dificultad, p.tiempo_estimado_seg, t.materia_id, m.slug AS materia, m.nombre AS materia_nombre,
              m.peso_global, s.slug AS subtema_slug, s.nombre AS subtema_nombre,
              (SELECT id FROM opciones o WHERE o.pregunta_id = p.id AND o.es_correcta) AS correcta,
              (SELECT array_agg(id) FROM opciones o WHERE o.pregunta_id = p.id AND NOT o.es_correcta) AS incorrectas
         FROM preguntas p JOIN subtemas s ON s.id = p.subtema_id JOIN temas t ON t.id = s.tema_id JOIN materias m ON m.id = t.materia_id
        WHERE p.activa AND p.publica
        ORDER BY p.codigo`,
      [],
      cliente,
    );
    if (!preguntas.length) throw new Error('No hay preguntas en el banco. Ejecuta primero npm run db:setup.');
    const lecciones = await varias(
      `SELECT l.id, l.subtema_id, l.xp_recompensa, l.monedas_recompensa FROM lecciones l
         JOIN subtemas s ON s.id = l.subtema_id JOIN temas t ON t.id = s.tema_id
        WHERE l.activa AND s.nivel_requerido = 1 ORDER BY t.orden, s.orden`,
      [],
      cliente,
    );

    const respuestas = [];
    const actividad = new Map();
    const estadisticas = new Map();
    const resultadosPorSubtema = new Map();
    let xp = 0;
    let monedas = 50;

    const registrar = (fecha, campo, valor) => {
      const fila = actividad.get(fecha) ?? { segundos: 0, xp: 0, monedas: 0, preguntas: 0, correctas: 0, lecciones: 0, simulacros: 0 };
      fila[campo] += valor;
      actividad.set(fecha, fila);
    };
    const responder = (pregunta, fecha, momento, { avance, origen = 'practica', intentoId = null, segundos = null }) => {
      const [base, mejora] = HABILIDAD[pregunta.materia];
      const ajuste = pregunta.dificultad === 3 ? -0.1 : pregunta.dificultad === 1 ? 0.08 : 0;
      const acierta = azar() < Math.min(0.95, Math.max(0.1, base + mejora * avance + ajuste));
      const tiempo = Math.round((segundos ?? pregunta.tiempo_estimado_seg * (0.6 + azar() * 0.7)) * 1000);
      respuestas.push({ pregunta, opcion: acierta ? pregunta.correcta : elegir(pregunta.incorrectas), acierta, tiempo, origen, intentoId, momento });
      const clave = `${pregunta.materia_id}|${fecha}`;
      const est = estadisticas.get(clave) ?? { materia: pregunta.materia_id, fecha, n: 0, ok: 0, ms: 0 };
      est.n += 1;
      est.ok += acierta ? 1 : 0;
      est.ms += tiempo;
      estadisticas.set(clave, est);
      if (!resultadosPorSubtema.has(pregunta.subtema_id)) resultadosPorSubtema.set(pregunta.subtema_id, []);
      resultadosPorSubtema.get(pregunta.subtema_id).push(acierta);
      registrar(fecha, 'preguntas', 1);
      registrar(fecha, 'correctas', acierta ? 1 : 0);
      if (origen === 'practica') {
        registrar(fecha, 'segundos', tiempo / 1000);
        const ganado = acierta ? REGLAS.xp.correctaPorDificultad[pregunta.dificultad] : REGLAS.xp.incorrecta;
        xp += ganado;
        registrar(fecha, 'xp', ganado);
        if (acierta) { monedas += 1; registrar(fecha, 'monedas', 1); }
      }
      return acierta;
    };

    // Simulacros presentados: [días atrás, código]
    const simulacrosProgramados = new Map([[34, 'mini-1'], [21, 'mini-2'], [8, 'mini-3'], [5, 'simulacro-1']]);
    const plantillas = new Map((await varias(`SELECT id, codigo, tipo, titulo, xp_recompensa, monedas_recompensa FROM simulacros`, [], cliente)).map((s) => [s.codigo, s]));
    let leccionesHechas = 0;
    let diasActivos = 0;

    for (let atras = DIAS; atras >= 0; atras -= 1) {
      const fecha = sumarDias(hoy, -atras);
      const avance = (DIAS - atras) / DIAS;
      const simulacro = simulacrosProgramados.get(atras);
      if (!diaActivo(atras) && !simulacro) continue;
      diasActivos += 1;
      xp += REGLAS.xp.rachaDiaria;
      registrar(fecha, 'xp', REGLAS.xp.rachaDiaria);

      // Lección (aprox. uno de cada tres días activos).
      if (leccionesHechas < 12 && diasActivos % 3 === 1 && lecciones[leccionesHechas]) {
        const leccion = lecciones[leccionesHechas];
        const tiempo = entre(380, 720);
        await cliente.query(
          `INSERT INTO lecciones_completadas (usuario_id, leccion_id, completada_en, tiempo_seg, aciertos_ejercicios, total_ejercicios)
           VALUES ($1, $2, $3, $4, 2, 2)`,
          [usuarioId, leccion.id, instante(fecha, 16, entre(0, 50)), tiempo],
        );
        xp += leccion.xp_recompensa;
        monedas += leccion.monedas_recompensa;
        registrar(fecha, 'segundos', tiempo);
        registrar(fecha, 'lecciones', 1);
        registrar(fecha, 'xp', leccion.xp_recompensa);
        leccionesHechas += 1;
      }

      // Práctica del día.
      const cantidad = entre(8, 20);
      for (let i = 0; i < cantidad; i += 1) {
        responder(elegir(preguntas), fecha, instante(fecha, entre(17, 21), entre(0, 59)), { avance });
      }

      // Simulacro programado para ese día.
      if (simulacro) {
        const plantilla = plantillas.get(simulacro);
        const elegidas = plantilla.tipo === 'completo'
          ? preguntas
          : Object.keys(HABILIDAD).flatMap((materia) => preguntas.filter((p) => p.materia === materia).sort(() => azar() - 0.5).slice(0, 4));
        const inicio = instante(fecha, 8, 0);
        const duracion = plantilla.tipo === 'completo' ? 100 * 60 : 30 * 60;
        const usado = Math.round(duracion * (0.7 + azar() * 0.25));
        const { id: intentoId } = await una(
          `INSERT INTO intentos_simulacro (usuario_id, simulacro_id, estado, sesion_actual, iniciado_en, finalizado_en, tiempo_usado_seg)
           VALUES ($1, $2, 'finalizado', 1, $3, $4, $5) RETURNING id`,
          [usuarioId, plantilla.id, inicio, new Date(inicio.getTime() + usado * 1000), usado],
          cliente,
        );
        await cliente.query(
          `INSERT INTO intento_sesiones (intento_id, numero, titulo, duracion_seg, iniciada_en, finalizada_en)
           VALUES ($1, 1, $2, $3, $4, $5)`,
          [intentoId, plantilla.tipo === 'completo' ? 'Sesión 1' : plantilla.titulo, duracion, inicio, new Date(inicio.getTime() + usado * 1000)],
        );
        const items = [];
        for (const [orden, pregunta] of elegidas.entries()) {
          const omitida = azar() < 0.04;
          const segundos = (usado / elegidas.length) * (0.7 + azar() * 0.6);
          let acierta = false;
          let opcion = null;
          if (!omitida) {
            acierta = responder(pregunta, fecha, new Date(inicio.getTime() + orden * 60_000), { avance, origen: 'simulacro', intentoId, segundos });
            opcion = respuestas[respuestas.length - 1].opcion;
          }
          items.push({
            pregunta,
            acierta,
            opcion,
            // Campos que usa recomendacionesDeResultado().
            opcion_id: opcion,
            es_correcta: acierta,
            tiempo_ms: Math.round(segundos * 1000),
            tiempo_estimado_seg: pregunta.tiempo_estimado_seg,
            subtema_slug: pregunta.subtema_slug,
            subtema_nombre: pregunta.subtema_nombre,
          });
          await cliente.query(
            `INSERT INTO intento_preguntas (intento_id, pregunta_id, sesion_numero, orden, opcion_id, es_correcta, tiempo_ms, respondida_en)
             VALUES ($1, $2, 1, $3, $4, $5, $6, $7)`,
            [intentoId, pregunta.id, orden + 1, opcion, acierta, Math.round(segundos * 1000), omitida ? null : inicio],
          );
        }
        const porMateria = Object.keys(HABILIDAD).map((materia) => {
          const deMateria = items.filter((i) => i.pregunta.materia === materia);
          return {
            materia_id: deMateria[0]?.pregunta.materia_id,
            nombre: deMateria[0]?.pregunta.materia_nombre,
            items: deMateria,
            peso: deMateria[0]?.pregunta.peso_global ?? 1,
            aciertos: deMateria.filter((i) => i.acierta).length,
            total: deMateria.length,
            puntaje: puntajeArea(deMateria.map((i) => ({ dificultad: i.pregunta.dificultad, correcta: i.acierta }))),
          };
        }).filter((m) => m.total);
        const aciertos = items.filter((i) => i.acierta).length;
        const omitidas = items.filter((i) => i.opcion == null).length;
        const porcentaje = Math.round((1000 * aciertos) / items.length) / 10;
        const ganado = plantilla.xp_recompensa + aciertos * REGLAS.xp.bonusPorAciertoSimulacro;
        const estrellas = estrellasPara(porcentaje);
        const monedasGanadas = plantilla.monedas_recompensa + (plantilla.tipo === 'mini' ? estrellas * REGLAS.monedas.porEstrella : 0);
        const recomendaciones = recomendacionesDeResultado({
          materias: porMateria,
          items,
          omitidas,
          total: items.length,
          porcentaje,
          tiempoUsado: usado,
          tiempoDisponible: duracion,
          tipo: plantilla.tipo,
        });
        const { id: resultadoId } = await una(
          `INSERT INTO resultados (intento_id, usuario_id, simulacro_id, puntaje_global, porcentaje, aciertos, errores, omitidas, total,
                                   tiempo_usado_seg, estrellas, aprobado, xp_ganado, monedas_ganadas, recomendaciones, creado_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12, $13, $14, $15) RETURNING id`,
          [intentoId, usuarioId, plantilla.id, puntajeGlobal(porMateria), porcentaje, aciertos, items.length - aciertos - omitidas,
            omitidas, items.length, usado, estrellas, ganado, monedasGanadas, JSON.stringify(recomendaciones),
            new Date(inicio.getTime() + usado * 1000)],
          cliente,
        );
        for (const m of porMateria) {
          await cliente.query(
            `INSERT INTO resultados_materia (resultado_id, materia_id, aciertos, total, puntaje, tiempo_promedio_ms) VALUES ($1, $2, $3, $4, $5, $6)`,
            [resultadoId, m.materia_id, m.aciertos, m.total, m.puntaje, Math.round((usado / items.length) * 1000)],
          );
        }
        xp += ganado;
        monedas += monedasGanadas;
        registrar(fecha, 'xp', ganado);
        registrar(fecha, 'monedas', monedasGanadas);
        registrar(fecha, 'segundos', usado);
        registrar(fecha, 'simulacros', 1);
      }
    }

    // Respuestas, estadísticas y actividad diaria en bloque.
    await cliente.query(
      `INSERT INTO respuestas (usuario_id, pregunta_id, opcion_id, materia_id, subtema_id, es_correcta, tiempo_ms, origen, intento_id, creado_en)
       SELECT $1, * FROM unnest($2::int[], $3::int[], $4::smallint[], $5::int[], $6::bool[], $7::int[], $8::text[], $9::uuid[], $10::timestamptz[])`,
      [usuarioId,
        respuestas.map((r) => r.pregunta.id), respuestas.map((r) => r.opcion), respuestas.map((r) => r.pregunta.materia_id),
        respuestas.map((r) => r.pregunta.subtema_id), respuestas.map((r) => r.acierta), respuestas.map((r) => r.tiempo),
        respuestas.map((r) => r.origen), respuestas.map((r) => r.intentoId), respuestas.map((r) => r.momento)],
    );
    const est = [...estadisticas.values()];
    await cliente.query(
      `INSERT INTO estadisticas (usuario_id, materia_id, fecha, respondidas, correctas, tiempo_total_ms)
       SELECT $1, * FROM unnest($2::smallint[], $3::date[], $4::int[], $5::int[], $6::bigint[])`,
      [usuarioId, est.map((e) => e.materia), est.map((e) => e.fecha), est.map((e) => e.n), est.map((e) => e.ok), est.map((e) => e.ms)],
    );
    const dias = [...actividad.entries()];
    await cliente.query(
      `INSERT INTO actividad_diaria (usuario_id, fecha, segundos_estudio, xp_ganado, monedas_ganadas, preguntas_respondidas, correctas,
                                     lecciones_completadas, simulacros_completados)
       SELECT $1, * FROM unnest($2::date[], $3::int[], $4::int[], $5::int[], $6::int[], $7::int[], $8::smallint[], $9::smallint[])`,
      [usuarioId, dias.map(([f]) => f), dias.map(([, a]) => Math.round(a.segundos)), dias.map(([, a]) => a.xp), dias.map(([, a]) => a.monedas),
        dias.map(([, a]) => a.preguntas), dias.map(([, a]) => a.correctas), dias.map(([, a]) => a.lecciones), dias.map(([, a]) => a.simulacros)],
    );

    // Progreso por subtema.
    const leccionesPorSubtema = new Map();
    for (const l of lecciones.slice(0, leccionesHechas)) leccionesPorSubtema.set(l.subtema_id, (leccionesPorSubtema.get(l.subtema_id) ?? 0) + 1);
    for (const [subtemaId, resultados] of resultadosPorSubtema) {
      const dominio = aplicarDominio(0, 0, resultados);
      const hechas = leccionesPorSubtema.get(subtemaId) ?? 0;
      const completado = hechas > 0 && dominio >= REGLAS.dominio.umbralCompletado;
      await cliente.query(
        `INSERT INTO progreso (usuario_id, subtema_id, respondidas, correctas, dominio, lecciones_completadas, completado, completado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN now() - interval '3 days' END)`,
        [usuarioId, subtemaId, resultados.length, resultados.filter(Boolean).length, dominio, hechas, completado],
      );
      if (completado) {
        xp += REGLAS.xp.subtemaCompletado;
        monedas += REGLAS.monedas.subtemaCompletado;
      }
    }

    // Recompensas de racha (récord de 12 días: hitos de 3 y 7).
    for (const hito of await varias(`SELECT dias, xp, monedas, insignia_id FROM recompensas_racha WHERE dias <= 12`, [], cliente)) {
      await cliente.query(`INSERT INTO usuario_recompensas_racha (usuario_id, dias, obtenida_en) VALUES ($1, $2, now() - interval '20 days')`, [usuarioId, hito.dias]);
      if (hito.insignia_id) await cliente.query(`INSERT INTO usuario_insignias (usuario_id, insignia_id) VALUES ($1, $2)`, [usuarioId, hito.insignia_id]);
      xp += hito.xp;
      monedas += hito.monedas;
    }
    await cliente.query(
      `UPDATE rachas SET actual = 9, maxima = 12, ultima_fecha = $2, inicio_racha = $3, protectores = 1 WHERE usuario_id = $1`,
      [usuarioId, sumarDias(hoy, -1), sumarDias(hoy, -9)],
    );

    // Compras en la tienda y avatar equipado.
    const compras = ['color-menta', 'accesorio-gafas', 'fondo-estrellas'];
    for (const codigo of compras) {
      const item = await una(`SELECT id, precio FROM items_tienda WHERE codigo = $1`, [codigo], cliente);
      await cliente.query(`INSERT INTO inventario (usuario_id, item_id) VALUES ($1, $2)`, [usuarioId, item.id]);
      await cliente.query(
        `INSERT INTO historial_recompensas (usuario_id, tipo, cantidad, motivo, referencia) VALUES ($1, 'monedas', $2, 'compra', $3)`,
        [usuarioId, -item.precio, `item:${codigo}`],
      );
      monedas -= item.precio;
    }

    // Nivel según la XP acumulada (con sus insignias y monedas).
    const niveles = await varias(`SELECT numero, xp_minimo, recompensa_monedas, insignia_id FROM niveles ORDER BY numero`, [], cliente);
    const alcanzados = niveles.filter((n) => n.xp_minimo <= xp);
    for (const n of alcanzados) {
      monedas += n.recompensa_monedas;
      if (n.insignia_id) await cliente.query(`INSERT INTO usuario_insignias (usuario_id, insignia_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [usuarioId, n.insignia_id]);
    }
    await cliente.query(
      `UPDATE perfiles SET xp = $2, nivel = $3, monedas = $4,
              avatar = '{"color":"color-menta","expresion":"expresion-feliz","accesorio":"accesorio-gafas","fondo":"fondo-estrellas"}'
        WHERE usuario_id = $1`,
      [usuarioId, xp, alcanzados.at(-1).numero, Math.max(0, monedas)],
    );
    await cliente.query(
      `INSERT INTO historial_recompensas (usuario_id, tipo, cantidad, motivo, referencia) VALUES ($1, 'xp', $2, 'demo', 'historial-demo')`,
      [usuarioId, xp],
    );

    // Una conversación de ejemplo con Vanty.
    const { id: conversacionId } = await una(
      `INSERT INTO conversaciones_vanty (usuario_id, titulo, creado_en, actualizado_en)
       VALUES ($1, '¿Qué debo estudiar esta semana?', now() - interval '2 days', now() - interval '2 days') RETURNING id`,
      [usuarioId],
      cliente,
    );
    await cliente.query(
      `INSERT INTO mensajes_vanty (conversacion_id, usuario_id, rol, contenido, tipo, proveedor, creado_en) VALUES
         ($1, $2, 'usuario', '¿Qué debo estudiar esta semana?', 'texto', NULL, now() - interval '2 days'),
         ($1, $2, 'vanty', $3, 'recomendacion', 'local', now() - interval '2 days' + interval '5 seconds')`,
      [conversacionId, usuarioId,
        'Revisé tu rendimiento, Valentina. Esta semana te recomiendo:\n\n1. **Refuerza Inglés.** Es tu área con menor precisión: practica 10 minutos diarios de Grammar y Vocabulary.\n2. **Haz el Minisimulacro 4.** Ya desbloqueaste el siguiente paso del camino.\n3. **Protege tu racha.** ¡Llevas 9 días seguidos!'],
    );

    const logros = await evaluarLogros(cliente, usuarioId);
    return { usuarioId, respuestas: respuestas.length, dias: dias.length, lecciones: leccionesHechas, logros: logros.filter((e) => e.tipo === 'logro').length };
  });

  const perfil = await una(`SELECT xp, nivel, monedas FROM perfiles WHERE usuario_id = $1`, [resumen.usuarioId]);
  console.log('✔ Datos de demostración creados:');
  console.log(`  · ${resumen.respuestas} respuestas en ${resumen.dias} días, ${resumen.lecciones} lecciones, 4 simulacros, ${resumen.logros} logros.`);
  console.log(`  · Nivel ${perfil.nivel} con ${perfil.xp} XP y ${perfil.monedas} monedas.`);
  console.log(`\n  Estudiante:     ${ESTUDIANTE.email} / ${ESTUDIANTE.password}`);
  console.log(`  Administrador:  ${ADMIN.email} / ${ADMIN.password}\n`);
}

main()
  .catch((error) => {
    console.error(`✖ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
