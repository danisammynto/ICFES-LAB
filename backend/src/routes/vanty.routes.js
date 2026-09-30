/**
 * IA tutora Vanty.
 */
import { Router } from 'express';
import { body } from 'express-validator';
import * as ctrl from '../controllers/vanty.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { limiteVanty } from '../middlewares/limites.js';
import { validado } from '../middlewares/validar.js';
import { enteroBody, idUuid } from '../validators/comunes.js';

const router = Router();
router.use(requireAuth);

const slugOpcional = (campo) => body(campo).optional({ values: 'null' }).matches(/^[a-z0-9-]{2,60}$/).withMessage(`${campo} no válido.`);

router.get('/estado', ctrl.estado);
router.get('/recomendaciones', ctrl.recomendaciones);
router.post(
  '/pregunta',
  limiteVanty,
  validado(slugOpcional('materia'), slugOpcional('subtema'), enteroBody('dificultad', { min: 1, max: 3 })),
  ctrl.pregunta,
);
router.get('/conversaciones', ctrl.conversaciones);
router.post(
  '/conversaciones',
  validado(body('titulo').optional().isString().trim().isLength({ max: 120 }).withMessage('Título demasiado largo.')),
  ctrl.crearConversacion,
);
router.get('/conversaciones/:id', validado(idUuid()), ctrl.mensajes);
router.delete('/conversaciones/:id', validado(idUuid()), ctrl.eliminarConversacion);
router.post(
  '/conversaciones/:id/mensajes',
  limiteVanty,
  validado(
    idUuid(),
    body('contenido').isString().withMessage('Escribe un mensaje.').trim()
      .isLength({ min: 1, max: 2000 }).withMessage('El mensaje debe tener entre 1 y 2000 caracteres.'),
    body('adjunto').optional({ values: 'null' }).isObject().withMessage('Adjunto no válido.'),
    body('adjunto.pregunta_id').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
    body('adjunto.opcion_id').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
  ),
  ctrl.enviarMensaje,
);

export default router;
