/**
 * Controlador de perfil y configuración de cuenta.
 */
import * as perfilService from '../services/perfil.service.js';
import { establecerCookieSesion, limpiarCookieSesion } from '../middlewares/auth.js';
import { datos } from '../validators/comunes.js';

export async function obtener(req, res) {
  res.json(await perfilService.obtenerPerfil(req.usuario.id));
}

export async function actualizar(req, res) {
  const d = datos(req);
  res.json(await perfilService.actualizarPerfil(req.usuario.id, {
    nombre: d.nombre,
    nombreMostrar: d.nombre_mostrar,
    bio: d.bio,
    colegio: d.colegio,
    ciudad: d.ciudad,
    grado: d.grado,
  }));
}

export async function avatar(req, res) {
  const d = datos(req);
  res.json({ avatar: await perfilService.actualizarAvatar(req.usuario.id, d) });
}

export async function insigniaDestacada(req, res) {
  res.json(await perfilService.destacarInsignia(req.usuario.id, datos(req).insignia_id ?? null));
}

export async function configuracion(req, res) {
  const d = datos(req);
  res.json(await perfilService.actualizarConfiguracion(req.usuario.id, {
    fechaIcfes: d.fecha_icfes,
    metaDiariaMin: d.meta_diaria_min,
    metaPuntaje: d.meta_puntaje,
    temaInterfaz: d.tema_interfaz,
    recordatorios: d.recordatorios,
  }));
}

export async function calendario(req, res) {
  const d = datos(req);
  res.json(await perfilService.actualizarCalendario(req.usuario.id, {
    calendario: d.calendario_icfes,
    fechaIcfes: d.fecha_icfes ?? null,
    conFecha: Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fecha_icfes'),
  }));
}

export async function email(req, res) {
  const d = datos(req);
  res.json(await perfilService.cambiarEmail(req.usuario.id, { email: d.email, password: d.password }));
}

export async function password(req, res) {
  const d = datos(req);
  const token = await perfilService.cambiarPassword(req.usuario.id, { actual: d.actual, nueva: d.nueva });
  establecerCookieSesion(res, token);
  res.json({ mensaje: 'Contraseña actualizada. Cerramos tus otras sesiones por seguridad.' });
}

export async function eliminar(req, res) {
  await perfilService.eliminarCuenta(req.usuario.id, datos(req).password);
  limpiarCookieSesion(res);
  res.json({ mensaje: 'Tu cuenta fue eliminada. ¡Te deseamos éxito en el ICFES!' });
}
