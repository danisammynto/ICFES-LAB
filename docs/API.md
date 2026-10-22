# API REST de ICFES Lab

Base: `/api` · Formato: JSON (UTF-8) · Autenticación: cookie `icfeslab_token` (httpOnly) o cabecera `Authorization: Bearer <jwt>`.

## Convenciones

**Cabecera anti-CSRF.** Toda petición `POST`, `PUT`, `PATCH` o `DELETE` autenticada con cookie debe incluir:

```http
X-Requested-With: XMLHttpRequest
```

Sin ella el servidor responde `403` con `codigo: "CSRF"`. Los clientes que usan `Authorization: Bearer` no la necesitan.

**Errores.** Todas las respuestas de error tienen la misma forma:

```json
{ "error": "Mensaje en español para mostrar al usuario.", "codigo": "VALIDACION", "detalles": [{ "campo": "password", "mensaje": "La contraseña debe incluir al menos un número." }] }
```

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `SOLICITUD_INVALIDA`, `JSON_INVALIDO`, `TOKEN_INVALIDO`, `SIN_MONEDAS`, `PG_23514`… | Datos incoherentes (p. ej., opción que no pertenece a la pregunta). |
| 401 | `NO_AUTENTICADO`, `CREDENCIALES` | Sin sesión o sesión vencida; contraseña incorrecta. |
| 403 | `PROHIBIDO`, `BLOQUEADO`, `CSRF`, `CUENTA_INACTIVA`, `NO_ADQUIRIDO` | Sin permiso, contenido bloqueado por nivel, falta la cabecera anti-CSRF. |
| 404 | `NO_ENCONTRADO` | Recurso o ruta inexistente. |
| 409 | `CONFLICTO`, `TIEMPO_AGOTADO`, `PG_23505` | Duplicados, simulacro ya terminado, sesión vencida. |
| 413 | `DEMASIADO_GRANDE` | Cuerpo mayor a 200 kB (3 MB en la importación). |
| 422 | `VALIDACION` | Falló la validación de campos (`detalles` indica cuál). |
| 429 | `LIMITE`, `LIMITE_VANTY` | Límite de tasa o límite diario de Vanty. |
| 500 | `ERROR_INTERNO` | Error inesperado (en desarrollo incluye `traza`). |

**Límites de tasa** (cabeceras `RateLimit` y `RateLimit-Policy`, borrador 8 del IETF): API general 1500 peticiones cada 15 min por IP; login 10 intentos fallidos cada 15 min; registro 10 por hora; recuperación 6 por hora; Vanty (mensajes y preguntas) 12 por minuto por usuario.

**Eventos de gamificación.** Las acciones que otorgan recompensas devuelven `eventos` y `jugador`:

```json
{
  "eventos": [
    { "tipo": "xp", "cantidad": 6, "motivo": "respuesta" },
    { "tipo": "monedas", "cantidad": 1, "motivo": "respuesta" },
    { "tipo": "racha", "dias": 8, "record": true },
    { "tipo": "nivel", "nivel": 2, "nombre": "Explorador", "monedas": 30, "desbloqueos": ["…"], "insignia": { "nombre": "Explorador", "icono": "compass", "color": "#a8bb2c" } },
    { "tipo": "logro", "codigo": "primeros-pasos", "nombre": "Primeros pasos", "xp": 20, "monedas": 5, "insignia": null }
  ],
  "jugador": { "xp": 426, "nivel": 2, "monedas": 131, "nivel_nombre": "Explorador", "racha": 8, "protectores": 1 }
}
```

Tipos posibles: `xp`, `monedas`, `nivel`, `racha`, `racha_perdida`, `protector_usado`, `recompensa_racha`, `logro`, `subtema_completado`.

**Formato de una pregunta.** Mientras no se ha respondido, la pregunta viaja **sin solución**:

```json
{
  "id": 12, "codigo": "MAT-GEO-01", "enunciado": "…", "imagen": { "url": "/img/preguntas/MAT-GEO-01.svg", "alt": "…" },
  "dificultad": 2, "competencia": "Formulación y ejecución", "tiempo_estimado_seg": 120, "origen": "banco",
  "materia": { "id": 1, "slug": "matematicas", "nombre": "Matemáticas", "color": "#484ea2", "icono": "calculator" },
  "subtema": { "id": 3, "slug": "geometria", "nombre": "Geometría" },
  "contexto": { "id": 4, "titulo": "…", "contenido": "…", "imagen": null, "fuente": null },
  "opciones": [{ "id": 45, "letra": "A", "texto": "…" }, { "id": 46, "letra": "B", "texto": "…" }, { "id": 47, "letra": "C", "texto": "…" }, { "id": 48, "letra": "D", "texto": "…" }]
}
```

Después de responder (o al revisar un simulacro terminado) cada opción incluye `es_correcta` y `retroalimentacion`, y la pregunta incluye `explicacion`.

---

## Públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/salud` | Estado del servidor: `{ estado: "ok", hora }`. Lo usa el healthcheck de Docker. |
| `GET` | `/api/config/publica` | `{ app, calendarios_icfes: { A, B }, vanty: { modo: "claude" \| "local" } }`. Cada calendario: `{ convocatoria, meses, estado, fecha, dias, opciones }`; `fecha` y `dias` son `null` mientras el ICFES no publique la fecha oficial. |

## Autenticación · `/api/auth`

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `POST` | `/registro` | `nombre`, `email`, `password` (8–72, letra y número), `grado?` (`10`, `11`, `egresado`, `otro`), `fecha_icfes?` (`AAAA-MM-DD`) | `201 { usuario, mensaje }` + cookie de sesión. `409` si el correo existe. |
| `POST` | `/login` | `email`, `password` | `{ usuario: { id, nombre, email, rol } }` + cookie. `401 CREDENCIALES`. |
| `POST` | `/logout` | `{ todas?: true }` | `{ ok: true }`. Con `todas: true` invalida las sesiones de todos los dispositivos. |
| `GET` | `/me` 🔒 | — | Sesión para la cabecera: `{ id, nombre, nombre_mostrar, email, rol, avatar, tema_interfaz, xp, monedas, nivel: { numero, nombre, color, icono, progreso, siguiente }, racha: { actual, estudio_hoy, en_riesgo, protectores }, hoy: { minutos, meta_minutos } }` |
| `POST` | `/recuperar` | `email` | Siempre `{ mensaje }` (no revela si el correo existe). En desarrollo sin SMTP añade `enlace_desarrollo`. |
| `POST` | `/restablecer` | `token` (64 hex), `password` | `{ mensaje }`. Cierra todas las sesiones. `400 TOKEN_INVALIDO` si venció o ya se usó. |

🔒 = requiere sesión.

## Perfil y cuenta · `/api/perfil` 🔒

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/` | — | `{ usuario, perfil, configuracion, icfes, nivel, racha, estadisticas, insignias, inventario }` |
| `PUT` | `/` | `nombre?`, `nombre_mostrar?` (≤ 40), `bio?` (≤ 280), `colegio?`, `ciudad?`, `grado?` | Perfil actualizado (misma forma que `GET`). |
| `PUT` | `/avatar` | `color`, `expresion`, `accesorio`, `fondo` (códigos de artículos, p. ej. `color-lima`) | `{ avatar }`. `403 NO_ADQUIRIDO` si el artículo no está en el inventario. |
| `PUT` | `/insignia-destacada` | `insignia_id` (o `null`) | `{ insignia_destacada_id }` |
| `PUT` | `/calendario` | `calendario_icfes` (`A` o `B`), `fecha_icfes?` (`AAAA-MM-DD` o `null`): la de la citación cuando el ICFES no ha publicado la fecha, o una de las fechas oficiales si publicó varias. Al cambiar de calendario se descarta la fecha anterior. | `{ calendario_icfes, cuenta_regresiva, eventos, jugador }`. `cuenta_regresiva.estado`: `oficial`, `elegida`, `varias`, `citacion` o `sin_publicar` (sin fecha inventada: `dias` es `null`). |
| `PUT` | `/configuracion` | `fecha_icfes?` (fecha de la citación; preferir `/calendario`), `meta_diaria_min?` (5–240), `meta_puntaje?` (0–500), `tema_interfaz?` (`claro`, `oscuro`, `sistema`), `recordatorios?` | Configuración actualizada. |
| `PUT` | `/email` | `email`, `password` | `{ email }` |
| `PUT` | `/password` | `actual`, `nueva` | `{ mensaje }` + cookie nueva; las demás sesiones se cierran. |
| `DELETE` | `/` | `password` | `{ mensaje }`. Elimina la cuenta y todos sus datos. |

## Materias, lecciones y práctica 🔒

| Método | Ruta | Parámetros | Respuesta |
|---|---|---|---|
| `GET` | `/api/materias` | — | `{ materias: [{ slug, nombre, color, icono, progreso, precision, subtemas, subtemas_completados, subtemas_bloqueados, lecciones, lecciones_completadas, siguiente_leccion }] }` |
| `GET` | `/api/materias/:slug` | — | Materia con `nivel_usuario`, `progreso` y `temas[].subtemas[]` (con `bloqueado`, `nivel_requerido`, `preguntas`, `progreso` y `lecciones`). |
| `GET` | `/api/lecciones/del-dia` | — | `{ tipo: "leccion" \| "practica", motivo, materia, leccion?, subtema?, url }`: prioriza el área más débil. |
| `GET` | `/api/lecciones/:id` | — | `{ id, titulo, resumen, bloques, duracion_min, recompensa, completada, veces, subtema, materia, siguiente }`. `403 BLOQUEADO` si el nivel no alcanza. |
| `POST` | `/api/lecciones/:id/completar` | `tiempo_seg?`, `aciertos?`, `total?` | `{ primera_vez, eventos, jugador }` |
| `GET` | `/api/practica/siguiente` | `subtema` o `materia` (slug), `excluir?` (ids separados por coma) | `{ subtema, materia, dominio, dificultad_objetivo, pregunta }`. `pregunta: null` si no quedan preguntas nuevas en la sesión. |
| `GET` | `/api/practica/subtema/:slug` | — | `{ subtema, materia, dominio, preguntas: [{ …pregunta sin solución, ultima: { correcta, opcion_id, fecha } \| null }] }`: todas las preguntas del banco de ese tema, en orden, para mostrarlas después de la explicación de la lección. `403 BLOQUEADO` si el nivel no alcanza. |
| `POST` | `/api/practica/responder` | `pregunta_id`, `opcion_id` (`null` = omitida), `tiempo_ms?`, `origen?` (`practica`, `leccion`, `vanty`) | `{ correcta, opcion_elegida_id, opcion_correcta_id, letra_correcta, explicacion, opciones, eventos, jugador }`. `explicacion` puede ser una cadena vacía (las preguntas del banco 2026 traen solo la respuesta correcta). |

## Simulacros, minisimulacros y retos 🔒

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/api/simulacros` | — | `{ completos, minis, retos, estadisticas, nivel }`. Cada tarjeta trae `sesiones`, `preguntas`, `duracion_min`, `recompensa`, `intento_en_curso`, `intentos`, `mejor_puntaje`, `estrellas`; los minis y retos, `bloqueado`; los retos, `nivel_requerido`, `porcentaje_aprobacion` y `superado`. |
| `GET` | `/api/simulacros/historial` | — | `{ resultados: [...] }` (últimos 20). |
| `POST` | `/api/simulacros/:id/iniciar` | — | `201 { intento_id, reanudado }`. Si ya hay un intento en curso lo devuelve (`reanudado: true`). `403 BLOQUEADO` si no cumple el nivel o el minisimulacro anterior. |
| `GET` | `/api/intentos/:id` | — | `{ intento, simulacro, sesiones: [{ numero, titulo, duracion_seg, iniciada, finalizada, restante_seg, total, respondidas }], preguntas, sesion_cerrada_automaticamente }`. Las preguntas (sin solución) solo se envían cuando la sesión actual está en marcha. |
| `POST` | `/api/intentos/:id/sesiones/:numero/iniciar` | — | `{ ok: true }`: arranca el cronómetro del servidor. |
| `PUT` | `/api/intentos/:id/respuestas/:preguntaId` | `opcion_id?` (`null` borra la selección), `marcada?`, `tiempo_ms?` | `{ ok, guardado_en }`. `409 TIEMPO_AGOTADO` si la sesión venció (10 s de gracia). |
| `POST` | `/api/intentos/:id/sesiones/:numero/finalizar` | — | `{ finalizado: false, siguiente_sesion }` o, si era la última, `{ finalizado: true, resultado_id, eventos, jugador }`. |
| `POST` | `/api/intentos/:id/finalizar` | — | Entrega todo el simulacro: `{ finalizado: true, resultado_id, eventos, jugador }`. |
| `POST` | `/api/intentos/:id/abandonar` | — | `{ ok: true }` (no genera resultado). |
| `GET` | `/api/intentos/:id/resultado` | — | `{ resultado: { puntaje_global, porcentaje, aciertos, errores, omitidas, total, tiempo_usado_seg, estrellas, aprobado, xp_ganado, monedas_ganadas, recomendaciones }, materias: [{ nombre, aciertos, total, puntaje, tiempo_promedio_ms }], revision: [{ sesion, orden, opcion_id, correcta, omitida, tiempo_ms, marcada, pregunta }], anterior, siguiente }` |

## Gamificación y tienda 🔒

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/api/gamificacion/resumen` | — | `{ xp, monedas, nivel, siguiente: { …, faltan }, progreso, racha }` |
| `GET` | `/api/gamificacion/niveles` | — | `{ actual, niveles: [{ numero, nombre, xp_minimo, recompensa_monedas, desbloqueos, requisitos: [{ clave, etiqueta, meta, texto }], insignia, alcanzado, subtemas, retos }] }`. `actual.siguiente.requisitos` trae además `actual` y `cumplido` de cada requisito (XP, días de estudio, preguntas, aciertos, temario por área, actividades). |
| `GET` | `/api/gamificacion/logros` | — | `{ logros: [{ codigo, nombre, descripcion, icono, categoria, secreto, desbloqueado, desbloqueado_en, progreso: { valor, meta, porcentaje }, recompensa, insignia }] }`. Los secretos se ocultan hasta desbloquearse. |
| `GET` | `/api/gamificacion/insignias` | — | `{ insignias: [{ …, obtenida, obtenida_en }] }`. Las insignias retiradas (tienda, nivel Maestro) solo aparecen si el estudiante ya las tiene. |
| `GET` | `/api/gamificacion/racha` | — | `{ actual, maxima, protectores, estudio_hoy, en_riesgo, inicio, proxima_recompensa, calendario (26 semanas), recompensas }` |
| `GET` | `/api/tienda` | — | `{ monedas, nivel, avatar, protectores: { cantidad, maximo }, items: { color, expresion, accesorio, fondo, protector } }` |
| `POST` | `/api/tienda/comprar` | `tipo` (`item`), `codigo` | `{ ok, comprado, eventos, jugador }`. `400 SIN_MONEDAS`, `403 BLOQUEADO`, `409` si ya lo tiene o si ya tiene 3 protectores. `422` con `tipo: "insignia"`: las insignias ya no se venden. |

## Analítica 🔒

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/analitica/dashboard` | Datos del Inicio: `usuario`, `nivel`, `racha` (con `calendario` de 16 semanas), `recordatorio` (`mensaje`, `leccion_del_dia`), `cuenta_regresiva`, `progreso` (general y por materia), `horas_semana`, `desempeno` por área, `estadisticas` (precisión 30 días, tiempo promedio, horas), `evolucion_semanal` (8 semanas), `puntaje_estimado` y 3 `recomendaciones`. |
| `GET` | `/api/analitica/completa` | Sección Avance: `resumen`, `fortalezas`, `debilidades`, `materias` (precisión, tiempo, tendencia, puntaje), `temas` (árbol por tema y subtema con dominio), `evolucion_semanal` (12 semanas), `evolucion_mensual` (6 meses), `puntaje_estimado`, `errores_frecuentes` (preguntas y competencias), `simulacros`, `recomendaciones`, `fecha_examen`. |
| `GET` | `/api/analitica/puntaje` | `{ global: { puntaje, parcial, confianza, areas_con_datos }, areas: [{ slug, nombre, puntaje, respondidas, confianza }], proyeccion: { puntaje, tendencia_semanal, semanas_restantes, mensaje }, meta }` |

## Vanty · `/api/vanty` 🔒

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/estado` | — | `{ modo: "claude" \| "local", modelo, limite_diario, usados_hoy }` |
| `GET` | `/recomendaciones` | — | `{ recomendaciones: [{ tipo, titulo, texto, accion }], resumen: { debilidades, fortalezas, errores_frecuentes, areas } }` |
| `POST` | `/pregunta` | `materia?`, `subtema?` (slugs), `dificultad?` (1–3) | `{ pregunta, generada_por: "claude" \| "banco", motivo }` |
| `GET` | `/conversaciones` | — | `{ conversaciones: [{ id, titulo, ultimo_mensaje, actualizado_en }] }` (50 más recientes) |
| `POST` | `/conversaciones` | `titulo?` | `201 { id, titulo, creado_en, actualizado_en }` |
| `GET` | `/conversaciones/:id` | — | `{ conversacion, mensajes }` (últimos 200). Las tarjetas de pregunta incluyen la pregunta y, si ya se respondió, la respuesta y la solución. |
| `DELETE` | `/conversaciones/:id` | — | `{ ok: true }` |
| `POST` | `/conversaciones/:id/mensajes` | `contenido` (1–2000), `adjunto?: { pregunta_id, opcion_id? }` | **Stream SSE** (ver abajo). `429 LIMITE_VANTY` al superar el límite diario. |

### Stream SSE de mensajes

La respuesta es `text/event-stream`. Cada evento tiene la forma `event: <nombre>` + `data: <json>`:

| Evento | Datos | Significado |
|---|---|---|
| `usuario` | `{ mensaje }` | El mensaje del estudiante quedó guardado. |
| `delta` | `{ texto }` | Fragmento de la respuesta mientras se genera. |
| `reinicio` | `{}` | Descartar el texto parcial (la IA falló y se responderá en modo local). |
| `tarjeta` | `{ pregunta, generada_por }` | Pregunta interactiva para responder dentro del chat. |
| `fin` | `{ mensaje, eventos, intencion }` | Mensaje final guardado, eventos de gamificación e intención detectada. |
| `error` | `{ mensaje }` | Error después de abrir el stream. |

Ejemplo con `curl` (sesión por token Bearer):

```bash
curl -N -X POST http://localhost:3000/api/vanty/conversaciones/<id>/mensajes \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"contenido":"¿Qué debo estudiar hoy?"}'
```

En el navegador, `frontend/js/core/api.js` (`flujo`) lee el stream con `fetch` + `ReadableStream`.

## Administración · `/api/admin` 🔒 (rol `admin`)

| Método | Ruta | Cuerpo / parámetros | Respuesta |
|---|---|---|---|
| `GET` | `/resumen` | — | `{ general: { usuarios, activos_7, preguntas, lecciones, respuestas_24h, simulacros, mensajes_vanty }, por_materia (preguntas por dificultad), actividad (últimos 14 días) }` |
| `GET` | `/catalogo` | — | `{ subtemas: [{ slug, nombre, materia_slug, materia }] }` |
| `GET` | `/configuracion` | — | `{ calendarios_icfes: { A, B, revisado }, vanty: { limite_diario } }` |
| `PUT` | `/configuracion` | `calendarios_icfes?: { A?: { convocatoria, meses, fuente, fechas: [{ fecha, descripcion }] }, B?: {…} }` (hasta 3 fechas oficiales por calendario; con fechas, `fuente` es obligatoria), `vanty?: { limite_diario }` (1–1000) | Configuración actualizada. |
| `GET` | `/preguntas` | `materia?`, `subtema?`, `q?`, `estado?` (`activas`, `inactivas`, `todas`), `pagina?` | `{ total, pagina, por_pagina, preguntas }` (20 por página) |
| `GET` | `/preguntas/:id` | — | Pregunta completa con solución, contexto, `activa` y `etiquetas`. |
| `POST` | `/preguntas` | Pregunta en el formato de [FORMATO.md](../database/contenido/FORMATO.md) | `201 { id }`. `400` con la lista de problemas si no es válida. |
| `PUT` | `/preguntas/:id` | Pregunta completa (el `codigo` no se puede cambiar) | `{ id }` |
| `PATCH` | `/preguntas/:id/estado` | `activa` | `{ id, activa }`. No aplica a las preguntas privadas de Vanty. |
| `POST` | `/preguntas/importar` | `{ contextos?: {…}, preguntas: [...] }` (1–500, hasta 3 MB) | `{ total, nuevas, actualizadas }`. Transaccional: si una pregunta es inválida no se importa nada. |
| `GET` | `/usuarios` | `q?`, `pagina?` | `{ total, pagina, por_pagina, usuarios }` (25 por página) |
| `PATCH` | `/usuarios/:id` | `activo?`, `rol?` (`estudiante`, `admin`) | `{ id, nombre, email, rol, activo }`. Desactivar una cuenta o cambiarle el rol cierra sus sesiones. Un administrador no puede desactivarse ni quitarse el rol a sí mismo. |

---

## Ejemplo completo con `curl`

```bash
# 1. Iniciar sesión y guardar la cookie
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" \
  -d '{"email":"demo@icfeslab.co","password":"IcfesLab2026"}'

# 2. Pedir una pregunta de Geometría I
curl -b cookies.txt "http://localhost:3000/api/practica/siguiente?subtema=geometria-i"

# 3. Responderla (usa el id de la pregunta y el de una de sus opciones)
curl -b cookies.txt -X POST http://localhost:3000/api/practica/responder \
  -H "Content-Type: application/json" -H "X-Requested-With: XMLHttpRequest" \
  -d '{"pregunta_id":12,"opcion_id":46,"tiempo_ms":45000}'
```
