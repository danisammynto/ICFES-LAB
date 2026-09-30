/**
 * Límites de tasa (rate limiting) contra abuso y fuerza bruta.
 */
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

const base = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next, opciones) => next(new AppError(429, opciones.message, { codigo: 'LIMITE' })),
};

const minutos = (n) => n * 60 * 1000;

/** Límite general de la API por IP. */
export const limiteApi = rateLimit({
  ...base,
  windowMs: minutos(15),
  limit: 1500,
  message: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
});

/** Inicio de sesión: solo cuentan los intentos fallidos. */
export const limiteLogin = rateLimit({
  ...base,
  windowMs: minutos(15),
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentarlo.',
});

export const limiteRegistro = rateLimit({
  ...base,
  windowMs: minutos(60),
  limit: 10,
  message: 'Se crearon demasiadas cuentas desde esta conexión. Intenta más tarde.',
});

export const limiteRecuperacion = rateLimit({
  ...base,
  windowMs: minutos(60),
  limit: 6,
  message: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en una hora.',
});

/** Mensajes a Vanty: por usuario (o por IP si no hay sesión). */
export const limiteVanty = rateLimit({
  ...base,
  windowMs: minutos(1),
  limit: 12,
  keyGenerator: (req) => req.usuario?.id ?? ipKeyGenerator(req.ip ?? ''),
  message: 'Vas muy rápido: espera un momento antes de escribirle de nuevo a Vanty.',
});
