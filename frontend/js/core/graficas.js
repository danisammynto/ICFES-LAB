/**
 * Ayudas para Chart.js (cargado como script global desde /vendor/chart.js/chart.umd.min.js).
 * Aplica la tipografía y los colores del tema a todas las gráficas.
 */
import { temaEfectivo } from './tema.js';

export const PALETA = {
  indigo: '#484ea2',
  cielo: '#81a1f6',
  lima: '#d5e068',
  lima600: '#a8bb2c',
  durazno: '#fda879',
  coral: '#e5484d',
  menta: '#2fb3a0',
  lila: '#b27af0',
};

function variable(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
}

function configurarPorDefecto() {
  const Chart = window.Chart;
  if (!Chart) return false;
  const oscuro = temaEfectivo() === 'oscuro';
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = variable('--texto-2') || (oscuro ? '#b0b4dc' : '#555a86');
  Chart.defaults.borderColor = variable('--borde') || (oscuro ? '#2b2f5c' : '#e4e6f1');
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.tooltip.backgroundColor = '#23264f';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
  return true;
}

/** Crea (o reemplaza) una gráfica en un canvas. Devuelve null si Chart.js no cargó. */
export function grafica(canvas, config) {
  if (!canvas || !configurarPorDefecto()) return null;
  window.Chart.getChart(canvas)?.destroy();
  return new window.Chart(canvas, config);
}

/** Color con transparencia a partir de un hexadecimal (#rrggbb). */
export function alfa(hex, a) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Degradado vertical para rellenos de gráficas de línea/barras. */
export function degradadoVertical(contexto, color, alto = 260) {
  const g = contexto.createLinearGradient(0, 0, 0, alto);
  g.addColorStop(0, alfa(color, 0.35));
  g.addColorStop(1, alfa(color, 0.02));
  return g;
}
