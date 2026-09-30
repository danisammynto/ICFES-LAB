import { Router } from 'express';
import { body } from 'express-validator';
import * as ctrl from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { limiteLogin, limiteRecuperacion, limiteRegistro } from '../middlewares/limites.js';
import { validado } from '../middlewares/validar.js';
import { email, fechaOpcional, grado, nombre, passwordNueva, passwordRequerida } from '../validators/comunes.js';

const router = Router();

router.post('/registro', limiteRegistro, validado(nombre(), email(), passwordNueva(), grado(), fechaOpcional('fecha_icfes')), ctrl.registro);
router.post('/login', limiteLogin, validado(email(), passwordRequerida()), ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.post('/recuperar', limiteRecuperacion, validado(email()), ctrl.recuperar);
router.post(
  '/restablecer',
  limiteRecuperacion,
  validado(body('token').isString().matches(/^[a-f0-9]{64}$/).withMessage('El enlace de recuperación no es válido.'), passwordNueva()),
  ctrl.restablecer,
);

export default router;
