/**
 * Cliente HTTP de la API.
 * · Envía la cookie de sesión (httpOnly) y la cabecera anti-CSRF X-Requested-With.
 * · Convierte las respuestas de error en ErrorApi con el mensaje del servidor.
 * · Si la sesión expiró (401) redirige al inicio de sesión.
 */

export class ErrorApi extends Error {
  constructor(mensaje, { status = 0, codigo = null, detalles = null } = {}) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

const CABECERAS = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

export function irALogin() {
  const destino = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${destino}`;
}

async function solicitud(metodo, url, cuerpo, { redirigir401 = true } = {}) {
  const opciones = { method: metodo, credentials: 'same-origin', headers: { ...CABECERAS } };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch {
    throw new ErrorApi('No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  }

  const esJson = respuesta.headers.get('content-type')?.includes('application/json');
  const datos = esJson ? await respuesta.json().catch(() => ({})) : {};

  if (respuesta.status === 401 && redirigir401 && !url.startsWith('/api/auth/login')) {
    irALogin();
  }
  if (!respuesta.ok) {
    throw new ErrorApi(datos.error || 'Ocurrió un error inesperado.', {
      status: respuesta.status,
      codigo: datos.codigo,
      detalles: datos.detalles,
    });
  }
  return datos;
}

export const api = {
  get: (url, opciones) => solicitud('GET', url, undefined, opciones),
  post: (url, cuerpo = {}, opciones) => solicitud('POST', url, cuerpo, opciones),
  put: (url, cuerpo = {}, opciones) => solicitud('PUT', url, cuerpo, opciones),
  patch: (url, cuerpo = {}, opciones) => solicitud('PATCH', url, cuerpo, opciones),
  del: (url, cuerpo, opciones) => solicitud('DELETE', url, cuerpo, opciones),
};

/**
 * POST que responde con Server-Sent Events (chat de Vanty).
 * Llama a `alEvento(nombre, datos)` por cada evento recibido.
 */
export async function flujo(url, cuerpo, alEvento, { signal } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { ...CABECERAS, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(cuerpo),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ErrorApi('No hay conexión con el servidor.');
  }

  if (!respuesta.ok || !respuesta.headers.get('content-type')?.includes('text/event-stream')) {
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 401) irALogin();
    throw new ErrorApi(datos.error || 'No se pudo enviar el mensaje.', { status: respuesta.status, codigo: datos.codigo });
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += decodificador.decode(value, { stream: true });
    let separador = pendiente.indexOf('\n\n');
    while (separador >= 0) {
      const bloque = pendiente.slice(0, separador);
      pendiente = pendiente.slice(separador + 2);
      const evento = /^event: (.*)$/m.exec(bloque)?.[1] ?? 'message';
      const datos = /^data: (.*)$/m.exec(bloque)?.[1];
      alEvento(evento, datos ? JSON.parse(datos) : null);
      separador = pendiente.indexOf('\n\n');
    }
  }
}
