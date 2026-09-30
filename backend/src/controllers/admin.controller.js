/**
 * Controlador del panel de administración.
 */
import { varias } from '../config/db.js';
import * as admin from '../services/admin.service.js';
import { datos } from '../validators/comunes.js';

export async function resumen(_req, res) {
  res.json(await admin.resumen());
}

export async function catalogo(_req, res) {
  const subtemas = await varias(
    `SELECT s.slug, s.nombre, m.slug AS materia_slug, m.nombre AS materia
       FROM subtemas s JOIN temas t ON t.id = s.tema_id JOIN materias m ON m.id = t.materia_id
      ORDER BY m.orden, t.orden, s.orden`,
  );
  res.json({ subtemas });
}

export async function obtenerConfiguracion(_req, res) {
  res.json(await admin.obtenerConfiguracion());
}

export async function actualizarConfiguracion(req, res) {
  const d = datos(req);
  res.json(await admin.actualizarConfiguracion({ fechaIcfes: d.fecha_icfes, vanty: d.vanty }));
}

export async function listarPreguntas(req, res) {
  const d = datos(req);
  res.json(await admin.listarPreguntas({
    materia: d.materia,
    subtema: d.subtema,
    q: d.q,
    estado: d.estado,
    pagina: d.pagina ?? 1,
  }));
}

export async function obtenerPregunta(req, res) {
  res.json(await admin.obtenerPregunta(datos(req).id));
}

export async function crearPregunta(req, res) {
  res.status(201).json(await admin.guardarPreguntaAdmin(req.body));
}

export async function actualizarPregunta(req, res) {
  res.json(await admin.guardarPreguntaAdmin(req.body, datos(req).id));
}

export async function estadoPregunta(req, res) {
  const d = datos(req);
  res.json(await admin.cambiarEstadoPregunta(d.id, d.activa));
}

export async function importar(req, res) {
  res.json(await admin.importar(req.body));
}

export async function listarUsuarios(req, res) {
  const d = datos(req);
  res.json(await admin.listarUsuarios({ q: d.q, pagina: d.pagina ?? 1 }));
}

export async function actualizarUsuario(req, res) {
  const d = datos(req);
  res.json(await admin.actualizarUsuario(req.usuario.id, d.id, { activo: d.activo, rol: d.rol }));
}
