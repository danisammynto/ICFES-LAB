/**
 * Orquestación de Vanty: conversaciones, mensajes en streaming, preguntas personalizadas
 * y recomendaciones.
 *
 * Modo IA (Claude) si hay ANTHROPIC_API_KEY; si no, o si la API falla, modo local.
 */
import { TZ, transaccion, una, varias } from '../../config/db.js';
import { env } from '../../config/env.js';
import { REGLAS } from '../../config/reglas.js';
import { AppError, noEncontrado } from '../../utils/AppError.js';
import { barajar } from '../../utils/aleatorio.js';
import { fechaLocal } from '../../utils/fechas.js';
import { recortar } from '../../utils/texto.js';
import { obtenerConfig } from '../config.service.js';
import { cargarPreguntas } from '../preguntas.service.js';
import { dificultadObjetivo, siguientePregunta } from '../practica.service.js';
import { registrarEstudio } from '../racha.service.js';
import { evaluarLogros } from '../logros.service.js';
import { construirContexto, contextoComoTexto } from './contexto.js';
import { detectarIntencion } from './intenciones.js';
import { responderLocal } from './local.js';
import { claudeActivo, describirErrorClaude, generarPreguntaConClaude, responderConClaude } from './claude.js';
import { PERSONA_VANTY } from './prompts.js';
import { generarRecomendaciones } from './recomendaciones.js';

const TITULO_POR_DEFECTO = 'Nueva conversación';
const INTENCIONES_DE_ESTUDIO = new Set(['duda_academica', 'explicar_pregunta', 'generar_pregunta', 'estrategia']);
const COMPETENCIAS = {
  matematicas: ['Interpretación y representación', 'Formulación y ejecución', 'Argumentación'],
  'lectura-critica': ['Identificar y entender los contenidos locales', 'Comprender cómo se articulan las partes de un texto', 'Reflexionar a partir de un texto y evaluar su contenido'],
  'ciencias-naturales': ['Uso comprensivo del conocimiento científico', 'Explicación de fenómenos', 'Indagación'],
  'sociales-ciudadanas': ['Pensamiento social', 'Interpretación y análisis de perspectivas', 'Pensamiento reflexivo y sistémico'],
  ingles: ['Comprensión de lectura', 'Gramática en contexto', 'Léxico', 'Comunicación'],
};

// ---------------------------------------------------------------------------
// Estado y límites
// ---------------------------------------------------------------------------

async function mensajesDeHoy(usuarioId) {
  const fila = await una(
    `SELECT count(*)::int AS n FROM mensajes_vanty
      WHERE usuario_id = $1 AND rol = 'usuario'
        AND creado_en >= ($2::date::timestamp AT TIME ZONE '${TZ}')`,
    [usuarioId, fechaLocal()],
  );
  return fila.n;
}

async function limiteDiario() {
  const config = (await obtenerConfig('vanty')) ?? {};
  return Number(config.limite_diario) > 0 ? Number(config.limite_diario) : 80;
}

export async function estado(usuarioId) {
  return {
    modo: claudeActivo() ? 'claude' : 'local',
    modelo: claudeActivo() ? env.vanty.modelo : null,
    limite_diario: await limiteDiario(),
    usados_hoy: await mensajesDeHoy(usuarioId),
  };
}

// ---------------------------------------------------------------------------
// Conversaciones
// ---------------------------------------------------------------------------

export async function listarConversaciones(usuarioId) {
  return varias(
    `SELECT c.id, c.titulo, c.creado_en, c.actualizado_en,
            (SELECT left(m.contenido, 90) FROM mensajes_vanty m WHERE m.conversacion_id = c.id ORDER BY m.id DESC LIMIT 1) AS ultimo_mensaje
       FROM conversaciones_vanty c
      WHERE c.usuario_id = $1
      ORDER BY c.actualizado_en DESC
      LIMIT 50`,
    [usuarioId],
  );
}

export async function crearConversacion(usuarioId, titulo = TITULO_POR_DEFECTO) {
  return una(
    `INSERT INTO conversaciones_vanty (usuario_id, titulo) VALUES ($1, $2)
     RETURNING id, titulo, creado_en, actualizado_en`,
    [usuarioId, recortar(titulo || TITULO_POR_DEFECTO, 120)],
  );
}

async function conversacionPropia(usuarioId, conversacionId) {
  const conversacion = await una(
    `SELECT id, titulo FROM conversaciones_vanty WHERE id = $1 AND usuario_id = $2`,
    [conversacionId, usuarioId],
  );
  if (!conversacion) throw noEncontrado('La conversación no existe.');
  return conversacion;
}

export async function eliminarConversacion(usuarioId, conversacionId) {
  await conversacionPropia(usuarioId, conversacionId);
  await una(`DELETE FROM conversaciones_vanty WHERE id = $1 RETURNING id`, [conversacionId]);
  return { ok: true };
}

/** Mensajes de una conversación; las tarjetas de pregunta incluyen su estado. */
export async function obtenerMensajes(usuarioId, conversacionId) {
  const conversacion = await conversacionPropia(usuarioId, conversacionId);
  const mensajes = await varias(
    `SELECT id, rol, contenido, tipo, metadata, proveedor, creado_en
       FROM (SELECT * FROM mensajes_vanty WHERE conversacion_id = $1 ORDER BY id DESC LIMIT 200) x
      ORDER BY id`,
    [conversacionId],
  );

  for (const m of mensajes.filter((x) => x.tipo === 'pregunta' && x.metadata?.pregunta_id)) {
    const respuesta = await una(
      `SELECT opcion_id, es_correcta FROM respuestas
        WHERE usuario_id = $1 AND pregunta_id = $2 AND creado_en >= $3
        ORDER BY creado_en LIMIT 1`,
      [usuarioId, m.metadata.pregunta_id, m.creado_en],
    );
    const [pregunta] = await cargarPreguntas([m.metadata.pregunta_id], { conSolucion: Boolean(respuesta) });
    m.pregunta = pregunta ?? null;
    m.respuesta = respuesta;
  }
  return { conversacion, mensajes };
}

// ---------------------------------------------------------------------------
// Preguntas personalizadas
// ---------------------------------------------------------------------------

async function subtemaObjetivo(usuarioId, { materia, subtema, similarA, ctx }) {
  const nivel = ctx.nivel.numero;
  const base = `SELECT s.id, s.slug, s.nombre, s.descripcion, s.nivel_requerido,
                       m.slug AS materia_slug, m.nombre AS materia,
                       coalesce(p.dominio, 0) AS dominio, coalesce(p.respondidas, 0) AS respondidas
                  FROM subtemas s
                  JOIN temas t ON t.id = s.tema_id
                  JOIN materias m ON m.id = t.materia_id
                  LEFT JOIN progreso p ON p.subtema_id = s.id AND p.usuario_id = $1`;

  if (similarA) {
    const s = await una(`${base} WHERE s.id = (SELECT subtema_id FROM preguntas WHERE id = $2)`, [usuarioId, similarA]);
    if (s) return { ...s, razon: 'similar' };
  }
  if (subtema) {
    const s = await una(`${base} WHERE s.slug = $2 AND s.nivel_requerido <= $3`, [usuarioId, subtema, nivel]);
    if (s) return { ...s, razon: 'pedido' };
  }
  if (materia) {
    const s = await una(
      `${base} WHERE m.slug = $2 AND s.nivel_requerido <= $3
          AND EXISTS (SELECT 1 FROM preguntas q WHERE q.subtema_id = s.id AND q.activa AND q.publica)
        ORDER BY coalesce(p.dominio, 50) + random() * 15 LIMIT 1`,
      [usuarioId, materia, nivel],
    );
    if (s) return { ...s, razon: 'materia' };
  }
  const debil = ctx.debilidades.find((d) => !d.bloqueado);
  if (debil) {
    const s = await una(`${base} WHERE s.slug = $2`, [usuarioId, debil.slug]);
    if (s) return { ...s, razon: 'debilidad', precision: debil.precision };
  }
  return una(
    `${base} WHERE s.nivel_requerido <= $2
        AND EXISTS (SELECT 1 FROM preguntas q WHERE q.subtema_id = s.id AND q.activa AND q.publica)
      ORDER BY coalesce(p.dominio, 0) + random() * 40 LIMIT 1`,
    [usuarioId, nivel],
  ).then((s) => ({ ...s, razon: 'exploracion' }));
}

async function guardarPreguntaGenerada(usuarioId, subtema, dificultad, datos) {
  return transaccion(async (cliente) => {
    const contexto = datos.contexto
      ? await una(`INSERT INTO contextos (contenido, fuente) VALUES ($1, 'Generado por Vanty') RETURNING id`, [datos.contexto], cliente)
      : null;
    const codigo = `VAN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const pregunta = await una(
      `INSERT INTO preguntas (codigo, subtema_id, contexto_id, enunciado, dificultad, competencia, explicacion,
                              tiempo_estimado_seg, origen, autor_id, publica)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 120, 'vanty', $8, FALSE)
       RETURNING id`,
      [codigo, subtema.id, contexto?.id ?? null, datos.enunciado, dificultad, datos.competencia, datos.explicacion, usuarioId],
      cliente,
    );
    const opciones = barajar(datos.opciones);
    for (const [i, o] of opciones.entries()) {
      await cliente.query(
        `INSERT INTO opciones (pregunta_id, letra, texto, es_correcta, retroalimentacion) VALUES ($1, $2, $3, $4, $5)`,
        [pregunta.id, 'ABCD'[i], o.texto, o.correcta, o.retroalimentacion],
      );
    }
    return pregunta.id;
  });
}

/**
 * Pregunta adaptada al estudiante: con Claude se genera una pregunta nueva; en modo local
 * (o si la IA falla) se elige del banco con la práctica adaptativa.
 */
export async function generarPreguntaPersonalizada(usuarioId, { materia = null, subtema = null, dificultad = null, similarA = null, ctx = null } = {}) {
  ctx ??= await construirContexto(usuarioId);
  const objetivo = await subtemaObjetivo(usuarioId, { materia, subtema, similarA, ctx });
  if (!objetivo?.id) throw noEncontrado('No encontré preguntas disponibles para practicar.');
  const nivelDificultad = dificultad ?? dificultadObjetivo(objetivo.dominio, objetivo.respondidas);
  const etiquetaDificultad = { 1: 'básica', 2: 'media', 3: 'avanzada' }[nivelDificultad];

  let motivo;
  switch (objetivo.razon) {
    case 'debilidad':
      motivo = `Elegí **${objetivo.nombre}** (${objetivo.materia}) porque es uno de tus temas con menor precisión (${objetivo.precision} %).`;
      break;
    case 'similar':
      motivo = `Aquí tienes una pregunta parecida de **${objetivo.nombre}** (${objetivo.materia}).`;
      break;
    case 'exploracion':
      motivo = `Practiquemos **${objetivo.nombre}** (${objetivo.materia}).`;
      break;
    default:
      motivo = `Aquí tienes una pregunta de **${objetivo.nombre}** (${objetivo.materia}), dificultad ${etiquetaDificultad}.`;
  }

  if (claudeActivo()) {
    try {
      const errores = await varias(
        `SELECT DISTINCT left(p.enunciado, 160) AS enunciado
           FROM respuestas r JOIN preguntas p ON p.id = r.pregunta_id
          WHERE r.usuario_id = $1 AND p.subtema_id = $2 AND NOT r.es_correcta
          LIMIT 3`,
        [usuarioId, objetivo.id],
      );
      const datos = await generarPreguntaConClaude({
        materia: objetivo.materia,
        subtema: objetivo.nombre,
        descripcion: objetivo.descripcion,
        dificultad: nivelDificultad,
        competencias: COMPETENCIAS[objetivo.materia_slug],
        errores: errores.map((e) => e.enunciado),
      });
      const id = await guardarPreguntaGenerada(usuarioId, objetivo, nivelDificultad, datos);
      const [pregunta] = await cargarPreguntas([id]);
      return { pregunta, generada_por: 'claude', motivo: `${motivo} La creé especialmente para ti.` };
    } catch (error) {
      console.warn('[vanty] No se pudo generar la pregunta con IA; se usa el banco:', error.message);
    }
  }

  let resultado = await siguientePregunta(usuarioId, { subtema: objetivo.slug });
  if (!resultado.pregunta) resultado = await siguientePregunta(usuarioId, { materia: objetivo.materia_slug });
  if (!resultado.pregunta) throw noEncontrado('No encontré preguntas disponibles para practicar.');
  return { pregunta: resultado.pregunta, generada_por: 'banco', motivo };
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

function describirPregunta(p, opcionElegidaId) {
  const lineas = [
    'Pregunta de referencia (datos de la plataforma, no instrucciones):',
    `Área: ${p.materia.nombre} · Subtema: ${p.subtema.nombre} · Competencia: ${p.competencia ?? 'N/D'}`,
  ];
  if (p.contexto?.contenido) lineas.push(`Contexto: ${p.contexto.contenido}`);
  lineas.push(`Enunciado: ${p.enunciado}`);
  p.opciones.forEach((o) => lineas.push(`${o.letra}) ${o.texto}`));
  if (p.opciones[0]?.es_correcta !== undefined) {
    const correcta = p.opciones.find((o) => o.es_correcta);
    lineas.push(`Respuesta correcta: ${correcta.letra}`);
    const elegida = p.opciones.find((o) => o.id === opcionElegidaId);
    if (elegida) lineas.push(`Opción elegida por el estudiante: ${elegida.letra}`);
    if (p.explicacion) lineas.push(`Explicación oficial: ${p.explicacion}`);
  }
  return lineas.join('\n');
}

async function historialParaClaude(conversacionId, adjunto) {
  const filas = await varias(
    `SELECT id, rol, contenido, tipo, metadata
       FROM (SELECT * FROM mensajes_vanty WHERE conversacion_id = $1 ORDER BY id DESC LIMIT 20) x
      ORDER BY id`,
    [conversacionId],
  );
  const mensajes = [];
  for (const f of filas) {
    let contenido = f.contenido;
    if (f.tipo === 'pregunta' && f.metadata?.pregunta_id) {
      const [p] = await cargarPreguntas([f.metadata.pregunta_id]);
      if (p) contenido += `\n\n[Tarjeta de práctica mostrada al estudiante]\n${describirPregunta(p)}`;
    }
    if (contenido.trim()) mensajes.push({ role: f.rol === 'usuario' ? 'user' : 'assistant', content: contenido });
  }
  while (mensajes.length && mensajes[0].role !== 'user') mensajes.shift();

  if (adjunto && mensajes.length) {
    const [p] = await cargarPreguntas([adjunto.pregunta_id], { conSolucion: true });
    const ultimo = mensajes[mensajes.length - 1];
    mensajes[mensajes.length - 1] = {
      role: 'user',
      content: [
        { type: 'text', text: ultimo.content },
        { type: 'text', text: describirPregunta(p, adjunto.opcion_id) },
      ],
    };
  }
  return mensajes;
}

/** Emite un texto en fragmentos cortos (efecto de escritura en el modo local). */
async function emitirGradual(texto, emitir, signal) {
  const fragmentos = texto.match(/\S+\s*/g) ?? [texto];
  for (let i = 0; i < fragmentos.length; i += 3) {
    if (signal?.aborted) return;
    emitir('delta', { texto: fragmentos.slice(i, i + 3).join('') });
    await new Promise((resolve) => { setTimeout(resolve, 12); });
  }
}

async function validarAdjunto(usuarioId, adjunto) {
  if (!adjunto?.pregunta_id) return null;
  const pregunta = await una(
    `SELECT id FROM preguntas WHERE id = $1 AND activa AND (publica OR autor_id = $2)`,
    [adjunto.pregunta_id, usuarioId],
  );
  if (!pregunta) return null;
  let opcionId = null;
  if (adjunto.opcion_id) {
    const opcion = await una(`SELECT id FROM opciones WHERE id = $1 AND pregunta_id = $2`, [adjunto.opcion_id, pregunta.id]);
    opcionId = opcion?.id ?? null;
  }
  return { pregunta_id: pregunta.id, opcion_id: opcionId };
}

/**
 * Procesa un mensaje del estudiante y emite eventos para el stream SSE:
 *   usuario (mensaje guardado) · delta (texto parcial) · reinicio (descartar texto parcial)
 *   tarjeta (pregunta interactiva) · fin (mensaje final + eventos de gamificación)
 */
export async function enviarMensaje(usuarioId, conversacionId, { contenido, adjunto }, { emitir, signal }) {
  const conversacion = await conversacionPropia(usuarioId, conversacionId);
  const limite = await limiteDiario();
  if ((await mensajesDeHoy(usuarioId)) >= limite) {
    throw new AppError(429, `Llegaste al límite de ${limite} mensajes diarios con Vanty. ¡Vuelve mañana!`, { codigo: 'LIMITE_VANTY' });
  }
  const adjuntoValido = await validarAdjunto(usuarioId, adjunto);

  const mensajeUsuario = await una(
    `INSERT INTO mensajes_vanty (conversacion_id, usuario_id, rol, contenido, metadata)
     VALUES ($1, $2, 'usuario', $3, $4)
     RETURNING id, rol, contenido, tipo, metadata, creado_en`,
    [conversacion.id, usuarioId, contenido, JSON.stringify(adjuntoValido ? { adjunto: adjuntoValido } : {})],
  );
  if (conversacion.titulo === TITULO_POR_DEFECTO) {
    await una(`UPDATE conversaciones_vanty SET titulo = $2 WHERE id = $1 RETURNING id`, [conversacion.id, recortar(contenido, 60)]);
  }
  emitir('usuario', { mensaje: mensajeUsuario });

  const ctx = await construirContexto(usuarioId);
  const { intencion, materia, subtema, dificultad } = detectarIntencion(contenido, { adjunto: adjuntoValido });
  let respuesta;

  if (intencion === 'generar_pregunta') {
    const ultimaTarjeta = /\b(similar|parecida|otra)\b/i.test(contenido)
      ? await una(
        `SELECT (metadata->>'pregunta_id')::int AS id FROM mensajes_vanty
          WHERE conversacion_id = $1 AND tipo = 'pregunta' ORDER BY id DESC LIMIT 1`,
        [conversacion.id],
      )
      : null;
    const tarjeta = await generarPreguntaPersonalizada(usuarioId, {
      materia,
      subtema,
      dificultad,
      similarA: adjuntoValido?.pregunta_id ?? ultimaTarjeta?.id ?? null,
      ctx,
    });
    const texto = `${tarjeta.motivo}\n\nResponde cuando estés listo y te explico el resultado.`;
    await emitirGradual(texto, emitir, signal);
    emitir('tarjeta', { pregunta: tarjeta.pregunta, generada_por: tarjeta.generada_por });
    respuesta = {
      texto,
      tipo: 'pregunta',
      metadata: { pregunta_id: tarjeta.pregunta.id, generada_por: tarjeta.generada_por },
      proveedor: tarjeta.generada_por === 'claude' ? 'claude' : 'local',
      pregunta: tarjeta.pregunta,
    };
  } else if (claudeActivo()) {
    try {
      const resultado = await responderConClaude({
        system: [
          { type: 'text', text: PERSONA_VANTY, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: contextoComoTexto(ctx) },
        ],
        messages: await historialParaClaude(conversacion.id, adjuntoValido),
        onTexto: (delta) => emitir('delta', { texto: delta }),
        signal,
      });
      let texto = resultado.texto;
      if (resultado.stopReason === 'refusal') {
        const nota = 'Prefiero no responder eso. ¿Seguimos con tu preparación para el ICFES?';
        emitir('delta', { texto: `${texto ? '\n\n' : ''}${nota}` });
        texto = texto ? `${texto}\n\n${nota}` : nota;
      } else if (resultado.stopReason === 'max_tokens') {
        emitir('delta', { texto: '…' });
        texto += '…';
      }
      respuesta = {
        texto,
        tipo: intencion === 'explicar_pregunta' ? 'explicacion' : intencion === 'recomendacion' ? 'recomendacion' : 'texto',
        metadata: { modelo: resultado.modelo },
        proveedor: 'claude',
        tokensEntrada: resultado.uso?.input_tokens ?? null,
        tokensSalida: resultado.uso?.output_tokens ?? null,
      };
    } catch (error) {
      if (signal?.aborted) return;
      console.error('[vanty] Error con Claude, se responde en modo local:', error.message);
      const local = await responderLocal({ intencion, texto: contenido, materia, ctx, adjunto: adjuntoValido, usuarioId });
      const texto = `_${describirErrorClaude(error)} Te respondo en modo local._\n\n${local.texto}`;
      emitir('reinicio', {});
      await emitirGradual(texto, emitir, signal);
      respuesta = { texto, tipo: local.tipo, metadata: { error_ia: true }, proveedor: 'local' };
    }
  } else {
    const local = await responderLocal({ intencion, texto: contenido, materia, ctx, adjunto: adjuntoValido, usuarioId });
    await emitirGradual(local.texto, emitir, signal);
    respuesta = { ...local, metadata: {}, proveedor: 'local' };
  }

  const { mensaje, eventos } = await transaccion(async (cliente) => {
    const guardado = await una(
      `INSERT INTO mensajes_vanty (conversacion_id, usuario_id, rol, contenido, tipo, metadata, proveedor, tokens_entrada, tokens_salida)
       VALUES ($1, $2, 'vanty', $3, $4, $5, $6, $7, $8)
       RETURNING id, rol, contenido, tipo, metadata, proveedor, creado_en`,
      [conversacion.id, usuarioId, respuesta.texto, respuesta.tipo, JSON.stringify(respuesta.metadata ?? {}),
        respuesta.proveedor, respuesta.tokensEntrada ?? null, respuesta.tokensSalida ?? null],
      cliente,
    );
    await cliente.query(`UPDATE conversaciones_vanty SET actualizado_en = now() WHERE id = $1`, [conversacion.id]);
    const eventosGamificacion = [];
    if (INTENCIONES_DE_ESTUDIO.has(intencion)) {
      eventosGamificacion.push(...(await registrarEstudio(cliente, usuarioId, { segundos: REGLAS.topes.segundosPorMensajeVanty })));
    }
    eventosGamificacion.push(...(await evaluarLogros(cliente, usuarioId, { estudio: INTENCIONES_DE_ESTUDIO.has(intencion) })));
    return { mensaje: guardado, eventos: eventosGamificacion };
  });

  if (respuesta.pregunta) mensaje.pregunta = respuesta.pregunta;
  emitir('fin', { mensaje, eventos, intencion });
}

/** Recomendaciones automáticas (también se muestran en el dashboard). */
export async function recomendaciones(usuarioId) {
  const ctx = await construirContexto(usuarioId);
  return {
    recomendaciones: generarRecomendaciones(ctx),
    resumen: {
      debilidades: ctx.debilidades,
      fortalezas: ctx.fortalezas,
      errores_frecuentes: ctx.errores_frecuentes,
      areas: ctx.areas,
    },
  };
}
