-- =============================================================================
--  Migración 002 · Calendario del ICFES, niveles con requisitos y fin del nivel Maestro
--  Idempotente: `npm run db:setup` la aplica siempre antes de seed.sql; en una base nueva
--  no cambia nada porque schema.sql ya incluye estas definiciones.
--  No borra progreso: respuestas, XP, logros e insignias obtenidas se conservan.
-- =============================================================================
SET client_encoding = 'UTF8';

BEGIN;

-- Calendario en el que el estudiante presentará el Saber 11 (se pregunta al primer inicio de sesión).
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS calendario_icfes CHAR(1)
  CONSTRAINT perfiles_calendario_icfes_ck CHECK (calendario_icfes IN ('A', 'B'));

-- Requisitos académicos de cada nivel (además de la XP mínima).
ALTER TABLE niveles ADD COLUMN IF NOT EXISTS requisitos JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Insignias y logros que ya no se pueden obtener: se ocultan, pero quien los tiene los conserva.
ALTER TABLE insignias ADD COLUMN IF NOT EXISTS activa BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE logros    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- Las insignias de la tienda dejan de venderse.
UPDATE insignias SET activa = FALSE WHERE origen = 'tienda' AND activa;

-- Se elimina el nivel 5 (Maestro ICFES). Quien estaba en él queda en el nivel 4 (Experto),
-- que ahora es el nivel máximo; lo que pedía el nivel 5 pasa a pedir el nivel 4.
UPDATE perfiles     SET nivel = 4           WHERE nivel > 4;
UPDATE subtemas     SET nivel_requerido = 4 WHERE nivel_requerido > 4;
UPDATE insignias    SET nivel_requerido = 4 WHERE nivel_requerido > 4;
UPDATE items_tienda SET nivel_requerido = 4 WHERE nivel_requerido > 4;
-- El reto "Maestro ICFES" era el reto final del nivel 5: se retira (sus resultados se conservan).
UPDATE simulacros   SET nivel_requerido = 4, activo = FALSE WHERE nivel_requerido > 4;
UPDATE insignias    SET activa = FALSE WHERE codigo = 'nivel-maestro';
UPDATE logros       SET activo = FALSE WHERE codigo = 'nivel-maestro';
DELETE FROM niveles WHERE numero > 4;

COMMIT;
