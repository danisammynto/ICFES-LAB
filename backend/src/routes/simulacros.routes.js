/**
 * Simulacros (catálogo) e intentos (presentación y resultados).
 */
import { Router } from 'express';
import { body, param } from 'express-validator';
import * as ctrl from '../controllers/simulacros.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { validado } from '../middlewares/validar.js';
import { enteroBody, idEntero, idUuid } from '../validators/comunes.js';

const router = Router();
router.use(requireAuth);

const numeroSesion = param('numero').isInt({ min: 1, max: 10 }).withMessage('Sesión inválida.').toInt();

router.get('/simulacros', ctrl.listar);
router.get('/simulacros/historial', ctrl.historial);
router.post('/simulacros/:id/iniciar', validado(idEntero()), ctrl.iniciar);

router.get('/intentos/:id', validado(idUuid()), ctrl.intento);
router.get('/intentos/:id/resultado', validado(idUuid()), ctrl.resultado);
router.post('/intentos/:id/sesiones/:numero/iniciar', validado(idUuid(), numeroSesion), ctrl.iniciarSesion);
router.post('/intentos/:id/sesiones/:numero/finalizar', validado(idUuid(), numeroSesion), ctrl.finalizarSesion);
router.put(
  '/intentos/:id/respuestas/:preguntaId',
  validado(
    idUuid(),
    idEntero('preguntaId'),
    enteroBody('opcion_id', { min: 1 }),
    body('marcada').optional().isBoolean().withMessage('Valor no válido.').toBoolean(),
    enteroBody('tiempo_ms', { max: 86_400_000 }),
  ),
  ctrl.guardarRespuesta,
);
router.post('/intentos/:id/finalizar', validado(idUuid()), ctrl.finalizar);
router.post('/intentos/:id/abandonar', validado(idUuid()), ctrl.abandonar);

export default router;
