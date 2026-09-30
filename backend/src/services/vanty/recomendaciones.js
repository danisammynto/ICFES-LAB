/**
 * Recomendaciones automáticas de Vanty a partir del perfil de rendimiento.
 * Cada regla produce { tipo, prioridad, titulo, texto, accion: { etiqueta, url } | null }.
 */

export function generarRecomendaciones(ctx) {
  const recs = [];
  const agregar = (prioridad, rec) => recs.push({ prioridad, ...rec });

  // 1. Estudiante nuevo: guía de inicio.
  if (ctx.respondidas_total < 5) {
    agregar(100, {
      tipo: 'inicio',
      titulo: 'Empieza con tu lección del día',
      texto: 'Aún no tengo suficientes datos para analizarte. Completa la lección del día y responde algunas preguntas para que pueda personalizar tu plan.',
      accion: { etiqueta: 'Ir a Materias', url: '/materias' },
    });
    agregar(90, {
      tipo: 'diagnostico',
      titulo: 'Haz el Minisimulacro 1',
      texto: 'Es un diagnóstico rápido de las 5 áreas: en 30 minutos sabré cuáles son tus fortalezas y en qué debes enfocarte.',
      accion: { etiqueta: 'Ir a Simulacros', url: '/simulacros' },
    });
  }

  // 2. Racha en riesgo.
  if (!ctx.racha.estudio_hoy && ctx.racha.actual >= 2) {
    agregar(95, {
      tipo: 'racha',
      titulo: `Protege tu racha de ${ctx.racha.actual} días`,
      texto: 'Todavía no has estudiado hoy. Con 10 minutos de práctica mantienes tu racha y sumas XP.',
      accion: { etiqueta: 'Practicar ahora', url: '/materias' },
    });
  }

  // 3. Temas débiles (máximo 2).
  ctx.debilidades.slice(0, 2).forEach((t, i) => {
    agregar(85 - i * 5, {
      tipo: 'debilidad',
      titulo: `Refuerza ${t.nombre}`,
      texto: `En ${t.nombre} (${t.materia}) llevas ${t.precision} % de aciertos en ${t.respondidas} preguntas. Repasa la lección y practica unas preguntas más.`,
      accion: { etiqueta: `Practicar ${t.nombre}`, url: `/practica?subtema=${t.slug}` },
    });
  });

  // 4. Áreas sin practicar.
  const sinPractica = ctx.areas.filter((a) => a.respondidas === 0);
  if (ctx.respondidas_total >= 5 && sinPractica.length) {
    const area = sinPractica[0];
    agregar(75, {
      tipo: 'cobertura',
      titulo: `No te olvides de ${area.nombre}`,
      texto: `Aún no has practicado ${area.nombre}. El ICFES evalúa las 5 áreas: dedícale una sesión corta hoy.`,
      accion: { etiqueta: `Ver ${area.nombre}`, url: `/materia?slug=${area.slug}` },
    });
  }

  // 5. Tiempo de respuesta.
  for (const a of ctx.areas) {
    if (a.respondidas >= 5 && a.tiempo_seg && a.tiempo_esperado_seg) {
      if (a.tiempo_seg > a.tiempo_esperado_seg * 1.4) {
        agregar(65, {
          tipo: 'tiempo',
          titulo: `Agiliza tu ritmo en ${a.nombre}`,
          texto: `Tardas ${a.tiempo_seg} s por pregunta y lo recomendable es cerca de ${a.tiempo_esperado_seg} s. Prueba el reto Relámpago para entrenar tu velocidad.`,
          accion: { etiqueta: 'Ver retos', url: '/logros#retos' },
        });
        break;
      }
      if (a.tiempo_seg < a.tiempo_esperado_seg * 0.35 && (a.precision ?? 100) < 55) {
        agregar(65, {
          tipo: 'tiempo',
          titulo: `Tómate tu tiempo en ${a.nombre}`,
          texto: `Respondes muy rápido (${a.tiempo_seg} s) pero con ${a.precision} % de aciertos. Lee el contexto completo antes de mirar las opciones.`,
          accion: null,
        });
        break;
      }
    }
  }

  // 6. Simulacros.
  if (ctx.respondidas_total >= 30 && (ctx.dias_desde_simulacro == null || ctx.dias_desde_simulacro > 10)) {
    agregar(70, {
      tipo: 'simulacro',
      titulo: 'Es momento de un simulacro',
      texto: ctx.dias_desde_simulacro == null
        ? 'Ya practicaste bastante: mide tu nivel real con un minisimulacro o un simulacro completo.'
        : `Hace ${ctx.dias_desde_simulacro} días no presentas un simulacro. Hacerlos con frecuencia entrena tu resistencia y tu manejo del tiempo.`,
      accion: { etiqueta: 'Ir a Simulacros', url: '/simulacros' },
    });
  }

  // 7. Cerca de subir de nivel.
  if (ctx.siguiente_nivel && ctx.siguiente_nivel.faltan <= 120) {
    agregar(60, {
      tipo: 'nivel',
      titulo: `¡Casi eres ${ctx.siguiente_nivel.nombre}!`,
      texto: `Te faltan ${ctx.siguiente_nivel.faltan} XP.${ctx.siguiente_nivel.desbloquea.length ? ` Desbloquearás: ${ctx.siguiente_nivel.desbloquea.join(', ')}.` : ''}`,
      accion: { etiqueta: 'Ganar XP', url: '/materias' },
    });
  }

  // 8. Examen cercano.
  if (ctx.icfes.dias != null && ctx.icfes.dias >= 0 && ctx.icfes.dias <= 30) {
    agregar(80, {
      tipo: 'examen',
      titulo: `Faltan ${ctx.icfes.dias} días para el ICFES`,
      texto: 'Prioriza simulacros completos, repasa tus errores frecuentes y cuida tu descanso.',
      accion: { etiqueta: 'Simulacros completos', url: '/simulacros' },
    });
  }

  // 9. Meta de puntaje.
  if (ctx.meta_puntaje && ctx.proyeccion?.puntaje && ctx.proyeccion.puntaje < ctx.meta_puntaje) {
    agregar(55, {
      tipo: 'meta',
      titulo: `Tu meta: ${ctx.meta_puntaje} puntos`,
      texto: `Tu proyección actual es ${ctx.proyeccion.puntaje}. Aumentar tu práctica diaria en tus temas débiles es la forma más rápida de cerrar la brecha.`,
      accion: { etiqueta: 'Ver mi avance', url: '/avance' },
    });
  }

  // 10. Reconocer fortalezas.
  if (ctx.fortalezas.length) {
    const f = ctx.fortalezas[0];
    agregar(40, {
      tipo: 'fortaleza',
      titulo: `Tu fuerte: ${f.nombre}`,
      texto: `Llevas ${f.precision} % de aciertos en ${f.nombre}. Mantén el nivel con retos de mayor dificultad.`,
      accion: { etiqueta: 'Ver retos', url: '/logros#retos' },
    });
  }

  if (!recs.length) {
    agregar(10, {
      tipo: 'constancia',
      titulo: 'Sigue con tu plan',
      texto: 'Vas por buen camino. Completa tu lección del día y un reto para seguir sumando.',
      accion: { etiqueta: 'Ir a Materias', url: '/materias' },
    });
  }

  return recs.sort((a, b) => b.prioridad - a.prioridad).map(({ prioridad: _p, ...r }) => r).slice(0, 6);
}
