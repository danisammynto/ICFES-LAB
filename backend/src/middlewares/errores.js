/**
 * Manejo centralizado de errores.
 * Traduce errores de validación, de PostgreSQL y de Express a respuestas JSON en español,
 * sin filtrar detalles internos en producción.
 */
import path from 'node:path';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Códigos de error de PostgreSQL más comunes → respuesta HTTP.
const ERRORES_PG = {
  23505: [409, 'Ya existe un registro con esos datos.'],
  23503: [409, 'La operación afecta datos relacionados que no existen o están en uso.'],
  23514: [400, 'Los datos no cumplen las reglas de validación.'],
  23502: [400, 'Falta un dato obligatorio.'],
  '22P02': [400, 'Uno de los identificadores no es válido.'],
  22001: [400, 'Un texto supera la longitud permitida.'],
  22003: [400, 'Un número está fuera del rango permitido.'],
  22007: [400, 'La fecha no es válida.'],
  22008: [400, 'La fecha está fuera de rango.'],
};

export function rutaApiNoEncontrada(_req, _res, next) {
  next(new AppError(404, 'La ruta solicitada no existe en la API.', { codigo: 'NO_ENCONTRADO' }));
}

export function crearManejadorErrores(directorioFrontend) {
  const pagina404 = path.join(directorioFrontend, '404.html');

  // eslint-disable-next-line no-unused-vars
  return function manejadorErrores(err, req, res, next) {
    let status = 500;
    let mensaje = 'Ocurrió un error inesperado. Intenta de nuevo en un momento.';
    let codigo = 'ERROR_INTERNO';
    let detalles;

    if (err instanceof AppError) {
      ({ status, codigo, detalles } = err);
      mensaje = err.message;
    } else if (err?.type === 'entity.parse.failed') {
      [status, mensaje, codigo] = [400, 'El cuerpo de la solicitud no es un JSON válido.', 'JSON_INVALIDO'];
    } else if (err?.type === 'entity.too.large') {
      [status, mensaje, codigo] = [413, 'La solicitud es demasiado grande.', 'DEMASIADO_GRANDE'];
    } else if (typeof err?.code === 'string' && ERRORES_PG[err.code]) {
      [status, mensaje] = ERRORES_PG[err.code];
      codigo = `PG_${err.code}`;
    } else if (err?.status && err.status < 500) {
      status = err.status;
      mensaje = err.expose ? err.message : 'Solicitud inválida.';
    }

    if (status >= 500) {
      console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    }

    // Si ya se enviaron cabeceras (por ejemplo, en un stream SSE) solo se cierra la respuesta.
    if (res.headersSent) {
      res.end();
      return;
    }

    if (!req.originalUrl.startsWith('/api/') && status === 404 && req.accepts('html')) {
      res.status(404).sendFile(pagina404);
      return;
    }

    res.status(status).json({
      error: mensaje,
      codigo,
      ...(detalles ? { detalles } : {}),
      ...(!env.esProduccion && status >= 500 ? { traza: String(err?.stack || err) } : {}),
    });
  };
}
