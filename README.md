# ICFES Lab

Plataforma web para prepararse para la **Prueba Saber 11 (ICFES)** que combina gamificación, inteligencia artificial, aprendizaje por niveles, analítica del rendimiento y simulacros cronometrados.

![Dashboard de ICFES Lab](docs/img/inicio.png)

| Simulacros | Camino de minisimulacros | Vanty, la IA tutora |
|---|---|---|
| ![Simulacros](docs/img/simulacros.png) | ![Minisimulacros](docs/img/minisimulacros.png) | ![Vanty](docs/img/vanty.png) |

| Análisis inteligente | Tienda y avatar | Móvil |
|---|---|---|
| ![Avance](docs/img/avance.png) | ![Tienda](docs/img/tienda.png) | ![Móvil](docs/img/movil-inicio.png) |

---

## Qué incluye

| Área | Funcionalidades |
|---|---|
| **Usuarios** | Registro, inicio y cierre de sesión (en este dispositivo o en todos), recuperación de contraseña por correo, perfil, avatar personalizable, configuración de cuenta, eliminación de cuenta. |
| **Dashboard** | Racha y calendario de actividad, recordatorio diario con la lección del día, cuenta regresiva al ICFES, porcentaje completado, horas por semana, desempeño por área (radar), avance por materia, precisión, tiempo promedio, evolución semanal, puntaje estimado y recomendaciones de Vanty. |
| **Materias** | Las 5 áreas del Saber 11 → temas → subtemas → lecciones con teoría, ejemplos resueltos, tips y ejercicios. Subtemas que se desbloquean por nivel. |
| **Preguntas tipo ICFES** | Enunciado, contexto (compartido entre preguntas), imagen opcional, 4 opciones, respuesta correcta, retroalimentación por opción y explicación detallada. Práctica adaptativa por dificultad. |
| **Gamificación** | XP, 5 niveles (Principiante → Maestro ICFES), monedas, 21 logros, 19 insignias, rachas con protectores y recompensas, retos por nivel, tienda de avatar. |
| **Simulacros** | 10 simulacros completos (2 sesiones con la estructura del Saber 11), camino de 10 minisimulacros (20–30 preguntas, 30 min) y 6 retos. Cronómetro controlado por el servidor, autoguardado, marcas de revisión, puntaje global (0–500) y por área, recomendaciones y revisión pregunta a pregunta. |
| **Vanty (IA)** | Chat con respuestas en streaming. Resuelve dudas, explica errores, recomienda temas, adapta la dificultad, genera preguntas personalizadas y motiva. Usa **Claude** si configuras una API key y un **motor local** si no. |
| **Analítica** | Fortalezas, debilidades, rendimiento por materia y por tema, tiempos de respuesta, evolución semanal y mensual, errores frecuentes, puntaje estimado ICFES (global y por área) y proyección de mejora. |
| **Administración** | Métricas, banco de preguntas (crear, editar, activar, importar JSON), usuarios y roles, fecha global del ICFES y límites de Vanty. |

**Stack:** HTML5 · CSS3 · JavaScript (módulos ES, sin frameworks) · Chart.js · Node.js 22+ · Express 5 · PostgreSQL 13+ · SDK de Anthropic.

---

## Inicio rápido

Requisitos: **Node.js 22 o superior** (recomendado 24 LTS) y **PostgreSQL 13 o superior**.

```bash
# 1. Dependencias
npm install

# 2. Configuración: copia el ejemplo y edita DATABASE_URL (y JWT_SECRET)
cp .env.example .env

# 3. Base de datos: crea la BD, el esquema, el catálogo y el contenido académico
npm run db:setup

# 4. (Opcional) Cuentas de demostración con 6 semanas de historial
npm run db:demo

# 5. Arranca el servidor
npm start
```

Abre **http://localhost:3000**. Con `npm run db:demo` puedes entrar con:

| Rol | Correo | Contraseña |
|---|---|---|
| Estudiante (nivel 4, historial completo) | `demo@icfeslab.co` | `IcfesLab2026` |
| Administrador | `admin@icfeslab.co` | `AdminLab2026` |

> Las cuentas de demostración tienen contraseñas públicas: úsalas solo para probar y no ejecutes `npm run db:demo` en producción.

> En Windows usa `copy .env.example .env`. Las instrucciones detalladas (Windows, macOS, Linux, Docker, red local y producción) están en [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md).

### Iniciar con doble clic (Windows)

Una vez instalado, `iniciar.cmd` arranca el servidor (y la base de datos de prueba, si el `.env` apunta al puerto 5433) y abre http://localhost:3000 en el navegador; `detener.cmd` apaga ambos. Crea un acceso directo a `iniciar.cmd` en el escritorio para abrir la plataforma sin pasar por la terminal.

### Activar la IA de Vanty

Vanty funciona sin configuración en **modo local** (reglas, base de conocimiento y tus datos). Para respuestas generadas por IA agrega tu clave de Anthropic al `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Detalles, costos y privacidad en [docs/VANTY.md](docs/VANTY.md).

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Inicia el servidor. |
| `npm run dev` | Inicia el servidor y lo reinicia al cambiar el código. |
| `npm run db:setup` | Crea la base de datos (si puede), aplica `schema.sql`, `seed.sql` y carga el contenido JSON. No borra datos. |
| `npm run db:reset` | **Borra todo** y reinstala la base de datos desde cero. |
| `npm run db:seed` | Recarga solo el contenido académico (preguntas y lecciones). |
| `npm run db:demo` | Crea o recrea las cuentas de demostración. |
| `npm run db:sql` | Genera `database/seed_contenido.sql` para instalar solo con `psql`. |
| `npm run admin:crear -- --email x@y.co --password "Clave2026"` | Crea un administrador o promueve una cuenta existente. |
| `npm run iconos` | Regenera el sprite de iconos (`frontend/img/iconos.svg`). |
| `npm test` | Pruebas unitarias de la lógica (puntajes, dominio, intención de Vanty…). |
| `npm run test:api` | Prueba de humo de la API completa (requiere el servidor en marcha; `BASE_URL` opcional). |

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a PostgreSQL, p. ej. `postgresql://postgres:clave@localhost:5432/icfeslab`. |
| `JWT_SECRET` | En producción | Secreto de firma de sesiones (mínimo 32 caracteres). En desarrollo se genera uno temporal. |
| `PORT` / `APP_URL` | No | Puerto (3000) y URL pública. `APP_URL` se usa en los correos; si empieza por `https://` activa la cookie `Secure`, HSTS y `upgrade-insecure-requests`. |
| `APP_TZ` | No | Zona horaria de rachas y estadísticas (`America/Bogota`). |
| `NODE_ENV` | No | `production` exige `JWT_SECRET`, oculta los detalles de los errores y activa la caché de archivos estáticos. |
| `TRUST_PROXY` / `DB_SSL` | No | Para despliegues detrás de proxy y bases de datos en la nube. |
| `ANTHROPIC_API_KEY` | No | Activa Vanty con Claude. Sin ella, Vanty usa el modo local. |
| `VANTY_MODEL` / `VANTY_EFFORT` / `VANTY_FALLBACKS` | No | Modelo (`claude-opus-5`), esfuerzo (`medium`) y respaldo ante rechazos (`true`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Envío de correos de recuperación. Sin SMTP, el enlace se muestra en la consola del servidor. |

---

## Estructura del proyecto

```
icfes-lab/
├── backend/src/
│   ├── server.js · app.js           Arranque y configuración de Express
│   ├── config/                      Entorno, conexión a PostgreSQL y reglas del juego
│   ├── middlewares/                 JWT, CSRF, validación, límites, páginas protegidas, errores
│   ├── routes/ · controllers/       Capa HTTP (validación de entrada → servicio → JSON)
│   ├── services/                    Lógica de negocio (gamificación, simulacros, analítica…)
│   │   └── vanty/                   IA tutora: contexto, intención, Claude, motor local
│   ├── validators/ · utils/         Validadores reutilizables y utilidades
│   └── scripts/                     Instalación, siembra, demo, SQL, administrador, iconos
├── frontend/
│   ├── *.html                       23 páginas (MPA): inicio, materias, simulacros, vanty…
│   ├── css/                         Tokens de diseño, base, componentes, estructura y páginas
│   ├── js/core/                     API, DOM seguro, estructura, avatar, gráficas, preguntas…
│   ├── js/paginas/                  Un módulo por página
│   └── img/                         Logo, Vanty, iconos, imágenes de preguntas
├── database/
│   ├── schema.sql                   35 tablas, índices, llaves, triggers y vistas
│   ├── seed.sql                     Catálogo: niveles, materias, logros, tienda, simulacros…
│   ├── seed_contenido.sql           Contenido académico en SQL (generado)
│   └── contenido/                   Preguntas, lecciones y conocimiento de Vanty (JSON)
├── docs/                            Documentación técnica
├── tests/                           Pruebas unitarias y de humo
├── iniciar.cmd · detener.cmd    Arranque y parada con doble clic (Windows)
├── Dockerfile · docker-compose.yml
└── .env.example
```

---

## Documentación

- [Arquitectura y seguridad](docs/ARQUITECTURA.md)
- [Base de datos (modelo entidad-relación)](docs/BASE_DE_DATOS.md)
- [API REST](docs/API.md)
- [Gamificación, puntajes y reglas](docs/GAMIFICACION.md)
- [Vanty, la IA tutora](docs/VANTY.md)
- [Instalación y despliegue](docs/DESPLIEGUE.md)
- [Formato del contenido académico](database/contenido/FORMATO.md)

---

## Contenido académico

El banco inicial tiene **50 preguntas originales** (10 por área, 2 por subtema, dificultad 3/4/3), **25 lecciones** (una por subtema, con ejercicios) y **40 entradas** de conocimiento para Vanty. Todo el contenido fue escrito para ICFES Lab (no copia ítems oficiales). Para ampliar el banco usa el panel de administración (formulario o importación JSON) o agrega archivos en `database/contenido/` y ejecuta `npm run db:seed`.

> Recomendación: pide a un docente de cada área que revise el contenido antes de usarlo con estudiantes, en especial los datos jurídicos de Sociales y Ciudadanas (Ley 1930 de 2018 sobre páramos, plazos del derecho de petición).

ICFES Lab es una plataforma independiente y no está afiliada al ICFES. Los puntajes que muestra son estimaciones orientativas.

## Créditos

Iconos de [Lucide](https://lucide.dev) (licencia ISC) y gráficas con [Chart.js](https://www.chartjs.org) (licencia MIT).
#   I C F E S - L A B  
 