/**
 * Gamificación y tienda.
 */
import { Router } from 'express';
import { body } from 'express-validator';
import * as ctrl from '../controllers/gamificacion.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { validado } from '../middlewares/validar.js';

const router = Router();
router.use(requireAuth);

router.get('/gamificacion/resumen', ctrl.resumen);
router.get('/gamificacion/niveles', ctrl.niveles);
router.get('/gamificacion/logros', ctrl.logros);
router.get('/gamificacion/insignias', ctrl.insignias);
router.get('/gamificacion/racha', ctrl.racha);

router.get('/tienda', ctrl.tienda);
router.post(
  '/tienda/comprar',
  validado(
    body('tipo').isIn(['item']).withMessage('Solo se pueden comprar artículos: las insignias se ganan con logros, niveles y rachas.'),
    body('codigo').isString().matches(/^[a-z0-9-]{2,40}$/).withMessage('Artículo no válido.'),
  ),
  ctrl.compra,
);

export default router;
