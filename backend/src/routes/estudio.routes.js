/**
 * Materias, lecciones y práctica.
 */
import { Router } from 'express';
import { body, query } from 'express-validator';
import * as ctrl from '../controllers/estudio.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { validado } from '../middlewares/validar.js';
import { enteroBody, idEntero, slugParam, slugQuery } from '../validators/comunes.js';

const router = Router();
router.use(requireAuth);

router.get('/materias', ctrl.materias);
router.get('/materias/:slug', validado(slugParam()), ctrl.materia);

router.get('/lecciones/del-dia', ctrl.delDia);
router.get('/lecciones/:id', validado(idEntero()), ctrl.leccion);
router.post(
  '/lecciones/:id/completar',
  validado(idEntero(), enteroBody('tiempo_seg', { max: 86_400 }), enteroBody('aciertos', { max: 50 }), enteroBody('total', { max: 50 })),
  ctrl.completar,
);

router.get(
  '/practica/siguiente',
  validado(
    slugQuery('subtema'),
    slugQuery('materia'),
    query('excluir').optional().matches(/^[0-9,]{0,2000}$/).withMessage('Lista de exclusión inválida.'),
  ),
  ctrl.siguiente,
);
router.post(
  '/practica/responder',
  validado(
    enteroBody('pregunta_id', { min: 1, opcional: false }),
    enteroBody('opcion_id', { min: 1 }),
    enteroBody('tiempo_ms', { max: 86_400_000 }),
    body('origen').optional().isIn(['practica', 'leccion', 'vanty']).withMessage('Origen no válido.'),
  ),
  ctrl.responder,
);

export default router;
