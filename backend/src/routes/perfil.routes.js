import { Router } from 'express';
import { body } from 'express-validator';
import * as ctrl from '../controllers/perfil.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { validado } from '../middlewares/validar.js';
import {
  email, enteroBody, fechaOpcional, grado, nombre, passwordNueva, passwordRequerida, textoOpcional,
} from '../validators/comunes.js';

const router = Router();
router.use(requireAuth);

const codigoItem = (campo, prefijo) =>
  body(campo).isString().matches(new RegExp(`^${prefijo}-[a-z-]{2,30}$`)).withMessage(`Selecciona un ${campo} válido.`);

router.get('/', ctrl.obtener);
router.put(
  '/',
  validado(
    nombre('nombre', { opcional: true }),
    textoOpcional('nombre_mostrar', 40),
    textoOpcional('bio', 280),
    textoOpcional('colegio', 120),
    textoOpcional('ciudad', 80),
    grado(),
  ),
  ctrl.actualizar,
);
router.put(
  '/avatar',
  validado(codigoItem('color', 'color'), codigoItem('expresion', 'expresion'), codigoItem('accesorio', 'accesorio'), codigoItem('fondo', 'fondo')),
  ctrl.avatar,
);
router.put('/insignia-destacada', validado(enteroBody('insignia_id', { min: 1 })), ctrl.insigniaDestacada);
router.put(
  '/configuracion',
  validado(
    fechaOpcional('fecha_icfes'),
    enteroBody('meta_diaria_min', { min: 5, max: 240 }),
    enteroBody('meta_puntaje', { min: 0, max: 500 }),
    body('tema_interfaz').optional().isIn(['claro', 'oscuro', 'sistema']).withMessage('Tema no válido.'),
    body('recordatorios').optional().isBoolean().withMessage('Valor no válido.').toBoolean(),
  ),
  ctrl.configuracion,
);
router.put('/email', validado(email(), passwordRequerida()), ctrl.email);
router.put('/password', validado(passwordRequerida('actual'), passwordNueva('nueva')), ctrl.password);
router.delete('/', validado(passwordRequerida()), ctrl.eliminar);

export default router;
