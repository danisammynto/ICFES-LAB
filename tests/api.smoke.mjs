/**
 * Prueba de humo de la API (integración): recorre los flujos principales con un usuario nuevo.
 * Requiere el servidor en ejecución y la base de datos sembrada.
 *
 * Uso: BASE_URL=http://localhost:3000 node tests/api.smoke.mjs
 */
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let cookie = '';
let fallos = 0;
let pasos = 0;

async function api(metodo, ruta, cuerpo, { esperado = 200, crudo = false, sinCsrf = false } = {}) {
  const cabeceras = { Accept: 'application/json' };
  if (cookie) cabeceras.Cookie = cookie;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (!sinCsrf) cabeceras['X-Requested-With'] = 'XMLHttpRequest';
  const res = await fetch(BASE + ruta, { method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), redirect: 'manual' });
  const nueva = res.headers.get('set-cookie');
  if (nueva) cookie = nueva.split(';')[0];
  if (crudo) return res;
  const datos = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (res.status !== esperado) {
    throw new Error(`${metodo} ${ruta} → ${res.status} (esperado ${esperado}): ${JSON.stringify(datos).slice(0, 300)}`);
  }
  return datos;
}

async function paso(nombre, fn) {
  pasos += 1;
  try {
    const detalle = await fn();
    console.log(`  ✔ ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  } catch (error) {
    fallos += 1;
    console.log(`  ✖ ${nombre}\n      ${error.message}`);
  }
}

/** Lee un stream SSE y devuelve la lista de eventos { evento, datos }. */
async function sse(ruta, cuerpo) {
  const res = await api('POST', ruta, cuerpo, { crudo: true });
  assert.equal(res.status, 200, `SSE ${ruta} → ${res.status}`);
  const texto = await res.text();
  return texto.split('\n\n').filter(Boolean).map((bloque) => {
    const evento = bloque.match(/^event: (.+)$/m)?.[1];
    const datos = bloque.match(/^data: (.+)$/m)?.[1];
    return { evento, datos: datos ? JSON.parse(datos) : null };
  });
}

const email = `prueba.${Date.now()}@icfeslab.test`;
const password = 'Estudio2026';
const ctx = {};

console.log(`\nPrueba de humo contra ${BASE}\n`);

await paso('Salud del servidor', async () => (await api('GET', '/api/salud')).estado);
await paso('Protección CSRF (POST sin cabecera → 403)', async () => {
  await api('POST', '/api/auth/login', { email, password }, { esperado: 403, sinCsrf: true });
});
await paso('Validación de registro (contraseña débil → 422)', async () => {
  const r = await api('POST', '/api/auth/registro', { nombre: 'Ana', email, password: 'corta' }, { esperado: 422 });
  return r.error;
});
await paso('Ruta protegida sin sesión → 401', async () => { await api('GET', '/api/auth/me', undefined, { esperado: 401 }); });
await paso('Registro', async () => {
  const r = await api('POST', '/api/auth/registro', { nombre: 'Laura Gómez', email, password, grado: '11' }, { esperado: 201 });
  assert.ok(cookie.startsWith('icfeslab_token='));
  return r.usuario.email;
});
await paso('Registro duplicado → 409', async () => {
  await api('POST', '/api/auth/registro', { nombre: 'Laura Gómez', email, password }, { esperado: 409 });
});
await paso('Sesión actual (/me)', async () => {
  const r = await api('GET', '/api/auth/me');
  assert.equal(r.nivel.numero, 1);
  return `${r.nombre_mostrar}, nivel ${r.nivel.nombre}, ${r.monedas} monedas`;
});
await paso('Página privada sin sesión redirige a /login', async () => {
  const guardada = cookie;
  cookie = '';
  const res = await api('GET', '/inicio', undefined, { crudo: true });
  cookie = guardada;
  assert.equal(res.status, 302);
  return res.headers.get('location');
});
await paso('Dashboard', async () => {
  const d = await api('GET', '/api/analitica/dashboard');
  assert.ok(d.cuenta_regresiva.dias !== undefined);
  // Cuenta nueva: aún no eligió calendario, así que no hay días ni fecha (nada inventado).
  assert.equal(d.cuenta_regresiva.estado, 'sin_calendario');
  assert.equal(d.cuenta_regresiva.dias, null);
  ctx.leccionDia = d.recordatorio.leccion_del_dia;
  return `ICFES en ${d.cuenta_regresiva.dias} días · lección del día: ${d.recordatorio.leccion_del_dia.leccion?.titulo}`;
});
await paso('Calendario del ICFES (A o B) y fecha de la citación', async () => {
  const me = await api('GET', '/api/auth/me');
  assert.equal(me.calendario_icfes, null, 'al primer inicio de sesión se debe preguntar el calendario');
  await api('PUT', '/api/perfil/calendario', { calendario_icfes: 'C' }, { esperado: 422 });
  const r = await api('PUT', '/api/perfil/calendario', { calendario_icfes: 'B' });
  assert.equal(r.calendario_icfes, 'B');
  assert.equal(r.cuenta_regresiva.calendario, 'B');
  let detalle = r.cuenta_regresiva.estado;
  if (r.cuenta_regresiva.estado === 'sin_publicar') {
    // Sin fecha oficial publicada, la cuenta regresiva usa la fecha de la citación que ingrese el estudiante.
    const anio = new Date().getFullYear() + 1;
    const c = await api('PUT', '/api/perfil/calendario', { calendario_icfes: 'B', fecha_icfes: `${anio}-03-14` });
    assert.equal(c.cuenta_regresiva.estado, 'citacion');
    assert.ok(c.cuenta_regresiva.dias > 0);
    // Al cambiar de calendario, la fecha de la citación anterior se descarta.
    const a = await api('PUT', '/api/perfil/calendario', { calendario_icfes: 'A' });
    assert.notEqual(a.cuenta_regresiva.estado, 'citacion');
    detalle = `sin publicar → citación (${c.cuenta_regresiva.dias} días) → Calendario A: ${a.cuenta_regresiva.estado}`;
  }
  const me2 = await api('GET', '/api/auth/me');
  assert.ok(['A', 'B'].includes(me2.calendario_icfes));
  return detalle;
});
await paso('Materias', async () => {
  const r = await api('GET', '/api/materias');
  assert.equal(r.materias.length, 5);
  return r.materias.map((m) => `${m.nombre_corto} ${m.progreso}%`).join(', ');
});
await paso('Detalle de materia con bloqueos por nivel', async () => {
  const r = await api('GET', '/api/materias/matematicas');
  const bloqueados = r.temas.flatMap((t) => t.subtemas).filter((s) => s.bloqueado).map((s) => s.nombre);
  return `bloqueados: ${bloqueados.join(', ')}`;
});
await paso('Subtema bloqueado → 403', async () => {
  await api('GET', '/api/practica/siguiente?subtema=geometria-ii', undefined, { esperado: 403 });
});
await paso('Preguntas del tema tras la explicación', async () => {
  const r = await api('GET', '/api/practica/subtema/operaciones-basicas');
  assert.ok(r.preguntas.length >= 1);
  assert.equal(r.preguntas[0].opciones[0].es_correcta, undefined, 'no debe revelar la respuesta');
  assert.equal(r.preguntas[0].ultima, null);
  return `${r.subtema.nombre}: ${r.preguntas.length} preguntas`;
});
await paso('Lección y finalización (+XP)', async () => {
  const leccion = await api('GET', `/api/lecciones/${ctx.leccionDia.leccion.id}`);
  const r = await api('POST', `/api/lecciones/${leccion.id}/completar`, { tiempo_seg: 420, aciertos: 2, total: 2 });
  return `${leccion.bloques.length} bloques · eventos: ${r.eventos.map((e) => e.tipo).join(', ')}`;
});
await paso('Práctica adaptativa: siguiente pregunta (sin solución)', async () => {
  const r = await api('GET', '/api/practica/siguiente?subtema=operaciones-basicas');
  assert.ok(r.pregunta);
  assert.ok([3, 4].includes(r.pregunta.opciones.length));
  assert.equal(r.pregunta.opciones[0].es_correcta, undefined, 'no debe revelar la respuesta');
  ctx.pregunta = r.pregunta;
  return `${r.pregunta.codigo} (dificultad objetivo ${r.dificultad_objetivo})`;
});
await paso('Responder pregunta (retroalimentación y eventos)', async () => {
  const r = await api('POST', '/api/practica/responder', { pregunta_id: ctx.pregunta.id, opcion_id: ctx.pregunta.opciones[0].id, tiempo_ms: 45000 });
  assert.ok(r.letra_correcta && r.opciones.some((o) => o.es_correcta));
  return `${r.correcta ? 'correcta' : `incorrecta (era ${r.letra_correcta})`} · XP ${r.jugador.xp} · racha ${r.jugador.racha}`;
});
await paso('Catálogo de simulacros', async () => {
  const r = await api('GET', '/api/simulacros');
  ctx.mini1 = r.minis[0];
  assert.equal(r.completos.length, 5, 'deben ser 5 simulacros completos');
  // Estructura pedida: 120 preguntas en la primera sesión y 134 en la segunda.
  assert.equal(r.completos[0].preguntas_objetivo, 254);
  assert.equal(r.retos.some((x) => /maestro/i.test(x.titulo)), false, 'el reto del nivel Maestro se retiró');
  assert.equal(r.minis.length, 10);
  assert.ok(r.minis[1].bloqueado, 'el mini 2 debe estar bloqueado');
  return `Simulacro 1: ${r.completos[0].preguntas} preguntas / ${r.completos[0].duracion_min} min · Mini 1: ${ctx.mini1.preguntas} preguntas`;
});
await paso('Mini 2 bloqueado → 403', async () => {
  const r = await api('GET', '/api/simulacros');
  await api('POST', `/api/simulacros/${r.minis[1].id}/iniciar`, {}, { esperado: 403 });
});
await paso('Iniciar minisimulacro 1 y su sesión', async () => {
  const r = await api('POST', `/api/simulacros/${ctx.mini1.id}/iniciar`, {}, { esperado: 201 });
  ctx.intento = r.intento_id;
  await api('POST', `/api/intentos/${ctx.intento}/sesiones/1/iniciar`, {});
  const estado = await api('GET', `/api/intentos/${ctx.intento}`);
  ctx.preguntasIntento = estado.preguntas;
  assert.equal(estado.preguntas[0].pregunta.opciones[0].es_correcta, undefined);
  return `${estado.preguntas.length} preguntas · ${estado.sesiones[0].restante_seg} s restantes`;
});
await paso('Autoguardado de respuestas y marcas', async () => {
  for (const [i, item] of ctx.preguntasIntento.entries()) {
    if (i % 5 === 4) continue; // algunas quedan omitidas
    // Las preguntas de Inglés pueden traer 3 opciones (A–C) y el resto 4 (A–D).
    const opcion = item.pregunta.opciones[i % item.pregunta.opciones.length];
    await api('PUT', `/api/intentos/${ctx.intento}/respuestas/${item.pregunta.id}`, { opcion_id: opcion.id, tiempo_ms: 40000, marcada: i === 0 });
  }
  return `${ctx.preguntasIntento.length} preguntas procesadas`;
});
await paso('Finalizar sesión → calificación', async () => {
  const r = await api('POST', `/api/intentos/${ctx.intento}/sesiones/1/finalizar`, {});
  assert.ok(r.finalizado);
  return `eventos: ${[...new Set(r.eventos.map((e) => e.tipo))].join(', ')}`;
});
await paso('Resultado con rendimiento por área y revisión', async () => {
  const r = await api('GET', `/api/intentos/${ctx.intento}/resultado`);
  assert.equal(typeof r.revision[0].pregunta.explicacion, 'string'); // puede ser vacía: el banco 2026 solo trae la respuesta correcta
  return `${r.resultado.puntaje_global}/500 · ${r.resultado.aciertos}/${r.resultado.total} · ${r.resultado.estrellas}★ · ${r.resultado.recomendaciones.length} recomendaciones`;
});
await paso('Mini 2 desbloqueado tras completar el 1', async () => {
  const r = await api('GET', '/api/simulacros');
  assert.equal(r.minis[1].bloqueado, false);
});
await paso('Vanty: estado', async () => (await api('GET', '/api/vanty/estado')).modo);
await paso('Vanty: conversación y mensajes en streaming', async () => {
  const conv = await api('POST', '/api/vanty/conversaciones', {}, { esperado: 201 });
  ctx.conv = conv.id;
  const resumen = [];
  for (const texto of ['Hola Vanty', '¿Qué debo estudiar?', 'Explícame el teorema de Pitágoras', 'Genera una pregunta de geometría']) {
    const eventos = await sse(`/api/vanty/conversaciones/${ctx.conv}/mensajes`, { contenido: texto });
    const fin = eventos.find((e) => e.evento === 'fin');
    assert.ok(fin, `sin evento fin para "${texto}"`);
    if (fin.datos.mensaje.tipo === 'pregunta') ctx.tarjeta = eventos.find((e) => e.evento === 'tarjeta')?.datos.pregunta;
    resumen.push(`${fin.datos.intencion}`);
  }
  assert.ok(ctx.tarjeta?.opciones?.length === 4, 'la tarjeta de pregunta debe llegar');
  return resumen.join(' → ');
});
await paso('Vanty: responder la tarjeta y pedir explicación', async () => {
  const r = await api('POST', '/api/practica/responder', { pregunta_id: ctx.tarjeta.id, opcion_id: ctx.tarjeta.opciones[1].id, tiempo_ms: 30000, origen: 'vanty' });
  const eventos = await sse(`/api/vanty/conversaciones/${ctx.conv}/mensajes`, {
    contenido: '¿Por qué mi respuesta es incorrecta?',
    adjunto: { pregunta_id: ctx.tarjeta.id, opcion_id: ctx.tarjeta.opciones[1].id },
  });
  const fin = eventos.find((e) => e.evento === 'fin');
  return `${r.correcta ? 'acertó' : 'falló'} · respuesta de Vanty: ${fin.datos.mensaje.contenido.slice(0, 60)}…`;
});
await paso('Vanty: historial de la conversación', async () => {
  const r = await api('GET', `/api/vanty/conversaciones/${ctx.conv}`);
  return `${r.mensajes.length} mensajes · título "${r.conversacion.titulo}"`;
});
await paso('Vanty: recomendaciones automáticas', async () => {
  const r = await api('GET', '/api/vanty/recomendaciones');
  return r.recomendaciones.map((x) => x.titulo).join(' | ');
});
await paso('Tienda y compra', async () => {
  const t = await api('GET', '/api/tienda');
  const r = await api('POST', '/api/tienda/comprar', { tipo: 'item', codigo: 'accesorio-gafas' });
  await api('POST', '/api/tienda/comprar', { tipo: 'item', codigo: 'accesorio-gafas' }, { esperado: 409 });
  // Las insignias ya no se venden.
  assert.equal(t.insignias, undefined);
  await api('POST', '/api/tienda/comprar', { tipo: 'insignia', codigo: 'tienda-libro' }, { esperado: 422 });
  return `${t.monedas} → ${r.jugador.monedas} monedas`;
});
await paso('Equipar avatar (y rechazar artículo no adquirido)', async () => {
  await api('PUT', '/api/perfil/avatar', { color: 'color-cielo', expresion: 'expresion-feliz', accesorio: 'accesorio-gafas', fondo: 'fondo-indigo' });
  await api('PUT', '/api/perfil/avatar', { color: 'color-dorado', expresion: 'expresion-feliz', accesorio: 'accesorio-gafas', fondo: 'fondo-indigo' }, { esperado: 403 });
});
await paso('Logros, niveles, insignias y racha', async () => {
  const l = await api('GET', '/api/gamificacion/logros');
  const n = await api('GET', '/api/gamificacion/niveles');
  assert.equal(n.niveles.length, 4, 'sin el nivel Maestro');
  assert.equal(n.niveles.at(-1).nombre, 'Experto');
  assert.ok(n.actual.siguiente.requisitos.length >= 5, 'el siguiente nivel muestra sus requisitos con el avance');
  assert.ok(n.niveles.at(-1).requisitos.some((x) => x.clave === 'actividades' && x.meta === 90));
  const i = await api('GET', '/api/gamificacion/insignias');
  assert.equal(i.insignias.some((x) => x.origen === 'tienda' && !x.obtenida), false);
  const r = await api('GET', '/api/gamificacion/racha');
  return `${l.logros.filter((x) => x.desbloqueado).length} logros · nivel ${n.actual.nivel.nombre} · racha ${r.actual} · calendario ${r.calendario.length} días`;
});
await paso('Analítica completa y puntaje estimado', async () => {
  const a = await api('GET', '/api/analitica/completa');
  return `global estimado: ${a.puntaje_estimado.global.puntaje} · ${a.evolucion_semanal.length} semanas`;
});
await paso('Configuración de cuenta', async () => {
  const r = await api('PUT', '/api/perfil/configuracion', { fecha_icfes: '2027-03-14', meta_diaria_min: 45, tema_interfaz: 'oscuro' });
  assert.equal(r.fecha_icfes, '2027-03-14');
  await api('PUT', '/api/perfil/configuracion', { fecha_icfes: '2027-02-30' }, { esperado: 422 });
});
await paso('Recuperación de contraseña (enlace de desarrollo) y restablecer', async () => {
  const r = await api('POST', '/api/auth/recuperar', { email });
  if (!r.enlace_desarrollo) return 'SMTP configurado: se omite';
  const token = new URL(r.enlace_desarrollo).searchParams.get('token');
  await api('POST', '/api/auth/restablecer', { token, password: 'NuevaClave2026' });
  await api('POST', '/api/auth/restablecer', { token, password: 'OtraClave2026' }, { esperado: 400 });
  await api('POST', '/api/auth/login', { email, password: 'NuevaClave2026' });
  return 'token de un solo uso verificado';
});
await paso('Admin sin permisos → 403', async () => { await api('GET', '/api/admin/resumen', undefined, { esperado: 403 }); });
await paso('Cerrar sesión', async () => {
  await api('POST', '/api/auth/logout', {});
  cookie = '';
  await api('GET', '/api/auth/me', undefined, { esperado: 401 });
});

console.log(`\n${pasos - fallos}/${pasos} pasos correctos.`);
process.exitCode = fallos ? 1 : 0;
