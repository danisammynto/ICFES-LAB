/**
 * Página de bienvenida: muestra la cuenta regresiva global al Saber 11.
 */
import { api } from '../core/api.js';
import { $ } from '../core/dom.js';

async function iniciarLanding() {
  try {
    const config = await api.get('/api/config/publica', { redirigir401: false });
    if (config && config.fecha_icfes) {
      const { dias, nombre } = config.fecha_icfes;
      if (dias != null && dias >= 0) {
        const elementoDias = $('#dias-landing');
        const elementoNombre = $('#nombre-examen');
        const elementoCuenta = $('#cuenta-landing');

        if (elementoDias) elementoDias.textContent = dias;
        if (elementoNombre) elementoNombre.textContent = nombre;
        if (elementoCuenta) elementoCuenta.hidden = false;
      }
    }
  } catch (error) {
    /* Si la API no está disponible en el entorno estático, la landing sigue funcionando */
    console.warn("No se pudo cargar la configuración remota de la API:", error);
  }
}

// Ejecutar al cargar la página
iniciarLanding();
