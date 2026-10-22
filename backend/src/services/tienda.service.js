/**
 * Tienda: personalización del avatar y protectores de racha.
 * Las insignias ya no se venden: se ganan con logros, niveles y rachas (las compradas antes se conservan).
 */
import { transaccion, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { AppError, conflicto, noEncontrado } from '../utils/AppError.js';
import { gastarMonedas, resumenJugador } from './gamificacion.service.js';
import { evaluarLogros } from './logros.service.js';

export async function catalogo(usuarioId) {
  const perfil = await una(
    `SELECT p.monedas, p.nivel, p.avatar, r.protectores
       FROM perfiles p JOIN rachas r ON r.usuario_id = p.usuario_id
      WHERE p.usuario_id = $1`,
    [usuarioId],
  );
  const items = await varias(
    `SELECT it.id, it.codigo, it.categoria, it.nombre, it.descripcion, it.precio, it.nivel_requerido, it.datos,
            inv.adquirido_en IS NOT NULL AS adquirido
       FROM items_tienda it
       LEFT JOIN inventario inv ON inv.item_id = it.id AND inv.usuario_id = $1
      ORDER BY it.categoria, it.orden`,
    [usuarioId],
  );
  const equipado = new Set(Object.values(perfil.avatar ?? {}));

  const porCategoria = {};
  for (const item of items) {
    (porCategoria[item.categoria] ??= []).push({
      ...item,
      equipado: equipado.has(item.codigo),
      bloqueado: item.nivel_requerido > perfil.nivel,
    });
  }
  return {
    monedas: perfil.monedas,
    nivel: perfil.nivel,
    avatar: perfil.avatar,
    protectores: { cantidad: perfil.protectores, maximo: REGLAS.topes.protectoresRacha },
    items: porCategoria,
  };
}

/**
 * Compra un artículo de la tienda (`tipo: 'item'`) por su código.
 */
export async function comprar(usuarioId, { tipo, codigo }) {
  if (tipo !== 'item') {
    throw new AppError(400, 'Las insignias ya no se compran: se ganan con logros, niveles y rachas.', { codigo: 'NO_DISPONIBLE' });
  }
  return transaccion(async (cliente) => {
    const { nivel } = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1 FOR UPDATE`, [usuarioId], cliente);
    const item = await una(
      `SELECT id, categoria, nombre, precio, nivel_requerido FROM items_tienda WHERE codigo = $1`,
      [codigo],
      cliente,
    );
    if (!item) throw noEncontrado('El artículo no existe.');
    if (item.nivel_requerido > nivel) throw new AppError(403, `Disponible desde el nivel ${item.nivel_requerido}.`, { codigo: 'BLOQUEADO' });

    if (item.categoria === 'protector') {
      const { protectores } = await una(`SELECT protectores FROM rachas WHERE usuario_id = $1 FOR UPDATE`, [usuarioId], cliente);
      if (protectores >= REGLAS.topes.protectoresRacha) {
        throw conflicto(`Ya tienes el máximo de ${REGLAS.topes.protectoresRacha} protectores de racha.`);
      }
      await gastarMonedas(cliente, usuarioId, item.precio, `item:${codigo}`);
      await cliente.query(`UPDATE rachas SET protectores = protectores + 1 WHERE usuario_id = $1`, [usuarioId]);
    } else {
      const yaLoTiene = await una(`SELECT 1 AS si FROM inventario WHERE usuario_id = $1 AND item_id = $2`, [usuarioId, item.id], cliente);
      if (yaLoTiene) throw conflicto('Ya tienes este artículo.');
      if (item.precio > 0) await gastarMonedas(cliente, usuarioId, item.precio, `item:${codigo}`);
      await cliente.query(`INSERT INTO inventario (usuario_id, item_id) VALUES ($1, $2)`, [usuarioId, item.id]);
    }

    const eventos = await evaluarLogros(cliente, usuarioId);
    return { ok: true, comprado: item.nombre, eventos, jugador: await resumenJugador(cliente, usuarioId) };
  });
}
