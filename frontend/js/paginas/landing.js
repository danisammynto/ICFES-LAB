/**
 * Página de bienvenida: muestra la cuenta regresiva global al Saber 11.
 */
import { api } from '../core/api.js';
import { $ } from '../core/dom.js';

try {
  const config = await api.get('/api/config/publica', { redirigir401: false });
  const { dias, nombre } = config.fecha_icfes;
  if (dias != null && dias >= 0) {
    $('#dias-landing').textContent = dias;
    $('#nombre-examen').textContent = nombre;
    $('#cuenta-landing').hidden = false;
  }
} catch {
  /* La página funciona sin la cuenta regresiva. */
}
