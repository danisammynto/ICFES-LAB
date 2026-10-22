/**
 * Panel de administración (requiere rol admin).
 */
import { Router } from 'express';
import { body, query } from 'express-validator';
import * as ctrl from '../controllers/admin.controller.js';
import { requireAuth, requireRol } from '../middlewares/auth.js';
import { validado } from '../middlewares/validar.js';
import { idEntero, idUuid, slugQuery } from '../validators/comunes.js';

const router = Router();
router.use(requireAuth, requireRol('admin'));

const pagina = query('pagina').optional().isInt({ min: 1, max: 10_000 }).toInt();
const busqueda = query('q').optional().isString().trim().isLength({ max: 100 });

router.get('/resumen', ctrl.resumen);
router.get('/catalogo', ctrl.catalogo);

router.get('/configuracion', ctrl.obtenerConfiguracion);
router.put(
  '/configuracion',
  validado(
    // Fechas oficiales por calendario: { A: { convocatoria, meses, fuente, fechas: [{ fecha, descripcion }] }, B: {…} }.
    // El detalle se valida en admin.service (normalizarCalendarios).
    body('calendarios_icfes').optional().isObject(),
    body('vanty').optional().isObject(),
    body('vanty.limite_diario').optional().isInt({ min: 1, max: 1000 }).toInt(),
  ),
  ctrl.actualizarConfiguracion,
);

router.get(
  '/preguntas',
  validado(slugQuery('materia'), slugQuery('subtema'), busqueda, pagina, query('estado').optional().isIn(['activas', 'inactivas', 'todas'])),
  ctrl.listarPreguntas,
);
// El cuerpo de crear/actualizar/importar se valida a fondo en contenido.service (validarPregunta).
router.post('/preguntas/importar', validado(body('preguntas').isArray({ min: 1, max: 500 }).withMessage('El archivo debe tener entre 1 y 500 preguntas.')), ctrl.importar);
router.get('/preguntas/:id', validado(idEntero()), ctrl.obtenerPregunta);
router.post('/preguntas', validado(body('codigo').isString()), ctrl.crearPregunta);
router.put('/preguntas/:id', validado(idEntero(), body('codigo').isString()), ctrl.actualizarPregunta);
router.patch('/preguntas/:id/estado', validado(idEntero(), body('activa').isBoolean().toBoolean()), ctrl.estadoPregunta);

router.get('/usuarios', validado(busqueda, pagina), ctrl.listarUsuarios);
router.patch(
  '/usuarios/:id',
  validado(idUuid(), body('activo').optional().isBoolean().toBoolean(), body('rol').optional().isIn(['estudiante', 'admin'])),
  ctrl.actualizarUsuario,
);

export default router;
