/**
 * Tienda: personalización del avatar, insignias de colección y protectores de racha.
 */
import { transaccion, una, varias } from '../config/db.js';
import { REGLAS } from '../config/reglas.js';
import { AppError, conflicto, noEncontrado } from '../utils/AppError.js';
import { darInsignia, gastarMonedas, resumenJugador } from './gamificacion.service.js';
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
  const insignias = await varias(
    `SELECT i.id, i.codigo, i.nombre, i.descripcion, i.icono, i.color, i.rareza, i.precio_monedas AS precio,
            i.nivel_requerido, ui.obtenida_en IS NOT NULL AS adquirida
       FROM insignias i
       LEFT JOIN usuario_insignias ui ON ui.insignia_id = i.id AND ui.usuario_id = $1
      WHERE i.origen = 'tienda'
      ORDER BY i.orden`,
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
    insignias: insignias.map((i) => ({ ...i, bloqueada: i.nivel_requerido > perfil.nivel })),
  };
}

/**
 * Compra un artículo (`tipo: 'item'`) o una insignia (`tipo: 'insignia'`) por su código.
 */
export async function comprar(usuarioId, { tipo, codigo }) {
  return transaccion(async (cliente) => {
    const { nivel } = await una(`SELECT nivel FROM perfiles WHERE usuario_id = $1 FOR UPDATE`, [usuarioId], cliente);
    let descripcion;

    if (tipo === 'insignia') {
      const insignia = await una(
        `SELECT id, nombre, precio_monedas, nivel_requerido FROM insignias WHERE codigo = $1 AND origen = 'tienda'`,
        [codigo],
        cliente,
      );
      if (!insignia) throw noEncontrado('La insignia no existe en la tienda.');
      if (insignia.nivel_requerido > nivel) throw new AppError(403, `Disponible desde el nivel ${insignia.nivel_requerido}.`, { codigo: 'BLOQUEADO' });
      const yaLaTiene = await una(`SELECT 1 AS si FROM usuario_insignias WHERE usuario_id = $1 AND insignia_id = $2`, [usuarioId, insignia.id], cliente);
      if (yaLaTiene) throw conflicto('Ya tienes esta insignia.');
      await gastarMonedas(cliente, usuarioId, insignia.precio_monedas, `insignia:${codigo}`);
      await darInsignia(cliente, usuarioId, insignia.id);
      descripcion = insignia.nombre;
    } else {
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
      descripcion = item.nombre;
    }

    const eventos = await evaluarLogros(cliente, usuarioId);
    return { ok: true, comprado: descripcion, eventos, jugador: await resumenJugador(cliente, usuarioId) };
  });
}
