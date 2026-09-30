/**
 * Enrutador principal de la API (/api).
 */
import { Router } from 'express';
import * as analitica from '../controllers/analitica.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { protegerCsrf } from '../middlewares/csrf.js';
import { limiteApi } from '../middlewares/limites.js';
import { rutaApiNoEncontrada } from '../middlewares/errores.js';
import authRoutes from './auth.routes.js';
import perfilRoutes from './perfil.routes.js';
import estudioRoutes from './estudio.routes.js';
import simulacrosRoutes from './simulacros.routes.js';
import gamificacionRoutes from './gamificacion.routes.js';
import vantyRoutes from './vanty.routes.js';
import adminRoutes from './admin.routes.js';

const api = Router();

api.use(limiteApi);
api.use(protegerCsrf);

api.get('/salud', (_req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));
api.get('/config/publica', analitica.configPublica);

api.use('/auth', authRoutes);
api.use('/perfil', perfilRoutes);
api.use('/vanty', vantyRoutes);
api.use('/admin', adminRoutes);

api.get('/analitica/dashboard', requireAuth, analitica.panel);
api.get('/analitica/completa', requireAuth, analitica.completa);
api.get('/analitica/puntaje', requireAuth, analitica.puntaje);

// Routers montados en la raíz de /api (cada uno protege sus rutas con requireAuth).
api.use(estudioRoutes);
api.use(simulacrosRoutes);
api.use(gamificacionRoutes);

api.use(rutaApiNoEncontrada);

export default api;
