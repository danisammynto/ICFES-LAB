/**
 * Reglas de gamificación, dominio y puntajes.
 * Centralizadas aquí para poder ajustar el balance del juego sin tocar la lógica.
 */
export const REGLAS = Object.freeze({
  xp: {
    // XP por respuesta correcta según dificultad (1 baja, 2 media, 3 alta).
    // Además de la XP, cada nivel exige requisitos académicos (niveles.requisitos, ver niveles.service.js).
    correctaPorDificultad: { 1: 5, 2: 6, 3: 8 },
    incorrecta: 1, // Premia el esfuerzo.
    repetida: 1, // Pregunta ya acertada en las últimas 24 h.
    rachaDiaria: 10, // Primer estudio del día.
    subtemaCompletado: 100,
    leccionRepetida: 5,
    bonusPorAciertoSimulacro: 2,
  },
  monedas: {
    correcta: 1,
    subtemaCompletado: 20,
    porEstrella: 5,
  },
  // Horas durante las cuales repetir una pregunta acertada da XP reducido.
  horasPreguntaRepetida: 24,
  // Las recompensas completas de un simulacro se dan solo la primera vez; después, este factor.
  factorRepeticionSimulacro: 0.25,

  dominio: {
    alfaMinimo: 0.2, // Promedio móvil exponencial: peso mínimo de la última respuesta.
    umbralCompletado: 60, // Subtema completado: lecciones hechas + dominio ≥ 60.
    umbralDominado: 80, // Logro "Dominio total".
    minimoRespondidas: 2,
  },

  topes: {
    tiempoPreguntaMs: 5 * 60 * 1000, // Tiempo máximo contabilizado por pregunta.
    tiempoLeccionSeg: 60 * 60,
    segundosPorMensajeVanty: 30,
    protectoresRacha: 3,
  },

  estrellas: [50, 70, 90], // % de aciertos para 1, 2 y 3 estrellas.

  puntaje: {
    // Peso de cada pregunta según su dificultad al calcular el puntaje de un área (0–100).
    pesoDificultad: { 1: 1, 2: 1.25, 3: 1.5 },
    // Estimación: vida media (días) de una respuesta y peso de la creencia inicial (50 %).
    vidaMediaDias: 30,
    pesoPrevio: 3,
    ventanaDias: 120,
  },

  simulacro: {
    graciaSegundos: 10, // Tolerancia de red al guardar respuestas cerca del final.
  },
});

/** Hora local (0–23) que activa los logros especiales. */
export const HORARIOS_ESPECIALES = Object.freeze({
  madrugada: { desde: 4, hasta: 7 }, // 4:00–6:59
  nocturno: { desde: 22, hasta: 4 }, // 22:00–3:59
});
