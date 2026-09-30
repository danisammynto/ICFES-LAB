/**
 * Controlador de autenticación.
 */
import * as authService from '../services/auth.service.js';
import { establecerCookieSesion, limpiarCookieSesion, resolverSesion } from '../middlewares/auth.js';
import { datos } from '../validators/comunes.js';

export async function registro(req, res) {
  const d = datos(req);
  const { usuario, token } = await authService.registrar({
    nombre: d.nombre,
    email: d.email,
    password: d.password,
    grado: d.grado || null,
    fechaIcfes: d.fecha_icfes || null,
  });
  establecerCookieSesion(res, token);
  res.status(201).json({ usuario, mensaje: '¡Bienvenido a ICFES Lab!' });
}

export async function login(req, res) {
  const d = datos(req);
  const { usuario, token } = await authService.iniciarSesion({ email: d.email, password: d.password });
  establecerCookieSesion(res, token);
  res.json({ usuario });
}

export async function logout(req, res) {
  if (req.body?.todas === true) {
    const usuario = await resolverSesion(req);
    if (usuario) await authService.cerrarTodasLasSesiones(usuario.id);
  }
  limpiarCookieSesion(res);
  res.json({ ok: true });
}

export async function me(req, res) {
  res.json(await authService.sesionActual(req.usuario.id));
}

export async function recuperar(req, res) {
  const extra = await authService.solicitarRecuperacion({ email: datos(req).email, ip: req.ip });
  res.json({
    mensaje: 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.',
    ...extra,
  });
}

export async function restablecer(req, res) {
  const d = datos(req);
  await authService.restablecerPassword({ token: d.token, password: d.password });
  limpiarCookieSesion(res);
  res.json({ mensaje: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.' });
}
