/**
 * Validadores reutilizables (express-validator).
 * Los controladores leen solo los datos validados con `datos(req)` (matchedData): cualquier
 * campo que no esté declarado aquí se ignora (evita asignación masiva de campos).
 */
import { body, matchedData, param, query } from 'express-validator';
import { esFechaValida } from '../utils/fechas.js';

export const datos = (req) => matchedData(req, { includeOptionals: true });

export const email = (campo = 'email') =>
  body(campo)
    .isString().withMessage('El correo es obligatorio.')
    .trim()
    .isLength({ max: 160 }).withMessage('El correo es demasiado largo.')
    .isEmail().withMessage('Escribe un correo electrónico válido.')
    .toLowerCase();

/** Política de contraseñas: 8–72 caracteres, al menos una letra y un número. */
export const passwordNueva = (campo = 'password') =>
  body(campo)
    .isString().withMessage('La contraseña es obligatoria.')
    .isLength({ min: 8, max: 72 }).withMessage('La contraseña debe tener entre 8 y 72 caracteres.')
    .matches(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/).withMessage('La contraseña debe incluir al menos una letra.')
    .matches(/\d/).withMessage('La contraseña debe incluir al menos un número.');

export const passwordRequerida = (campo = 'password') =>
  body(campo).isString().withMessage('Escribe tu contraseña.').isLength({ min: 1, max: 72 }).withMessage('Escribe tu contraseña.');

export const nombre = (campo = 'nombre', { opcional = false } = {}) => {
  const cadena = body(campo);
  if (opcional) cadena.optional();
  return cadena
    .isString().withMessage('El nombre es obligatorio.')
    .trim()
    .isLength({ min: 2, max: 80 }).withMessage('El nombre debe tener entre 2 y 80 caracteres.')
    .matches(/^[\p{L}\p{M}' .-]+$/u).withMessage('El nombre solo puede contener letras, espacios y guiones.');
};

export const textoOpcional = (campo, max) =>
  body(campo).optional({ values: 'null' }).isString().withMessage(`${campo} debe ser texto.`)
    .trim().isLength({ max }).withMessage(`${campo} admite máximo ${max} caracteres.`);

export const fechaOpcional = (campo) =>
  body(campo).optional({ values: 'null' })
    .custom((v) => esFechaValida(v)).withMessage('La fecha no es válida (formato AAAA-MM-DD).');

export const grado = (campo = 'grado') =>
  body(campo).optional({ values: 'falsy' }).isIn(['10', '11', 'egresado', 'otro']).withMessage('Grado no válido.');

export const idEntero = (campo = 'id') =>
  param(campo).isInt({ min: 1, max: 2_147_483_647 }).withMessage('Identificador inválido.').toInt();

export const idUuid = (campo = 'id') =>
  param(campo).isUUID().withMessage('Identificador inválido.');

export const slugParam = (campo = 'slug') =>
  param(campo).matches(/^[a-z0-9-]{2,60}$/).withMessage('Identificador inválido.');

export const slugQuery = (campo) =>
  query(campo).optional().matches(/^[a-z0-9-]{2,60}$/).withMessage(`${campo} inválido.`);

export const enteroBody = (campo, { min = 0, max = 2_147_483_647, opcional = true } = {}) => {
  const cadena = body(campo);
  if (opcional) cadena.optional({ values: 'null' });
  return cadena.isInt({ min, max }).withMessage(`${campo} debe ser un número entre ${min} y ${max}.`).toInt();
};
