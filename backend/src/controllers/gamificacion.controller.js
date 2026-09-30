/**
 * Controlador de gamificación (niveles, logros, insignias, rachas) y tienda.
 */
import { varias } from '../config/db.js';
import { progresoNivel } from '../services/gamificacion.service.js';
import { listarLogros } from '../services/logros.service.js';
import { calendarioActividad, estadoRacha } from '../services/racha.service.js';
import { catalogo, comprar } from '../services/tienda.service.js';
import { datos } from '../validators/comunes.js';

export async function resumen(req, res) {
  const [nivel, racha] = await Promise.all([progresoNivel(req.usuario.id), estadoRacha(req.usuario.id)]);
  res.json({ ...nivel, racha });
}

/** Niveles con lo que desbloquea cada uno (subtemas y retos reales del catálogo). */
export async function niveles(req, res) {
  const [lista, subtemas, retos, perfil] = await Promise.all([
    varias(`SELECT n.numero, n.nombre, n.xp_minimo, n.descripcion, n.color, n.icono, n.recompensa_monedas, n.desbloqueos,
                   i.nombre AS insignia, i.icono AS insignia_icono
              FROM niveles n LEFT JOIN insignias i ON i.id = n.insignia_id ORDER BY n.numero`),
    varias(`SELECT s.nivel_requerido, s.nombre, m.nombre AS materia FROM subtemas s
              JOIN temas t ON t.id = s.tema_id JOIN materias m ON m.id = t.materia_id ORDER BY m.orden, s.orden`),
    varias(`SELECT nivel_requerido, titulo FROM simulacros WHERE tipo = 'reto' AND activo ORDER BY numero`),
    progresoNivel(req.usuario.id),
  ]);
  res.json({
    actual: perfil,
    niveles: lista.map((n) => ({
      ...n,
      alcanzado: perfil.xp >= n.xp_minimo,
      subtemas: subtemas.filter((s) => s.nivel_requerido === n.numero).map((s) => `${s.nombre} (${s.materia})`),
      retos: retos.filter((r) => r.nivel_requerido === n.numero).map((r) => r.titulo),
    })),
  });
}

export async function logros(req, res) {
  res.json({ logros: await listarLogros(req.usuario.id) });
}

export async function insignias(req, res) {
  const lista = await varias(
    `SELECT i.id, i.codigo, i.nombre, i.descripcion, i.icono, i.color, i.rareza, i.origen, i.precio_monedas,
            ui.obtenida_en
       FROM insignias i
       LEFT JOIN usuario_insignias ui ON ui.insignia_id = i.id AND ui.usuario_id = $1
      ORDER BY i.orden`,
    [req.usuario.id],
  );
  res.json({ insignias: lista.map((i) => ({ ...i, obtenida: Boolean(i.obtenida_en) })) });
}

export async function racha(req, res) {
  const [estado, calendario, recompensas] = await Promise.all([
    estadoRacha(req.usuario.id),
    calendarioActividad(req.usuario.id, 26),
    varias(
      `SELECT r.dias, r.nombre, r.xp, r.monedas, r.protectores, i.nombre AS insignia, i.icono AS insignia_icono,
              u.obtenida_en
         FROM recompensas_racha r
         LEFT JOIN insignias i ON i.id = r.insignia_id
         LEFT JOIN usuario_recompensas_racha u ON u.dias = r.dias AND u.usuario_id = $1
        ORDER BY r.dias`,
      [req.usuario.id],
    ),
  ]);
  res.json({ ...estado, calendario, recompensas: recompensas.map((r) => ({ ...r, obtenida: Boolean(r.obtenida_en) })) });
}

export async function tienda(req, res) {
  res.json(await catalogo(req.usuario.id));
}

export async function compra(req, res) {
  const d = datos(req);
  res.json(await comprar(req.usuario.id, { tipo: d.tipo, codigo: d.codigo }));
}
