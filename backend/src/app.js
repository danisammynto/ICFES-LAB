/**
 * Configuración de la aplicación Express: seguridad, API, frontend estático y errores.
 */
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import api from './routes/index.js';
import { crearProteccionPaginas } from './middlewares/paginas.js';
import { crearManejadorErrores } from './middlewares/errores.js';
import { AppError } from './utils/AppError.js';

/** Registro breve de peticiones a la API (solo en desarrollo). */
function registroPeticiones(req, res, next) {
  if (!req.originalUrl.startsWith('/api/')) return next();
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms.toFixed(0)} ms)`);
  });
  next();
}

export function crearApp() {
  const app = express();
  const directorioFrontend = path.join(env.raiz, 'frontend');

  app.disable('x-powered-by');
  if (env.confiarProxy) app.set('trust proxy', 1);

  // Cabeceras de seguridad. La CSP solo permite scripts propios (sin scripts en línea).
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: env.publicaPorHttps ? [] : null,
      },
    },
    // HSTS solo si la app se publica por HTTPS (en una red local por HTTP no aplica).
    strictTransportSecurity: env.publicaPorHttps,
    crossOriginEmbedderPolicy: false,
  }));

  // Compresión gzip, excepto en el stream de Vanty (SSE).
  app.use(compression({
    filter: (req, res) => !String(res.getHeader('Content-Type') ?? '').includes('text/event-stream') && compression.filter(req, res),
  }));

  app.use(cookieParser());
  // La importación de preguntas admite cuerpos más grandes que el resto de la API.
  app.use('/api/admin/preguntas/importar', express.json({ limit: '3mb' }));
  app.use(express.json({ limit: '200kb' }));
  if (!env.esProduccion) app.use(registroPeticiones);

  app.use('/api', api);

  // Frontend: protección de páginas privadas + archivos estáticos con URLs limpias (/inicio → inicio.html).
  app.use(crearProteccionPaginas(directorioFrontend));
  app.use('/vendor/chart.js', express.static(path.join(env.raiz, 'node_modules', 'chart.js', 'dist'), { maxAge: '7d' }));
  app.use(express.static(directorioFrontend, { extensions: ['html'], maxAge: env.esProduccion ? '1h' : 0 }));

  app.use((_req, _res, next) => next(new AppError(404, 'Página no encontrada.', { codigo: 'NO_ENCONTRADO' })));
  app.use(crearManejadorErrores(directorioFrontend));
  return app;
}
