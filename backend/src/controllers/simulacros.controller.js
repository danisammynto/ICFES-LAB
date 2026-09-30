/**
 * Controlador de simulacros, minisimulacros y retos.
 */
import * as simulacros from '../services/simulacros.service.js';
import { datos } from '../validators/comunes.js';

export async function listar(req, res) {
  res.json(await simulacros.listarSimulacros(req.usuario.id));
}

export async function historial(req, res) {
  res.json({ resultados: await simulacros.historial(req.usuario.id) });
}

export async function iniciar(req, res) {
  res.status(201).json(await simulacros.iniciarSimulacro(req.usuario.id, datos(req).id));
}

export async function intento(req, res) {
  res.json(await simulacros.obtenerIntento(req.usuario.id, datos(req).id));
}

export async function iniciarSesion(req, res) {
  const d = datos(req);
  res.json(await simulacros.iniciarSesion(req.usuario.id, d.id, d.numero));
}

export async function guardarRespuesta(req, res) {
  const d = datos(req);
  const cambios = { tiempoMs: d.tiempo_ms ?? 0 };
  if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'opcion_id')) cambios.opcionId = d.opcion_id ?? null;
  if (d.marcada !== undefined) cambios.marcada = d.marcada;
  res.json(await simulacros.guardarRespuesta(req.usuario.id, d.id, d.preguntaId, cambios));
}

export async function finalizarSesion(req, res) {
  const d = datos(req);
  res.json(await simulacros.finalizarSesion(req.usuario.id, d.id, d.numero));
}

export async function finalizar(req, res) {
  res.json(await simulacros.finalizarIntento(req.usuario.id, datos(req).id));
}

export async function abandonar(req, res) {
  res.json(await simulacros.abandonarIntento(req.usuario.id, datos(req).id));
}

export async function resultado(req, res) {
  res.json(await simulacros.obtenerResultado(req.usuario.id, datos(req).id));
}
