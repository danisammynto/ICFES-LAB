/*
 * Aplica el tema guardado (claro/oscuro) antes de pintar la página para evitar parpadeos.
 * Es un script clásico (no módulo) que se carga en el <head>.
 */
(function () {
  try {
    var tema = localStorage.getItem('icfeslab-tema');
    if (tema === 'claro' || tema === 'oscuro') document.documentElement.setAttribute('data-tema', tema);
  } catch (e) {
    /* Almacenamiento no disponible: se usa la preferencia del sistema. */
  }
})();
