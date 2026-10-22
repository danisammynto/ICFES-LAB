/**
 * Controlador de estudio: materias, lecciones y práctica.
 */
import { detalleMateria, listarMaterias } from '../services/catalogo.service.js';
import { completarLeccion, leccionDelDia, obtenerLeccion } from '../services/lecciones.service.js';
import { preguntasDeSubtema, responderPregunta, siguientePregunta } from '../services/practica.service.js';
import { datos } from '../validators/comunes.js';

export async function materias(req, res) {
  res.json({ materias: await listarMaterias(req.usuario.id) });
}

export async function materia(req, res) {
  res.json(await detalleMateria(req.usuario.id, datos(req).slug));
}

export async function leccion(req, res) {
  res.json(await obtenerLeccion(req.usuario.id, datos(req).id));
}

export async function delDia(req, res) {
  res.json(await leccionDelDia(req.usuario.id));
}

export async function completar(req, res) {
  const d = datos(req);
  res.json(await completarLeccion(req.usuario.id, d.id, {
    tiempoSeg: d.tiempo_seg ?? 0,
    aciertos: d.aciertos ?? 0,
    total: d.total ?? 0,
  }));
}

export async function preguntasSubtema(req, res) {
  res.json(await preguntasDeSubtema(req.usuario.id, datos(req).slug));
}

export async function siguiente(req, res) {
  const d = datos(req);
  const excluir = String(d.excluir ?? '')
    .split(',')
    .map((x) => Number.parseInt(x, 10))
    .filter((x) => Number.isInteger(x) && x > 0)
    .slice(0, 200);
  res.json(await siguientePregunta(req.usuario.id, { subtema: d.subtema, materia: d.materia, excluir }));
}

export async function responder(req, res) {
  const d = datos(req);
  res.json(await responderPregunta(req.usuario.id, {
    preguntaId: d.pregunta_id,
    opcionId: d.opcion_id ?? null,
    tiempoMs: d.tiempo_ms ?? 0,
    origen: d.origen ?? 'practica',
  }));
}
