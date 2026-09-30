/**
 * Convierte los errores de express-validator en una respuesta 422 uniforme:
 * { error: "primer mensaje", codigo: "VALIDACION", detalles: [{ campo, mensaje }] }
 */
import { validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.js';

export function validar(req, _res, next) {
  const resultado = validationResult(req);
  if (resultado.isEmpty()) return next();
  const detalles = resultado.array({ onlyFirstError: true }).map((e) => ({ campo: e.path, mensaje: e.msg }));
  throw new AppError(422, detalles[0]?.mensaje || 'Los datos enviados no son válidos.', {
    codigo: 'VALIDACION',
    detalles,
  });
}

/** Azúcar sintáctico: validado(cadena1, cadena2…) → [cadena1, cadena2…, validar]. */
export const validado = (...cadenas) => [...cadenas, validar];
