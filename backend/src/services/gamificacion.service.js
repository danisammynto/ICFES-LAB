/**
 * Motor de gamificación: XP, monedas, niveles e insignias.
 *
 * Las funciones que reciben `cliente` se ejecutan dentro de la transacción de quien las
 * llama y devuelven una lista de "eventos" que el frontend muestra como notificaciones
 * (+XP, subida de nivel, insignia nueva…).
 */
import { pool, una, varias } from '../config/db.js';
import { fechaLocal } from '../utils/fechas.js';
import { AppError } from '../utils/AppError.js';

/** Registra un movimiento en el historial de recompensas. */
async function registrarMovimiento(cliente, usuarioId, tipo, cantidad, motivo, referencia) {
  if (!cantidad) return;
  await cliente.query(
    `INSERT INTO historial_recompensas (usuario_id, tipo, cantidad, motivo, referencia)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuarioId, tipo, cantidad, motivo, referencia],
  );
}

/** Suma XP y monedas ganadas al resumen del día. */
async function sumarAlDia(cliente, usuarioId, xp, monedas) {
  if (xp <= 0 && monedas <= 0) return;
  await cliente.query(
    `INSERT INTO actividad_diaria (usuario_id, fecha, xp_ganado, monedas_ganadas)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_id, fecha) DO UPDATE
       SET xp_ganado = actividad_diaria.xp_ganado + EXCLUDED.xp_ganado,
           monedas_ganadas = actividad_diaria.monedas_ganadas + EXCLUDED.monedas_ganadas`,
    [usuarioId, fechaLocal(), Math.max(xp, 0), Math.max(monedas, 0)],
  );
}

/** Entrega una insignia (idempotente). Devuelve true si es nueva. */
export async function darInsignia(cliente, usuarioId, insigniaId) {
  const { rowCount } = await cliente.query(
    `INSERT INTO usuario_insignias (usuario_id, insignia_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [usuarioId, insigniaId],
  );
  return rowCount > 0;
}

/**
 * Otorga XP y/o monedas y procesa las subidas de nivel.
 * @returns {Promise<object[]>} eventos: xp, monedas, nivel.
 */
export async function otorgar(cliente, usuarioId, { xp = 0, monedas = 0, motivo, referencia = null }) {
  const eventos = [];
  xp = Math.max(0, Math.round(xp));
  monedas = Math.max(0, Math.round(monedas));
  if (!xp && !monedas) return eventos;

  const perfil = await una(
    `UPDATE perfiles SET xp = xp + $2, monedas = monedas + $3
      WHERE usuario_id = $1
      RETURNING xp, monedas, nivel`,
    [usuarioId, xp, monedas],
    cliente,
  );
  await registrarMovimiento(cliente, usuarioId, 'xp', xp, motivo, referencia);
  await registrarMovimiento(cliente, usuarioId, 'monedas', monedas, motivo, referencia);
  await sumarAlDia(cliente, usuarioId, xp, monedas);

  if (xp) eventos.push({ tipo: 'xp', cantidad: xp, motivo });
  if (monedas) eventos.push({ tipo: 'monedas', cantidad: monedas, motivo });

  // ¿Subió uno o varios niveles?
  const nuevosNiveles = await varias(
    `SELECT n.numero, n.nombre, n.color, n.icono, n.recompensa_monedas, n.desbloqueos, n.insignia_id,
            i.nombre AS insignia_nombre, i.icono AS insignia_icono, i.color AS insignia_color
       FROM niveles n
       LEFT JOIN insignias i ON i.id = n.insignia_id
      WHERE n.numero > $1 AND n.xp_minimo <= $2
      ORDER BY n.numero`,
    [perfil.nivel, perfil.xp],
    cliente,
  );

  for (const nivel of nuevosNiveles) {
    await cliente.query(
      `UPDATE perfiles SET nivel = $2, monedas = monedas + $3 WHERE usuario_id = $1`,
      [usuarioId, nivel.numero, nivel.recompensa_monedas],
    );
    await registrarMovimiento(cliente, usuarioId, 'monedas', nivel.recompensa_monedas, 'nivel', `nivel:${nivel.numero}`);
    await sumarAlDia(cliente, usuarioId, 0, nivel.recompensa_monedas);
    const insigniaNueva = nivel.insignia_id ? await darInsignia(cliente, usuarioId, nivel.insignia_id) : false;

    eventos.push({
      tipo: 'nivel',
      nivel: nivel.numero,
      nombre: nivel.nombre,
      color: nivel.color,
      icono: nivel.icono,
      monedas: nivel.recompensa_monedas,
      desbloqueos: nivel.desbloqueos,
      insignia: insigniaNueva
        ? { nombre: nivel.insignia_nombre, icono: nivel.insignia_icono, color: nivel.insignia_color }
        : null,
    });
  }
  return eventos;
}

/**
 * Descuenta monedas (compras). Falla si el saldo no alcanza.
 */
export async function gastarMonedas(cliente, usuarioId, cantidad, referencia) {
  const fila = await una(
    `UPDATE perfiles SET monedas = monedas - $2
      WHERE usuario_id = $1 AND monedas >= $2
      RETURNING monedas`,
    [usuarioId, cantidad],
    cliente,
  );
  if (!fila) throw new AppError(400, 'No tienes suficientes monedas para esta compra.', { codigo: 'SIN_MONEDAS' });
  await registrarMovimiento(cliente, usuarioId, 'monedas', -cantidad, 'compra', referencia);
  return fila.monedas;
}

/** Nivel actual, siguiente nivel y porcentaje de avance. */
export async function progresoNivel(usuarioId, cliente = pool) {
  const perfil = await una(`SELECT xp, nivel, monedas FROM perfiles WHERE usuario_id = $1`, [usuarioId], cliente);
  const niveles = await varias(`SELECT numero, nombre, xp_minimo, color, icono FROM niveles ORDER BY numero`, [], cliente);
  const actual = niveles.find((n) => n.numero === perfil.nivel) ?? niveles[0];
  const siguiente = niveles.find((n) => n.numero === perfil.nivel + 1) ?? null;
  const rango = siguiente ? siguiente.xp_minimo - actual.xp_minimo : 1;
  const avance = siguiente ? Math.min(100, Math.round((100 * (perfil.xp - actual.xp_minimo)) / rango)) : 100;

  return {
    xp: perfil.xp,
    monedas: perfil.monedas,
    nivel: actual,
    siguiente: siguiente ? { ...siguiente, faltan: Math.max(0, siguiente.xp_minimo - perfil.xp) } : null,
    progreso: avance,
  };
}

/** Resumen compacto para refrescar la cabecera tras cada acción. */
export async function resumenJugador(cliente, usuarioId) {
  return una(
    `SELECT p.xp, p.nivel, p.monedas, n.nombre AS nivel_nombre, r.actual AS racha, r.protectores
       FROM perfiles p
       JOIN niveles n ON n.numero = p.nivel
       JOIN rachas r ON r.usuario_id = p.usuario_id
      WHERE p.usuario_id = $1`,
    [usuarioId],
    cliente,
  );
}
