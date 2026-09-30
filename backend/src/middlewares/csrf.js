/**
 * Protección CSRF para la sesión basada en cookie.
 *
 * Además de SameSite=Lax en la cookie, toda petición que modifica datos debe incluir la
 * cabecera `X-Requested-With: XMLHttpRequest`. Un sitio externo no puede enviar cabeceras
 * personalizadas a otro dominio sin una respuesta CORS afirmativa (que este servidor no da).
 */
import { AppError } from '../utils/AppError.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function protegerCsrf(req, _res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();
  // Los clientes con token Bearer no usan cookies, así que no son vulnerables a CSRF.
  if (req.get('authorization')?.startsWith('Bearer ')) return next();
  if (req.get('x-requested-with') === 'XMLHttpRequest') return next();
  throw new AppError(403, 'Solicitud rechazada por seguridad. Recarga la página e intenta de nuevo.', { codigo: 'CSRF' });
}
