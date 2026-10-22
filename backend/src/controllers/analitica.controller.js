/**
 * Controlador de analítica y configuración pública.
 */
import { analisisCompleto, dashboard } from '../services/analitica.service.js';
import { estimarPuntajes, metaPuntaje } from '../services/puntaje.service.js';
import { fechaIcfes, resumenCalendarios } from '../services/config.service.js';
import { claudeActivo } from '../services/vanty/claude.js';

export async function panel(req, res) {
  res.json(await dashboard(req.usuario.id));
}

export async function completa(req, res) {
  res.json(await analisisCompleto(req.usuario.id));
}

export async function puntaje(req, res) {
  const icfes = await fechaIcfes(req.usuario.id);
  res.json(await estimarPuntajes(req.usuario.id, { fechaExamen: icfes.fecha, meta: await metaPuntaje(req.usuario.id) }));
}

export async function configPublica(_req, res) {
  res.json({
    app: 'ICFES Lab',
    // Fechas oficiales del Saber 11 por calendario (vacías mientras el ICFES no las publique).
    calendarios_icfes: await resumenCalendarios(),
    vanty: { modo: claudeActivo() ? 'claude' : 'local' },
  });
}
