/**
 * Error de aplicación con código HTTP y mensaje apto para mostrar al usuario.
 */
export class AppError extends Error {
  /**
   * @param {number} status   Código HTTP.
   * @param {string} mensaje  Mensaje legible (en español) para el cliente.
   * @param {object} [extra]  { codigo, detalles }
   */
  constructor(status, mensaje, { codigo, detalles } = {}) {
    super(mensaje);
    this.name = 'AppError';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

export const noEncontrado = (mensaje = 'Recurso no encontrado.') => new AppError(404, mensaje, { codigo: 'NO_ENCONTRADO' });
export const prohibido = (mensaje = 'No tienes permiso para esta acción.') => new AppError(403, mensaje, { codigo: 'PROHIBIDO' });
export const conflicto = (mensaje) => new AppError(409, mensaje, { codigo: 'CONFLICTO' });
export const solicitudInvalida = (mensaje, detalles) => new AppError(400, mensaje, { codigo: 'SOLICITUD_INVALIDA', detalles });
