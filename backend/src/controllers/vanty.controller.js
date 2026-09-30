/**
 * Controlador de Vanty. El envío de mensajes responde con Server-Sent Events (SSE) para
 * mostrar la respuesta mientras se genera.
 */
import * as vanty from '../services/vanty/vanty.service.js';
import { datos } from '../validators/comunes.js';

export async function estado(req, res) {
  res.json(await vanty.estado(req.usuario.id));
}

export async function recomendaciones(req, res) {
  res.json(await vanty.recomendaciones(req.usuario.id));
}

export async function pregunta(req, res) {
  const d = datos(req);
  res.json(await vanty.generarPreguntaPersonalizada(req.usuario.id, {
    materia: d.materia ?? null,
    subtema: d.subtema ?? null,
    dificultad: d.dificultad ?? null,
  }));
}

export async function conversaciones(req, res) {
  res.json({ conversaciones: await vanty.listarConversaciones(req.usuario.id) });
}

export async function crearConversacion(req, res) {
  res.status(201).json(await vanty.crearConversacion(req.usuario.id, datos(req).titulo));
}

export async function mensajes(req, res) {
  res.json(await vanty.obtenerMensajes(req.usuario.id, datos(req).id));
}

export async function eliminarConversacion(req, res) {
  res.json(await vanty.eliminarConversacion(req.usuario.id, datos(req).id));
}

/**
 * Envía un mensaje y transmite la respuesta como SSE:
 *   event: usuario | delta | reinicio | tarjeta | fin | error
 */
export async function enviarMensaje(req, res) {
  const d = datos(req);
  const controlador = new AbortController();
  let abierto = false;

  const abrir = () => {
    if (abierto) return;
    abierto = true;
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
  };
  const emitir = (evento, carga) => {
    abrir();
    if (!res.writableEnded) res.write(`event: ${evento}\ndata: ${JSON.stringify(carga)}\n\n`);
  };
  res.on('close', () => controlador.abort());

  try {
    await vanty.enviarMensaje(
      req.usuario.id,
      d.id,
      { contenido: d.contenido, adjunto: d.adjunto ?? null },
      { emitir, signal: controlador.signal },
    );
  } catch (error) {
    // Antes de abrir el stream, el error sigue el flujo normal (JSON con su código HTTP).
    if (!abierto) throw error;
    console.error('[vanty] Error durante el stream:', error);
    emitir('error', { mensaje: error.status && error.status < 500 ? error.message : 'Vanty tuvo un problema. Intenta de nuevo.' });
  }
  if (abierto && !res.writableEnded) res.end();
}
