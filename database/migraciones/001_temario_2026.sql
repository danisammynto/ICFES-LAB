-- =============================================================================
--  Migración 001 · Temario 2026 (temas y subtemas desactivables, preguntas de 3 opciones)
--  Idempotente: `npm run db:setup` la aplica siempre antes de seed.sql; en una base nueva
--  no cambia nada porque schema.sql ya incluye estas definiciones.
-- =============================================================================
SET client_encoding = 'UTF8';

BEGIN;

-- Los temas y subtemas de temarios anteriores se conservan con su historial de respuestas
-- y progreso, pero dejan de mostrarse en la plataforma.
ALTER TABLE temas    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE subtemas ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS subtemas_activos_idx ON subtemas (tema_id, orden) WHERE activo;

-- La prueba de Inglés del Saber 11 usa 3 opciones (A–C) en varias partes: cada pregunta
-- debe tener 3 o 4 opciones y exactamente 1 correcta.
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

  IF NOT EXISTS (SELECT 1 FROM preguntas WHERE id = v_pregunta) THEN
    RETURN NULL;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE es_correcta)
    INTO v_total, v_correctas
    FROM opciones WHERE pregunta_id = v_pregunta;

  IF v_total NOT BETWEEN 3 AND 4 OR v_correctas <> 1 THEN
    RAISE EXCEPTION 'La pregunta % debe tener 3 o 4 opciones y 1 correcta (tiene % y %).',
      v_pregunta, v_total, v_correctas
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
