/**
 * Envío de correos (recuperación de contraseña).
 * Sin SMTP configurado (desarrollo) el enlace se muestra en la consola del servidor.
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

let transporte = null;

function obtenerTransporte() {
  if (!env.smtp.host) return null;
  transporte ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.puerto,
    secure: env.smtp.puerto === 465,
    auth: env.smtp.usuario ? { user: env.smtp.usuario, pass: env.smtp.clave } : undefined,
  });
  return transporte;
}

const escapar = (texto) => String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function enviarCorreoRecuperacion(usuario, enlace) {
  const nombre = usuario.nombre.split(' ')[0];
  const asunto = 'Recupera tu contraseña de ICFES Lab';
  const texto = [
    `Hola, ${nombre}:`,
    '',
    'Recibimos una solicitud para restablecer la contraseña de tu cuenta en ICFES Lab.',
    'Abre este enlace para crear una nueva (es válido durante 1 hora y solo se puede usar una vez):',
    enlace,
    '',
    'Si no fuiste tú, ignora este correo: tu contraseña seguirá siendo la misma.',
    '',
    '— Equipo ICFES Lab',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#23264f">
      <h2 style="color:#484ea2">ICFES Lab</h2>
      <p>Hola, ${escapar(nombre)}:</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${escapar(enlace)}" style="background:#484ea2;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Crear nueva contraseña</a>
      </p>
      <p style="font-size:13px;color:#5b5f86">El enlace es válido durante 1 hora y solo se puede usar una vez. Si no fuiste tú, ignora este correo.</p>
    </div>`;

  const smtp = obtenerTransporte();
  if (!smtp) {
    console.info(`[correo] SMTP no configurado. Enlace de recuperación para ${usuario.email}:\n  ${enlace}`);
    return { modo: 'consola' };
  }
  try {
    await smtp.sendMail({ from: env.smtp.remitente, to: usuario.email, subject: asunto, text: texto, html });
    return { modo: 'smtp' };
  } catch (error) {
    console.error('[correo] Error al enviar:', error.message);
    throw new AppError(503, 'No pudimos enviar el correo en este momento. Intenta de nuevo más tarde.');
  }
}
