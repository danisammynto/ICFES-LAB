/**
 * Carga y valida las variables de entorno (.env en la raíz del proyecto).
 * Todo el backend lee la configuración desde este módulo, nunca de process.env directamente.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.join(raiz, '.env'), quiet: true });

const entorno = process.env.NODE_ENV || 'development';
const esProduccion = entorno === 'production';
const puerto = Number.parseInt(process.env.PORT || '3000', 10);

function entero(nombre, porDefecto) {
  const valor = Number.parseInt(process.env[nombre] ?? '', 10);
  return Number.isFinite(valor) ? valor : porDefecto;
}

// Secreto JWT: obligatorio en producción; en desarrollo se genera uno temporal.
let secretoJwt = process.env.JWT_SECRET || '';
if (secretoJwt.length < 32) {
  if (esProduccion) {
    throw new Error('JWT_SECRET es obligatorio en producción y debe tener al menos 32 caracteres.');
  }
  if (secretoJwt) console.warn('[env] JWT_SECRET es demasiado corto; se usará uno temporal.');
  else console.warn('[env] JWT_SECRET no está definido: se generó uno temporal (las sesiones se pierden al reiniciar).');
  secretoJwt = crypto.randomBytes(48).toString('hex');
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida. Copia .env.example como .env y configúrala.');
}

// La zona horaria se interpola en SQL (AT TIME ZONE), por eso se valida estrictamente.
const zonaHoraria = process.env.APP_TZ || 'America/Bogota';
if (!/^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(zonaHoraria)) {
  throw new Error(`APP_TZ inválida: ${zonaHoraria}`);
}

const claveAnthropic = process.env.ANTHROPIC_API_KEY || '';
const proveedorVanty = (process.env.VANTY_PROVEEDOR || 'auto').toLowerCase();

const urlPublica = (process.env.APP_URL || `http://localhost:${puerto}`).replace(/\/$/, '');
// Publicada por HTTPS: activa la cookie Secure, HSTS y upgrade-insecure-requests. Por HTTP
// (desarrollo o una red local sin certificado) esas protecciones impedirían usar la app.
const publicaPorHttps = urlPublica.startsWith('https://');
if (esProduccion && !process.env.APP_URL) {
  console.warn('[env] APP_URL no está definida: los enlaces de recuperación de contraseña apuntarán a localhost.');
}

export const env = Object.freeze({
  raiz,
  entorno,
  esProduccion,
  puerto,
  urlPublica,
  publicaPorHttps,
  zonaHoraria,
  confiarProxy: process.env.TRUST_PROXY === 'true',

  db: {
    url: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true',
    maxConexiones: entero('DB_POOL_MAX', 10),
  },

  jwt: {
    secreto: secretoJwt,
    expira: process.env.JWT_EXPIRES_IN || '7d',
  },

  cookie: {
    nombre: 'icfeslab_token',
    // Además, la cookie es Secure en cualquier petición que llegue por HTTPS (ver middlewares/auth.js).
    segura: publicaPorHttps || process.env.COOKIE_SECURE === 'true',
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    puerto: entero('SMTP_PORT', 587),
    usuario: process.env.SMTP_USER || '',
    clave: process.env.SMTP_PASS || '',
    remitente: process.env.SMTP_FROM || 'ICFES Lab <no-reply@icfeslab.co>',
  },

  vanty: {
    // auto: usa Claude si hay API key; claude: exige la API key; local: nunca llama a la API.
    proveedor: proveedorVanty === 'local' ? 'local' : claveAnthropic ? 'claude' : 'local',
    proveedorSolicitado: proveedorVanty,
    apiKey: claveAnthropic,
    modelo: process.env.VANTY_MODEL || 'claude-opus-5',
    esfuerzo: process.env.VANTY_EFFORT || 'medium',
    // Reintento automático del lado del servidor si el modelo rechaza una solicitud.
    fallbacks: process.env.VANTY_FALLBACKS !== 'false',
  },
});

if (proveedorVanty === 'claude' && !claveAnthropic) {
  console.warn('[env] VANTY_PROVEEDOR=claude pero falta ANTHROPIC_API_KEY: Vanty funcionará en modo local.');
}
