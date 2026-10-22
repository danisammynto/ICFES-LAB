/**
 * Página de bienvenida: días que faltan para el Saber 11 de cada calendario (A y B), solo si el
 * ICFES ya publicó la fecha oficial; si no, la época del año en que suele presentarse cada uno.
 */
import { api } from '../core/api.js';
import { $, h } from '../core/dom.js';

try {
  const { calendarios_icfes: calendarios } = await api.get('/api/config/publica', { redirigir401: false });
  const letras = ['A', 'B'].filter((l) => calendarios?.[l]);
  const conFecha = letras.filter((l) => calendarios[l].dias != null && calendarios[l].dias >= 0);
  const texto = $('#texto-cuenta-landing');
  if (conFecha.length) {
    texto.replaceChildren('Faltan ', ...conFecha.flatMap((l, i) => [
      i ? ' · ' : '', h('strong', {}, String(calendarios[l].dias)), ` días para el Saber 11 Calendario ${l}`,
    ]));
  } else if (letras.length) {
    texto.textContent = `Saber 11: ${letras.map((l) => `Calendario ${l} ${calendarios[l].meses}`).join(' · ')}.`;
  }
  if (letras.length) $('#cuenta-landing').hidden = false;
} catch {
  /* La página funciona sin la cuenta regresiva. */
}
