-- =============================================================================
--  ICFES Lab · Esquema de base de datos PostgreSQL (versión 13 o superior)
-- -----------------------------------------------------------------------------
--  Módulos:
--    1. Usuarios y seguridad        usuarios, perfiles, tokens_recuperacion
--    2. Catálogo académico           materias, temas, subtemas, lecciones,
--                                    contextos, preguntas, opciones
--    3. Actividad del estudiante     respuestas, progreso, lecciones_completadas
--    4. Simulacros                   simulacros, intentos_simulacro, intento_sesiones,
--                                    intento_preguntas, resultados, resultados_materia
--    5. Gamificación                 niveles, logros, usuario_logros, insignias,
--                                    usuario_insignias, items_tienda, inventario,
--                                    rachas, recompensas_racha, usuario_recompensas_racha,
--                                    historial_recompensas
--    6. Estadísticas                 actividad_diaria, estadisticas
--    7. IA Vanty                     conversaciones_vanty, mensajes_vanty
--    8. Configuración                configuracion
--
--  Convenciones:
--    · Nombres en español y snake_case.
--    · Fechas con zona horaria (TIMESTAMPTZ); los días de estudio se calculan en
--      la zona horaria de la aplicación (America/Bogota por defecto).
--    · Valores cerrados con CHECK en lugar de ENUM para facilitar su evolución.
-- =============================================================================

-- El archivo está en UTF-8 (psql en Windows podría asumir la página de códigos de la consola).
SET client_encoding = 'UTF8';

BEGIN;

-- -----------------------------------------------------------------------------
-- Funciones utilitarias
-- -----------------------------------------------------------------------------

-- Mantiene actualizada la columna actualizado_en en cada UPDATE.
CREATE OR REPLACE FUNCTION tg_set_actualizado_en() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5a. Niveles (se crea antes que perfiles porque perfiles la referencia)
-- =============================================================================
CREATE TABLE niveles (
  numero              SMALLINT     PRIMARY KEY CHECK (numero BETWEEN 1 AND 99),
  nombre              VARCHAR(40)  NOT NULL UNIQUE,
  xp_minimo           INTEGER      NOT NULL UNIQUE CHECK (xp_minimo >= 0),
  descripcion         VARCHAR(255) NOT NULL DEFAULT '',
  color               VARCHAR(9)   NOT NULL DEFAULT '#484ea2',
  icono               VARCHAR(40)  NOT NULL DEFAULT 'sprout',
  recompensa_monedas  INTEGER      NOT NULL DEFAULT 0 CHECK (recompensa_monedas >= 0),
  desbloqueos         JSONB        NOT NULL DEFAULT '[]'::jsonb
);
COMMENT ON TABLE niveles IS 'Niveles del estudiante según su XP: Principiante → Maestro ICFES.';

-- =============================================================================
-- 5b. Insignias (perfiles referencia la insignia destacada)
-- =============================================================================
CREATE TABLE insignias (
  id               INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo           VARCHAR(40)  NOT NULL UNIQUE,
  nombre           VARCHAR(60)  NOT NULL,
  descripcion      VARCHAR(255) NOT NULL,
  icono            VARCHAR(40)  NOT NULL,
  color            VARCHAR(9)   NOT NULL DEFAULT '#484ea2',
  rareza           VARCHAR(12)  NOT NULL DEFAULT 'comun'
                     CHECK (rareza IN ('comun', 'rara', 'epica', 'legendaria')),
  origen           VARCHAR(12)  NOT NULL
                     CHECK (origen IN ('logro', 'nivel', 'tienda', 'racha')),
  precio_monedas   INTEGER      CHECK (precio_monedas IS NULL OR precio_monedas > 0),
  nivel_requerido  SMALLINT     NOT NULL DEFAULT 1 REFERENCES niveles (numero),
  orden            SMALLINT     NOT NULL DEFAULT 0,
  -- Solo las insignias de tienda tienen precio.
  CONSTRAINT insignias_precio_tienda_ck CHECK ((origen = 'tienda') = (precio_monedas IS NOT NULL))
);

-- Insignia que se entrega al alcanzar cada nivel (relación circular resuelta con ALTER).
ALTER TABLE niveles ADD COLUMN insignia_id INTEGER REFERENCES insignias (id) ON DELETE SET NULL;

-- =============================================================================
-- 1. Usuarios y seguridad
-- =============================================================================
CREATE TABLE usuarios (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          VARCHAR(80)  NOT NULL CHECK (length(trim(nombre)) >= 2),
  email           VARCHAR(160) NOT NULL CHECK (position('@' IN email) > 1),
  password_hash   VARCHAR(100) NOT NULL,
  rol             VARCHAR(20)  NOT NULL DEFAULT 'estudiante' CHECK (rol IN ('estudiante', 'admin')),
  activo          BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Se incrementa al cambiar la contraseña o cerrar todas las sesiones: invalida los JWT emitidos.
  token_version   INTEGER      NOT NULL DEFAULT 0,
  ultimo_acceso   TIMESTAMPTZ,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Email único sin distinguir mayúsculas.
CREATE UNIQUE INDEX usuarios_email_uq ON usuarios (lower(email));
CREATE TRIGGER usuarios_actualizado_en BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

CREATE TABLE perfiles (
  usuario_id             UUID         PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
  nombre_mostrar         VARCHAR(40),
  bio                    VARCHAR(280),
  colegio                VARCHAR(120),
  ciudad                 VARCHAR(80),
  grado                  VARCHAR(12)  CHECK (grado IN ('10', '11', 'egresado', 'otro')),
  avatar                 JSONB        NOT NULL DEFAULT
                           '{"color":"color-lima","expresion":"expresion-feliz","accesorio":"accesorio-ninguno","fondo":"fondo-indigo"}'::jsonb,
  fecha_icfes            DATE,        -- Fecha personal; si es NULL se usa la fecha global.
  meta_diaria_min        SMALLINT     NOT NULL DEFAULT 30 CHECK (meta_diaria_min BETWEEN 5 AND 240),
  meta_puntaje           SMALLINT     CHECK (meta_puntaje BETWEEN 0 AND 500),
  tema_interfaz          VARCHAR(10)  NOT NULL DEFAULT 'sistema' CHECK (tema_interfaz IN ('claro', 'oscuro', 'sistema')),
  recordatorios          BOOLEAN      NOT NULL DEFAULT TRUE,
  xp                     INTEGER      NOT NULL DEFAULT 0 CHECK (xp >= 0),
  nivel                  SMALLINT     NOT NULL DEFAULT 1 REFERENCES niveles (numero),
  monedas                INTEGER      NOT NULL DEFAULT 50 CHECK (monedas >= 0),
  insignia_destacada_id  INTEGER      REFERENCES insignias (id) ON DELETE SET NULL,
  actualizado_en         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN perfiles.avatar IS 'Códigos de items_tienda equipados: color, expresion, accesorio y fondo.';
CREATE TRIGGER perfiles_actualizado_en BEFORE UPDATE ON perfiles
  FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

CREATE TABLE tokens_recuperacion (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  token_hash  CHAR(64)     NOT NULL UNIQUE,   -- SHA-256 del token; el token plano nunca se guarda.
  expira_en   TIMESTAMPTZ  NOT NULL,
  usado_en    TIMESTAMPTZ,
  ip          VARCHAR(45),
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX tokens_recuperacion_usuario_idx ON tokens_recuperacion (usuario_id, creado_en DESC);

-- =============================================================================
-- 2. Catálogo académico
-- =============================================================================
CREATE TABLE materias (
  id           SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug         VARCHAR(40)  NOT NULL UNIQUE,
  nombre       VARCHAR(60)  NOT NULL,
  nombre_corto VARCHAR(20)  NOT NULL,
  descripcion  VARCHAR(300) NOT NULL DEFAULT '',
  color        VARCHAR(9)   NOT NULL,
  icono        VARCHAR(40)  NOT NULL,
  -- Ponderación en el puntaje global del Saber 11 (3 para las áreas núcleo, 1 para Inglés).
  peso_global  SMALLINT     NOT NULL DEFAULT 3 CHECK (peso_global BETWEEN 1 AND 5),
  orden        SMALLINT     NOT NULL DEFAULT 0
);

CREATE TABLE temas (
  id               INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  materia_id       SMALLINT     NOT NULL REFERENCES materias (id) ON DELETE CASCADE,
  slug             VARCHAR(60)  NOT NULL UNIQUE,
  nombre           VARCHAR(100) NOT NULL,
  descripcion      VARCHAR(300) NOT NULL DEFAULT '',
  orden            SMALLINT     NOT NULL DEFAULT 0
);
CREATE INDEX temas_materia_idx ON temas (materia_id, orden);

CREATE TABLE subtemas (
  id               INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tema_id          INTEGER      NOT NULL REFERENCES temas (id) ON DELETE CASCADE,
  slug             VARCHAR(60)  NOT NULL UNIQUE,
  nombre           VARCHAR(100) NOT NULL,
  descripcion      VARCHAR(300) NOT NULL DEFAULT '',
  icono            VARCHAR(40)  NOT NULL DEFAULT 'book-open',
  -- Nivel del estudiante necesario para desbloquear el subtema.
  nivel_requerido  SMALLINT     NOT NULL DEFAULT 1 REFERENCES niveles (numero),
  orden            SMALLINT     NOT NULL DEFAULT 0
);
CREATE INDEX subtemas_tema_idx ON subtemas (tema_id, orden);

CREATE TABLE lecciones (
  id                  INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subtema_id          INTEGER      NOT NULL REFERENCES subtemas (id) ON DELETE CASCADE,
  codigo              VARCHAR(30)  NOT NULL UNIQUE,
  titulo              VARCHAR(150) NOT NULL,
  resumen             VARCHAR(300) NOT NULL DEFAULT '',
  -- Bloques de contenido: texto, concepto, formula, ejemplo, lista, tip, ejercicio.
  contenido           JSONB        NOT NULL CHECK (jsonb_typeof(contenido) = 'array'),
  duracion_min        SMALLINT     NOT NULL DEFAULT 8 CHECK (duracion_min BETWEEN 1 AND 60),
  xp_recompensa       SMALLINT     NOT NULL DEFAULT 30,
  monedas_recompensa  SMALLINT     NOT NULL DEFAULT 5,
  orden               SMALLINT     NOT NULL DEFAULT 1,
  activa              BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX lecciones_subtema_idx ON lecciones (subtema_id, orden) WHERE activa;

-- Textos o situaciones que pueden compartir varias preguntas (como en el ICFES).
CREATE TABLE contextos (
  id          INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo      VARCHAR(40)  UNIQUE,
  titulo      VARCHAR(150),
  contenido   TEXT         NOT NULL,
  imagen_url  VARCHAR(255),
  imagen_alt  VARCHAR(300),
  fuente      VARCHAR(200)
);

CREATE TABLE preguntas (
  id                   INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo               VARCHAR(40)  NOT NULL UNIQUE,
  subtema_id           INTEGER      NOT NULL REFERENCES subtemas (id) ON DELETE RESTRICT,
  contexto_id          INTEGER      REFERENCES contextos (id) ON DELETE SET NULL,
  enunciado            TEXT         NOT NULL,
  imagen_url           VARCHAR(255),
  imagen_alt           VARCHAR(300),
  dificultad           SMALLINT     NOT NULL DEFAULT 2 CHECK (dificultad BETWEEN 1 AND 3),
  competencia          VARCHAR(120),
  explicacion          TEXT         NOT NULL,
  tiempo_estimado_seg  SMALLINT     NOT NULL DEFAULT 120 CHECK (tiempo_estimado_seg BETWEEN 15 AND 600),
  etiquetas            TEXT[]       NOT NULL DEFAULT '{}',
  -- banco: contenido oficial · admin: creada en el panel · vanty: generada por la IA para un estudiante.
  origen               VARCHAR(10)  NOT NULL DEFAULT 'banco' CHECK (origen IN ('banco', 'admin', 'vanty')),
  autor_id             UUID         REFERENCES usuarios (id) ON DELETE CASCADE,
  publica              BOOLEAN      NOT NULL DEFAULT TRUE,
  activa               BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Las preguntas generadas por Vanty son privadas de su autor.
  CONSTRAINT preguntas_vanty_privadas_ck CHECK (origen <> 'vanty' OR (publica = FALSE AND autor_id IS NOT NULL))
);
CREATE INDEX preguntas_subtema_idx ON preguntas (subtema_id, dificultad) WHERE activa AND publica;
CREATE INDEX preguntas_contexto_idx ON preguntas (contexto_id) WHERE contexto_id IS NOT NULL;
CREATE INDEX preguntas_autor_idx ON preguntas (autor_id) WHERE autor_id IS NOT NULL;
CREATE INDEX preguntas_etiquetas_gin ON preguntas USING GIN (etiquetas);

CREATE TABLE opciones (
  id                 INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pregunta_id        INTEGER      NOT NULL REFERENCES preguntas (id) ON DELETE CASCADE,
  letra              CHAR(1)      NOT NULL CHECK (letra IN ('A', 'B', 'C', 'D')),
  texto              TEXT         NOT NULL,
  es_correcta        BOOLEAN      NOT NULL DEFAULT FALSE,
  retroalimentacion  TEXT,
  CONSTRAINT opciones_letra_uq UNIQUE (pregunta_id, letra)
);
-- Como máximo una opción correcta por pregunta.
CREATE UNIQUE INDEX opciones_una_correcta_uq ON opciones (pregunta_id) WHERE es_correcta;

-- Integridad diferida: al confirmar la transacción cada pregunta debe tener
-- exactamente 4 opciones y exactamente 1 correcta.
CREATE OR REPLACE FUNCTION tg_validar_opciones_pregunta() RETURNS trigger AS $$
DECLARE
  v_pregunta INTEGER;
  v_total    INTEGER;
  v_correctas INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'preguntas' THEN
    v_pregunta := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_pregunta := OLD.pregunta_id;
  ELSE
    v_pregunta := NEW.pregunta_id;
  END IF;

  -- Si la pregunta fue eliminada no hay nada que validar.
  IF NOT EXISTS (SELECT 1 FROM preguntas WHERE id = v_pregunta) THEN
    RETURN NULL;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE es_correcta)
    INTO v_total, v_correctas
    FROM opciones WHERE pregunta_id = v_pregunta;

  IF v_total <> 4 OR v_correctas <> 1 THEN
    RAISE EXCEPTION 'La pregunta % debe tener 4 opciones y 1 correcta (tiene % y %).',
      v_pregunta, v_total, v_correctas
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER preguntas_opciones_validas
  AFTER INSERT ON preguntas
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tg_validar_opciones_pregunta();

CREATE CONSTRAINT TRIGGER opciones_validas
  AFTER INSERT OR UPDATE OR DELETE ON opciones
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION tg_validar_opciones_pregunta();

-- =============================================================================
-- 4. Simulacros (catálogo; se crea antes que respuestas porque éstas lo referencian)
-- =============================================================================
-- Plantillas: 10 simulacros completos, 10 minisimulacros (camino) y retos por nivel.
CREATE TABLE simulacros (
  id                      SMALLINT     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo                    VARCHAR(10)  NOT NULL CHECK (tipo IN ('completo', 'mini', 'reto')),
  numero                  SMALLINT     NOT NULL,
  codigo                  VARCHAR(40)  NOT NULL UNIQUE,
  titulo                  VARCHAR(100) NOT NULL,
  descripcion             VARCHAR(400) NOT NULL DEFAULT '',
  icono                   VARCHAR(40)  NOT NULL DEFAULT 'file-text',
  -- {"sesiones":[{"numero":1,"titulo":"…","duracion_min":270,"preguntas":{"matematicas":25,…}}],
  --  "dificultad":[1,3], "seleccion":"fija"|"adaptativa"|"materia_debil"}
  config                  JSONB        NOT NULL,
  nivel_requerido         SMALLINT     NOT NULL DEFAULT 1 REFERENCES niveles (numero),
  -- Minisimulacros: se desbloquean al completar el anterior del camino.
  requiere_simulacro_id   SMALLINT     REFERENCES simulacros (id),
  porcentaje_aprobacion   SMALLINT     NOT NULL DEFAULT 0 CHECK (porcentaje_aprobacion BETWEEN 0 AND 100),
  xp_recompensa           SMALLINT     NOT NULL DEFAULT 50,
  monedas_recompensa      SMALLINT     NOT NULL DEFAULT 10,
  activo                  BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT simulacros_tipo_numero_uq UNIQUE (tipo, numero)
);

-- =============================================================================
-- 3. Actividad del estudiante
-- =============================================================================
CREATE TABLE intentos_simulacro (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id        UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  simulacro_id      SMALLINT     NOT NULL REFERENCES simulacros (id),
  estado            VARCHAR(12)  NOT NULL DEFAULT 'en_curso'
                      CHECK (estado IN ('en_curso', 'finalizado', 'abandonado')),
  sesion_actual     SMALLINT     NOT NULL DEFAULT 1,
  iniciado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  finalizado_en     TIMESTAMPTZ,
  tiempo_usado_seg  INTEGER      NOT NULL DEFAULT 0
);
CREATE INDEX intentos_usuario_idx ON intentos_simulacro (usuario_id, iniciado_en DESC);
-- Un único intento en curso por estudiante y simulacro.
CREATE UNIQUE INDEX intentos_en_curso_uq ON intentos_simulacro (usuario_id, simulacro_id) WHERE estado = 'en_curso';

CREATE TABLE intento_sesiones (
  id             INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intento_id     UUID         NOT NULL REFERENCES intentos_simulacro (id) ON DELETE CASCADE,
  numero         SMALLINT     NOT NULL,
  titulo         VARCHAR(100) NOT NULL,
  duracion_seg   INTEGER      NOT NULL CHECK (duracion_seg > 0),
  iniciada_en    TIMESTAMPTZ,
  finalizada_en  TIMESTAMPTZ,
  CONSTRAINT intento_sesiones_uq UNIQUE (intento_id, numero)
);

CREATE TABLE intento_preguntas (
  intento_id      UUID         NOT NULL REFERENCES intentos_simulacro (id) ON DELETE CASCADE,
  pregunta_id     INTEGER      NOT NULL REFERENCES preguntas (id),
  sesion_numero   SMALLINT     NOT NULL,
  orden           SMALLINT     NOT NULL,
  opcion_id       INTEGER      REFERENCES opciones (id),
  es_correcta     BOOLEAN,
  tiempo_ms       INTEGER      NOT NULL DEFAULT 0 CHECK (tiempo_ms >= 0),
  marcada         BOOLEAN      NOT NULL DEFAULT FALSE,
  respondida_en   TIMESTAMPTZ,
  PRIMARY KEY (intento_id, pregunta_id)
);
CREATE INDEX intento_preguntas_orden_idx ON intento_preguntas (intento_id, sesion_numero, orden);

-- Registro de TODAS las respuestas (práctica, lecciones, simulacros, retos, Vanty).
-- materia_id y subtema_id se desnormalizan a propósito para acelerar la analítica.
CREATE TABLE respuestas (
  id            BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id    UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  pregunta_id   INTEGER      NOT NULL REFERENCES preguntas (id) ON DELETE CASCADE,
  opcion_id     INTEGER      REFERENCES opciones (id) ON DELETE SET NULL,  -- NULL = omitida
  materia_id    SMALLINT     NOT NULL REFERENCES materias (id),
  subtema_id    INTEGER      NOT NULL REFERENCES subtemas (id),
  es_correcta   BOOLEAN      NOT NULL,
  tiempo_ms     INTEGER      NOT NULL DEFAULT 0 CHECK (tiempo_ms >= 0),
  origen        VARCHAR(12)  NOT NULL CHECK (origen IN ('practica', 'leccion', 'simulacro', 'reto', 'vanty')),
  intento_id    UUID         REFERENCES intentos_simulacro (id) ON DELETE SET NULL,
  creado_en     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX respuestas_usuario_fecha_idx ON respuestas (usuario_id, creado_en DESC);
CREATE INDEX respuestas_usuario_materia_idx ON respuestas (usuario_id, materia_id, creado_en DESC);
CREATE INDEX respuestas_usuario_subtema_idx ON respuestas (usuario_id, subtema_id);
CREATE INDEX respuestas_usuario_pregunta_idx ON respuestas (usuario_id, pregunta_id, creado_en DESC);
CREATE INDEX respuestas_intento_idx ON respuestas (intento_id) WHERE intento_id IS NOT NULL;

-- Dominio del estudiante en cada subtema.
CREATE TABLE progreso (
  usuario_id              UUID          NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  subtema_id              INTEGER       NOT NULL REFERENCES subtemas (id) ON DELETE CASCADE,
  respondidas             INTEGER       NOT NULL DEFAULT 0 CHECK (respondidas >= 0),
  correctas               INTEGER       NOT NULL DEFAULT 0 CHECK (correctas >= 0),
  -- Promedio móvil exponencial de aciertos (0–100): pondera más lo reciente.
  dominio                 NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (dominio BETWEEN 0 AND 100),
  lecciones_completadas   SMALLINT      NOT NULL DEFAULT 0,
  completado              BOOLEAN       NOT NULL DEFAULT FALSE,
  completado_en           TIMESTAMPTZ,
  ultima_actividad        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, subtema_id),
  CONSTRAINT progreso_correctas_ck CHECK (correctas <= respondidas)
);

CREATE TABLE lecciones_completadas (
  usuario_id           UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  leccion_id           INTEGER      NOT NULL REFERENCES lecciones (id) ON DELETE CASCADE,
  completada_en        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  tiempo_seg           INTEGER      NOT NULL DEFAULT 0 CHECK (tiempo_seg >= 0),
  aciertos_ejercicios  SMALLINT     NOT NULL DEFAULT 0,
  total_ejercicios     SMALLINT     NOT NULL DEFAULT 0,
  veces                SMALLINT     NOT NULL DEFAULT 1,
  PRIMARY KEY (usuario_id, leccion_id)
);

-- =============================================================================
-- 4b. Resultados de simulacros
-- =============================================================================
CREATE TABLE resultados (
  id                BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  intento_id        UUID          NOT NULL UNIQUE REFERENCES intentos_simulacro (id) ON DELETE CASCADE,
  usuario_id        UUID          NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  simulacro_id      SMALLINT      NOT NULL REFERENCES simulacros (id),
  puntaje_global    SMALLINT      NOT NULL CHECK (puntaje_global BETWEEN 0 AND 500),
  porcentaje        NUMERIC(5, 2) NOT NULL CHECK (porcentaje BETWEEN 0 AND 100),
  aciertos          SMALLINT      NOT NULL,
  errores           SMALLINT      NOT NULL,
  omitidas          SMALLINT      NOT NULL,
  total             SMALLINT      NOT NULL,
  tiempo_usado_seg  INTEGER       NOT NULL,
  estrellas         SMALLINT      NOT NULL DEFAULT 0 CHECK (estrellas BETWEEN 0 AND 3),
  aprobado          BOOLEAN       NOT NULL DEFAULT TRUE,
  xp_ganado         INTEGER       NOT NULL DEFAULT 0,
  monedas_ganadas   INTEGER       NOT NULL DEFAULT 0,
  recomendaciones   JSONB         NOT NULL DEFAULT '[]'::jsonb,
  creado_en         TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT resultados_conteo_ck CHECK (aciertos + errores + omitidas = total)
);
CREATE INDEX resultados_usuario_idx ON resultados (usuario_id, creado_en DESC);
CREATE INDEX resultados_simulacro_idx ON resultados (usuario_id, simulacro_id);

CREATE TABLE resultados_materia (
  resultado_id        BIGINT    NOT NULL REFERENCES resultados (id) ON DELETE CASCADE,
  materia_id          SMALLINT  NOT NULL REFERENCES materias (id),
  aciertos            SMALLINT  NOT NULL,
  total               SMALLINT  NOT NULL,
  puntaje             SMALLINT  NOT NULL CHECK (puntaje BETWEEN 0 AND 100),
  tiempo_promedio_ms  INTEGER   NOT NULL DEFAULT 0,
  PRIMARY KEY (resultado_id, materia_id)
);

-- =============================================================================
-- 5. Gamificación
-- =============================================================================
CREATE TABLE logros (
  id                  INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo              VARCHAR(40)  NOT NULL UNIQUE,
  nombre              VARCHAR(60)  NOT NULL,
  descripcion         VARCHAR(255) NOT NULL,
  icono               VARCHAR(40)  NOT NULL,
  categoria           VARCHAR(20)  NOT NULL
                        CHECK (categoria IN ('constancia', 'precision', 'simulacros', 'progreso', 'social', 'especial')),
  -- Métrica evaluada por el motor de logros (ver backend/src/services/logros.service.js).
  criterio            VARCHAR(40)  NOT NULL,
  meta                INTEGER      NOT NULL CHECK (meta > 0),
  xp_recompensa       INTEGER      NOT NULL DEFAULT 0,
  monedas_recompensa  INTEGER      NOT NULL DEFAULT 0,
  insignia_id         INTEGER      REFERENCES insignias (id) ON DELETE SET NULL,
  secreto             BOOLEAN      NOT NULL DEFAULT FALSE,
  orden               SMALLINT     NOT NULL DEFAULT 0
);

CREATE TABLE usuario_logros (
  usuario_id       UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  logro_id         INTEGER      NOT NULL REFERENCES logros (id) ON DELETE CASCADE,
  desbloqueado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, logro_id)
);

CREATE TABLE usuario_insignias (
  usuario_id   UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  insignia_id  INTEGER      NOT NULL REFERENCES insignias (id) ON DELETE CASCADE,
  obtenida_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, insignia_id)
);

CREATE TABLE items_tienda (
  id               INTEGER      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo           VARCHAR(40)  NOT NULL UNIQUE,
  categoria        VARCHAR(12)  NOT NULL CHECK (categoria IN ('color', 'expresion', 'accesorio', 'fondo', 'protector')),
  nombre           VARCHAR(60)  NOT NULL,
  descripcion      VARCHAR(255) NOT NULL DEFAULT '',
  precio           INTEGER      NOT NULL DEFAULT 0 CHECK (precio >= 0),
  nivel_requerido  SMALLINT     NOT NULL DEFAULT 1 REFERENCES niveles (numero),
  datos            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  orden            SMALLINT     NOT NULL DEFAULT 0
);
CREATE INDEX items_tienda_categoria_idx ON items_tienda (categoria, orden);

CREATE TABLE inventario (
  usuario_id    UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  item_id       INTEGER      NOT NULL REFERENCES items_tienda (id) ON DELETE CASCADE,
  adquirido_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, item_id)
);

CREATE TABLE rachas (
  usuario_id      UUID         PRIMARY KEY REFERENCES usuarios (id) ON DELETE CASCADE,
  actual          INTEGER      NOT NULL DEFAULT 0 CHECK (actual >= 0),
  maxima          INTEGER      NOT NULL DEFAULT 0 CHECK (maxima >= 0),
  inicio_racha    DATE,
  ultima_fecha    DATE,
  -- Protectores: cubren automáticamente un día sin estudio sin perder la racha.
  protectores     SMALLINT     NOT NULL DEFAULT 0 CHECK (protectores BETWEEN 0 AND 3),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT rachas_maxima_ck CHECK (maxima >= actual)
);

CREATE TABLE recompensas_racha (
  dias         SMALLINT     PRIMARY KEY CHECK (dias > 0),
  nombre       VARCHAR(60)  NOT NULL,
  xp           INTEGER      NOT NULL DEFAULT 0,
  monedas      INTEGER      NOT NULL DEFAULT 0,
  protectores  SMALLINT     NOT NULL DEFAULT 0,
  insignia_id  INTEGER      REFERENCES insignias (id) ON DELETE SET NULL
);

CREATE TABLE usuario_recompensas_racha (
  usuario_id   UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  dias         SMALLINT     NOT NULL REFERENCES recompensas_racha (dias) ON DELETE CASCADE,
  obtenida_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, dias)
);

-- Libro de movimientos de XP y monedas (auditoría y prevención de dobles recompensas).
CREATE TABLE historial_recompensas (
  id          BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  tipo        VARCHAR(8)   NOT NULL CHECK (tipo IN ('xp', 'monedas')),
  cantidad    INTEGER      NOT NULL CHECK (cantidad <> 0),
  motivo      VARCHAR(40)  NOT NULL,
  referencia  VARCHAR(80),
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX historial_recompensas_usuario_idx ON historial_recompensas (usuario_id, creado_en DESC);

-- =============================================================================
-- 6. Estadísticas
-- =============================================================================
-- Resumen diario del estudiante: calendario de actividad, horas de estudio y rachas.
CREATE TABLE actividad_diaria (
  usuario_id               UUID      NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  fecha                    DATE      NOT NULL,
  segundos_estudio         INTEGER   NOT NULL DEFAULT 0 CHECK (segundos_estudio >= 0),
  xp_ganado                INTEGER   NOT NULL DEFAULT 0,
  monedas_ganadas          INTEGER   NOT NULL DEFAULT 0,
  preguntas_respondidas    INTEGER   NOT NULL DEFAULT 0,
  correctas                INTEGER   NOT NULL DEFAULT 0,
  lecciones_completadas    SMALLINT  NOT NULL DEFAULT 0,
  simulacros_completados   SMALLINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, fecha)
);

-- Agregado diario por materia: evolución del rendimiento y tiempos de respuesta.
CREATE TABLE estadisticas (
  usuario_id       UUID      NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  materia_id       SMALLINT  NOT NULL REFERENCES materias (id) ON DELETE CASCADE,
  fecha            DATE      NOT NULL,
  respondidas      INTEGER   NOT NULL DEFAULT 0,
  correctas        INTEGER   NOT NULL DEFAULT 0,
  tiempo_total_ms  BIGINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (usuario_id, materia_id, fecha),
  CONSTRAINT estadisticas_correctas_ck CHECK (correctas <= respondidas)
);
CREATE INDEX estadisticas_usuario_fecha_idx ON estadisticas (usuario_id, fecha);

-- =============================================================================
-- 7. IA Vanty
-- =============================================================================
CREATE TABLE conversaciones_vanty (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  titulo          VARCHAR(120) NOT NULL DEFAULT 'Nueva conversación',
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX conversaciones_vanty_usuario_idx ON conversaciones_vanty (usuario_id, actualizado_en DESC);
CREATE TRIGGER conversaciones_vanty_actualizado_en BEFORE UPDATE ON conversaciones_vanty
  FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

CREATE TABLE mensajes_vanty (
  id                BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id   UUID         NOT NULL REFERENCES conversaciones_vanty (id) ON DELETE CASCADE,
  usuario_id        UUID         NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  rol               VARCHAR(8)   NOT NULL CHECK (rol IN ('usuario', 'vanty')),
  contenido         TEXT         NOT NULL,
  -- texto · pregunta (tarjeta interactiva) · recomendacion · explicacion
  tipo              VARCHAR(14)  NOT NULL DEFAULT 'texto'
                      CHECK (tipo IN ('texto', 'pregunta', 'recomendacion', 'explicacion')),
  metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  proveedor         VARCHAR(10)  CHECK (proveedor IN ('claude', 'local')),
  tokens_entrada    INTEGER,
  tokens_salida     INTEGER,
  creado_en         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX mensajes_vanty_conversacion_idx ON mensajes_vanty (conversacion_id, id);
CREATE INDEX mensajes_vanty_usuario_fecha_idx ON mensajes_vanty (usuario_id, creado_en DESC);

-- =============================================================================
-- 8. Configuración global (clave → valor JSON), editable por el administrador
-- =============================================================================
CREATE TABLE configuracion (
  clave           VARCHAR(60)  PRIMARY KEY,
  valor           JSONB        NOT NULL,
  descripcion     VARCHAR(255) NOT NULL DEFAULT '',
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER configuracion_actualizado_en BEFORE UPDATE ON configuracion
  FOR EACH ROW EXECUTE FUNCTION tg_set_actualizado_en();

-- =============================================================================
-- Alta de usuario: crea perfil, racha e inventario gratuito automáticamente.
-- =============================================================================
CREATE OR REPLACE FUNCTION tg_usuario_inicial() RETURNS trigger AS $$
BEGIN
  INSERT INTO perfiles (usuario_id, nombre_mostrar)
    VALUES (NEW.id, left(split_part(trim(NEW.nombre), ' ', 1), 40));
  INSERT INTO rachas (usuario_id) VALUES (NEW.id);
  INSERT INTO inventario (usuario_id, item_id)
    SELECT NEW.id, id FROM items_tienda WHERE precio = 0 AND categoria <> 'protector';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER usuarios_alta_inicial AFTER INSERT ON usuarios
  FOR EACH ROW EXECUTE FUNCTION tg_usuario_inicial();

-- =============================================================================
-- Vistas analíticas
-- =============================================================================
-- Rendimiento acumulado por estudiante y materia.
CREATE VIEW v_rendimiento_materia AS
SELECT r.usuario_id,
       m.id   AS materia_id,
       m.slug AS materia_slug,
       m.nombre AS materia,
       count(*)                                        AS respondidas,
       count(*) FILTER (WHERE r.es_correcta)           AS correctas,
       round(100.0 * count(*) FILTER (WHERE r.es_correcta) / count(*), 1) AS precision,
       round(avg(r.tiempo_ms))::INTEGER                AS tiempo_promedio_ms
  FROM respuestas r
  JOIN materias m ON m.id = r.materia_id
 GROUP BY r.usuario_id, m.id, m.slug, m.nombre;

-- Rendimiento acumulado por estudiante y subtema.
CREATE VIEW v_rendimiento_subtema AS
SELECT r.usuario_id,
       s.id    AS subtema_id,
       s.slug  AS subtema_slug,
       s.nombre AS subtema,
       t.materia_id,
       count(*)                                        AS respondidas,
       count(*) FILTER (WHERE r.es_correcta)           AS correctas,
       round(100.0 * count(*) FILTER (WHERE r.es_correcta) / count(*), 1) AS precision,
       round(avg(r.tiempo_ms))::INTEGER                AS tiempo_promedio_ms
  FROM respuestas r
  JOIN subtemas s ON s.id = r.subtema_id
  JOIN temas t    ON t.id = s.tema_id
 GROUP BY r.usuario_id, s.id, s.slug, s.nombre, t.materia_id;

COMMIT;
