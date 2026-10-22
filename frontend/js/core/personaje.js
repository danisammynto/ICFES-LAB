/**
 * Mascota de ICFES Lab: el personaje que evoluciona con el nivel del estudiante.
 *
 * Cada etapa es un video corto (H.264) que se reproduce en bucle y sin sonido. Los videos
 * vienen con fondo blanco y en 16:9, así que aquí se procesan para que el personaje se vea
 * recortado y sin fondo sobre cualquier tarjeta:
 *   · se dibuja en un lienzo solo la franja central (donde está el personaje), sin deformarlo;
 *   · se vuelven transparentes los píxeles blancos del fondo (el blanco puro del render);
 *   · el lienzo trabaja a baja resolución, se detiene fuera de pantalla y respeta
 *     "prefers-reduced-motion" (se queda en el primer fotograma).
 *
 * Carga: solo se descarga el video de la etapa visible y, con `perezoso`, cuando entra en pantalla.
 */
import { h } from './dom.js';

/** Etapas del personaje. `nivel` es el nivel del estudiante a partir del cual se muestra. */
export const ETAPAS = Object.freeze([
  { fase: 1, nivel: 1, nombre: 'Brote', descripcion: 'Acaba de despertar. Tus primeras lecciones lo hacen crecer.' },
  { fase: 2, nivel: 2, nombre: 'Compañero', descripcion: 'Ya te acompaña a estudiar con su peluche favorito.' },
  { fase: 3, nivel: 3, nombre: 'Estudiante', descripcion: 'Se sienta en su escritorio y repasa contigo cada día.' },
  { fase: 4, nivel: 4, nombre: 'Graduado', descripcion: 'Toga y birrete: está listo para el Saber 11.' },
]);

export const TOTAL_ETAPAS = ETAPAS.length;

const RUTA = (fase) => `/video/personaje/fase-${fase}.mp4`;
// Recorte del fondo blanco. «Distancia al blanco» = 255 − el canal más bajo del píxel.
// Por debajo de BLANCO_MIN es fondo; desde BLANCO_MAX es 100 % personaje; en medio, borde suave.
const BLANCO_MIN = 8;
const BLANCO_MAX = 48;
// Recorte del borde (0–1): quita la última franja semitransparente, donde queda el filo blanco.
const AJUSTE_BORDE = 0.12;
// Una zona blanca encerrada por el personaje es fondo si tiene al menos esta fracción del fotograma en
// blanco casi puro (distancia < BLANCO_PURO). Las más pequeñas (brillos de los ojos, dientes) se conservan.
const BLANCO_PURO = 12;
const HUECO_MINIMO = 0.0015;
// Alfa según la distancia al blanco (curva suave, precalculada).
const ALFA_POR_DISTANCIA = (() => {
  const tabla = new Float32Array(256);
  for (let d = 0; d < 256; d += 1) {
    const x = Math.min(1, Math.max(0, (d - BLANCO_MIN) / (BLANCO_MAX - BLANCO_MIN)));
    tabla[d] = x * x * (3 - 2 * x);
  }
  return tabla;
})();
// Resolución máxima del lienzo: el personaje nunca se muestra grande, así que con esto sobra.
const LADO_MAXIMO = 480;

const menosMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Etapa que corresponde a un nivel (el nivel máximo conserva la última etapa). */
export function etapaDeNivel(nivel = 1) {
  const numero = Number(nivel) || 1;
  return [...ETAPAS].reverse().find((e) => numero >= e.nivel) ?? ETAPAS[0];
}

/**
 * Quita el fondo blanco de un fotograma con bordes pulidos:
 *  1. Es fondo el blanco conectado con el borde del fotograma y los huecos blancos encerrados que tienen
 *     un tamaño apreciable de blanco casi puro (por ejemplo, entre el brazo y la cabeza). Los blancos
 *     pequeños del personaje (brillos de los ojos, dientes) no se vuelven transparentes.
 *  2. El paso de fondo a personaje es gradual (alfa según la distancia al blanco).
 *  3. El alfa se suaviza con un promedio 3 × 3 (sin escalones ni ruido del video) y se recorta un
 *     poco el borde.
 *  4. En los píxeles del borde se quita el blanco que tenían mezclado (sin filo blanco).
 * `memoria` guarda los arreglos entre fotogramas para no crearlos cada vez.
 */
function quitarFondo(imagen, memoria) {
  const { data: d, width: w, height: h } = imagen;
  const n = w * h;
  if (memoria.n !== n) {
    memoria.n = n;
    memoria.distancia = new Uint8Array(n);
    memoria.fondo = new Uint8Array(n);
    memoria.pila = new Int32Array(n);
    memoria.region = new Int32Array(n);
    memoria.alfa = new Float32Array(n);
    memoria.suave = new Float32Array(n);
  }
  const { distancia, fondo, pila, region, alfa, suave } = memoria;

  for (let p = 0, i = 0; p < n; p += 1, i += 4) {
    distancia[p] = 255 - Math.min(d[i], d[i + 1], d[i + 2]);
  }

  // 1. Zonas blancas (relleno por inundación). fondo: 0 sin revisar, 1 fondo, 2 parte del personaje.
  fondo.fill(0);
  const minimoPuro = Math.max(20, Math.round(n * HUECO_MINIMO));
  for (let inicio = 0; inicio < n; inicio += 1) {
    if (fondo[inicio] || distancia[inicio] >= BLANCO_MAX) continue;
    let tope = 0;
    let tam = 0;
    let puros = 0;
    let tocaBorde = false;
    fondo[inicio] = 3; // en revisión
    pila[tope] = inicio;
    tope += 1;
    while (tope > 0) {
      tope -= 1;
      const p = pila[tope];
      region[tam] = p;
      tam += 1;
      if (distancia[p] < BLANCO_PURO) puros += 1;
      const x = p % w;
      if (x === 0 || x === w - 1 || p < w || p >= n - w) tocaBorde = true;
      if (x > 0 && !fondo[p - 1] && distancia[p - 1] < BLANCO_MAX) { fondo[p - 1] = 3; pila[tope] = p - 1; tope += 1; }
      if (x < w - 1 && !fondo[p + 1] && distancia[p + 1] < BLANCO_MAX) { fondo[p + 1] = 3; pila[tope] = p + 1; tope += 1; }
      if (p >= w && !fondo[p - w] && distancia[p - w] < BLANCO_MAX) { fondo[p - w] = 3; pila[tope] = p - w; tope += 1; }
      if (p < n - w && !fondo[p + w] && distancia[p + w] < BLANCO_MAX) { fondo[p + w] = 3; pila[tope] = p + w; tope += 1; }
    }
    const marca = tocaBorde || puros >= minimoPuro ? 1 : 2;
    for (let k = 0; k < tam; k += 1) fondo[region[k]] = marca;
  }

  // 2. Alfa gradual solo en el fondo y su borde; el resto es personaje opaco.
  for (let p = 0; p < n; p += 1) alfa[p] = fondo[p] === 1 ? ALFA_POR_DISTANCIA[distancia[p]] : 1;

  // 3. Promedio 3 × 3 del alfa y recorte del borde.
  for (let y = 0; y < h; y += 1) {
    const y0 = y > 0 ? -w : 0;
    const y1 = y < h - 1 ? w : 0;
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      const x0 = x > 0 ? -1 : 0;
      const x1 = x < w - 1 ? 1 : 0;
      const s = alfa[p + y0 + x0] + alfa[p + y0] + alfa[p + y0 + x1]
        + alfa[p + x0] + alfa[p] + alfa[p + x1]
        + alfa[p + y1 + x0] + alfa[p + y1] + alfa[p + y1 + x1];
      const a = (s / 9 - AJUSTE_BORDE) / (1 - AJUSTE_BORDE);
      suave[p] = a <= 0 ? 0 : a >= 1 ? 1 : a;
    }
  }

  // 4. Escribir alfa y quitar el blanco mezclado en el borde: color = (píxel − (1 − α)·blanco) / α.
  for (let p = 0, i = 0; p < n; p += 1, i += 4) {
    const a = suave[p];
    if (a <= 0) {
      d[i + 3] = 0;
      continue;
    }
    if (alfa[p] < 1) {
      const original = Math.max(alfa[p], 0.35);
      const blanco = 255 * (1 - original);
      d[i] = Math.max(0, Math.min(255, (d[i] - blanco) / original));
      d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] - blanco) / original));
      d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] - blanco) / original));
    }
    d[i + 3] = Math.round(a * 255);
  }
}

/**
 * Dibuja el video en el lienzo quitando el fondo blanco.
 * Devuelve una función para detener el procesamiento.
 */
function recortarFondo(video, lienzo, { proporcion, foco }) {
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) return () => {};
  let activo = true;
  let visible = true;
  let pedido = null;
  const memoria = {};

  const dibujar = () => {
    if (!video.videoWidth || !video.videoHeight) return;
    // Lienzo a la medida del hueco en pantalla (con tope) para no procesar píxeles de más.
    const ancho = Math.min(LADO_MAXIMO, Math.max(120, Math.round((lienzo.clientWidth || 180) * Math.min(window.devicePixelRatio || 1, 2))));
    const alto = Math.round(ancho / proporcion);
    if (lienzo.width !== ancho || lienzo.height !== alto) {
      lienzo.width = ancho;
      lienzo.height = alto;
    }

    // Recorte central del fotograma 16:9, centrado en el personaje y sin deformarlo.
    const origenAlto = video.videoHeight;
    const origenAncho = Math.min(video.videoWidth, origenAlto * proporcion);
    const origenX = (video.videoWidth - origenAncho) * foco;
    ctx.clearRect(0, 0, ancho, alto);
    ctx.drawImage(video, origenX, 0, origenAncho, origenAlto, 0, 0, ancho, alto);

    const imagen = ctx.getImageData(0, 0, ancho, alto);
    quitarFondo(imagen, memoria);
    ctx.putImageData(imagen, 0, 0);
  };

  const siguiente = () => {
    if (!activo) return;
    if ('requestVideoFrameCallback' in video) pedido = video.requestVideoFrameCallback(bucle);
    else pedido = requestAnimationFrame(bucle);
  };
  const bucle = () => {
    if (!activo) return;
    if (visible && !document.hidden) dibujar();
    siguiente();
  };

  video.addEventListener('loadeddata', dibujar);
  video.addEventListener('seeked', dibujar);
  siguiente();

  // Fuera de pantalla no se procesa nada (ni se reproduce el video).
  let observador = null;
  if ('IntersectionObserver' in window) {
    observador = new IntersectionObserver(([entrada]) => {
      visible = entrada.isIntersecting;
      if (!visible) video.pause();
      else if (video.autoplay) video.play().catch(() => {});
    }, { rootMargin: '100px' });
    observador.observe(lienzo);
  }

  return () => {
    activo = false;
    observador?.disconnect();
    if (pedido != null && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(pedido);
    else if (pedido != null) cancelAnimationFrame(pedido);
  };
}

/** Carga el video solo cuando el marco entra en pantalla. */
function cargarAlVerse(video, fuente) {
  if (!('IntersectionObserver' in window)) {
    video.src = fuente;
    return;
  }
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      observador.disconnect();
      video.src = fuente;
      video.load();
    }
  }, { rootMargin: '250px' });
  observador.observe(video);
}

/**
 * Crea el personaje: un lienzo con el video ya recortado y sin fondo.
 * @param {object} opciones
 * @param {number} [opciones.nivel]       Nivel del estudiante (define la etapa).
 * @param {number} [opciones.fase]        Fuerza una etapa concreta (1–4) en vez del nivel.
 * @param {string} [opciones.clase]       Clases extra para el contenedor.
 * @param {string} [opciones.etiqueta]    Texto alternativo; sin él, es decorativo.
 * @param {boolean} [opciones.perezoso]   Descarga el video al entrar en pantalla.
 * @param {number} [opciones.proporcion]  Ancho/alto del recorte (0.75 = vertical 3:4).
 * @param {number} [opciones.foco]        0–1: parte del fotograma que se conserva (0.5 = centro).
 * @returns {HTMLElement}
 */
export function crearPersonaje({
  nivel = 1, fase = null, clase = '', etiqueta = null, perezoso = false, proporcion = 0.75, foco = 0.5,
} = {}) {
  const etapa = (fase ? ETAPAS.find((e) => e.fase === fase) : etapaDeNivel(nivel)) ?? ETAPAS[0];
  const quieto = menosMovimiento();

  const video = h('video', {
    class: 'personaje-fuente',
    loop: true,
    playsinline: true,
    preload: perezoso ? 'none' : 'metadata',
    disablepictureinpicture: true,
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  // `muted` debe ir como propiedad: sin ella los navegadores bloquean la reproducción automática.
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = !quieto;

  const lienzo = h('canvas', { class: 'personaje-lienzo' });
  const marco = h('div', {
    class: ['personaje', clase].filter(Boolean).join(' '),
    style: { '--personaje-proporcion': String(proporcion) },
    dataset: { fase: String(etapa.fase), etapa: etapa.nombre },
    ...(etiqueta ? { role: 'img', 'aria-label': etiqueta } : { 'aria-hidden': 'true' }),
  }, video, lienzo);

  const detener = recortarFondo(video, lienzo, { proporcion, foco });
  marco.detenerPersonaje = detener;

  const fuente = RUTA(etapa.fase);
  if (perezoso) cargarAlVerse(video, fuente);
  else video.src = fuente;

  // Con "menos movimiento" se muestra el primer fotograma y ahí se queda.
  if (quieto) video.addEventListener('loadeddata', () => video.pause(), { once: true });

  return marco;
}

/** Cambia la etapa que muestra un personaje ya creado (por ejemplo, al subir de nivel). */
export function actualizarPersonaje(marco, { nivel = 1, fase = null } = {}) {
  const etapa = (fase ? ETAPAS.find((e) => e.fase === fase) : etapaDeNivel(nivel)) ?? ETAPAS[0];
  if (!marco || marco.dataset.fase === String(etapa.fase)) return;
  const video = marco.querySelector('video');
  if (!video) return;
  marco.dataset.fase = String(etapa.fase);
  marco.dataset.etapa = etapa.nombre;
  video.src = RUTA(etapa.fase);
  video.load();
}

/**
 * Monta la mascota en los contenedores `[data-personaje]` de una página estática
 * (inicio de sesión y registro). El atributo indica la etapa: data-personaje="3".
 */
export function montarPersonajes(raiz = document) {
  for (const hueco of raiz.querySelectorAll('[data-personaje]')) {
    const fase = Number(hueco.dataset.personaje) || 1;
    const marco = crearPersonaje({
      fase,
      clase: hueco.dataset.clase ?? '',
      etiqueta: hueco.getAttribute('aria-label') || null,
    });
    hueco.replaceChildren(marco);
  }
}
