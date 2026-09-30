/**
 * Protección de rutas del frontend (del lado del servidor).
 *
 * · Páginas privadas sin sesión → redirige a /login?next=…
 * · /admin sin rol de administrador → redirige a /inicio
 * · Páginas de invitado (login, registro…) con sesión activa → redirige a /inicio
 *
 * Así el HTML de las secciones privadas nunca se entrega a quien no ha iniciado sesión.
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolverSesion } from './auth.js';

const PUBLICAS = new Set(['/', '/login', '/registro', '/recuperar', '/restablecer', '/404']);
const SOLO_INVITADOS = new Set(['/', '/login', '/registro', '/recuperar']);
const SOLO_ADMIN = new Set(['/admin']);

export function crearProteccionPaginas(directorioFrontend) {
  // ¿La ruta corresponde a una página HTML del frontend? ("/inicio" → inicio.html)
  const esPagina = (ruta) => ruta === '/'
    || (/^\/[a-z0-9-]+$/.test(ruta) && fs.existsSync(path.join(directorioFrontend, `${ruta.slice(1)}.html`)));

  return async function protegerPaginas(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    let ruta = req.path.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
    if (ruta === '/index') ruta = '/';
    if (!esPagina(ruta)) return next();

    // El HTML nunca se guarda en caché: siempre se re-evalúa la sesión.
    res.set('Cache-Control', 'no-store');

    const usuario = await resolverSesion(req);

    if (PUBLICAS.has(ruta)) {
      if (usuario && SOLO_INVITADOS.has(ruta)) return res.redirect(302, '/inicio');
      return next();
    }

    if (!usuario) {
      const destino = encodeURIComponent(req.originalUrl);
      return res.redirect(302, `/login?next=${destino}`);
    }
    if (SOLO_ADMIN.has(ruta) && usuario.rol !== 'admin') return res.redirect(302, '/inicio');
    return next();
  };
}
