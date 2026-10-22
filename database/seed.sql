-- =============================================================================
--  ICFES Lab · Datos iniciales del catálogo (idempotente: se puede re-ejecutar)
--  Contenido académico (preguntas y lecciones): database/contenido/*.json
--  → cargado con `npm run db:seed` o con database/seed_contenido.sql
-- =============================================================================

SET client_encoding = 'UTF8';

BEGIN;

-- -----------------------------------------------------------------------------
-- Niveles (el máximo es el 4, Experto). Para subir se necesita la XP mínima y TODOS los
-- requisitos académicos de `requisitos` (ver backend/src/services/niveles.service.js):
--   dias_activos  días con actividad de estudio
--   respondidas   preguntas respondidas (práctica, lecciones, simulacros, retos y Vanty)
--   precision     % de aciertos sobre todas las respuestas
--   temario_area  % de temas completados (lección + dominio ≥ 60 %) en CADA una de las 5 áreas
--   actividades   % de todas las actividades: lecciones, temas, minisimulacros, simulacros y retos
-- -----------------------------------------------------------------------------
INSERT INTO niveles (numero, nombre, xp_minimo, descripcion, color, icono, recompensa_monedas, desbloqueos, requisitos) VALUES
  (1, 'Principiante', 0,    'Das tus primeros pasos hacia el ICFES.', '#81a1f6', 'sprout', 0,
      '["70 temas del temario de Lectura Crítica, Matemáticas, Sociales y Ciudadanas, Ciencias Naturales e Inglés", "Camino de minisimulacros y los 5 simulacros completos", "Retos Relámpago y Supera tu punto débil"]',
      '{}'),
  (2, 'Explorador',   1000, 'Estudias con constancia y ya avanzas en las cinco áreas del temario.', '#a8bb2c', 'compass', 30,
      '["Los 14 temas de continuación (II y III) de Matemáticas, Ciencias Naturales y Sociales y Ciudadanas", "Reto Precisión", "Insignia Explorador", "Fondo Circuitos en la tienda"]',
      '{"dias_activos": 7, "respondidas": 150, "precision": 55, "temario_area": 25}'),
  (3, 'Avanzado',     4000, 'Dominas buena parte del temario de las cinco áreas con aciertos consistentes.', '#fda879', 'mountain', 60,
      '["Reto Maratón mixta", "Insignia Avanzado", "Birrete de grado, Ojos de estrella y fondo Aurora"]',
      '{"dias_activos": 25, "respondidas": 600, "precision": 65, "temario_area": 60, "actividades": 50}'),
  (4, 'Experto',      9000, 'Completaste el 90 % de las actividades de la plataforma: piensas como un experto.', '#484ea2', 'rocket', 100,
      '["Reto Desafío Experto", "Insignia Experto", "Color Dorado, Galaxia, Modo genio, Corona y fondo Rayos dorados para tu avatar"]',
      '{"dias_activos": 45, "respondidas": 1000, "precision": 75, "temario_area": 85, "actividades": 90}')
ON CONFLICT (numero) DO UPDATE SET
  nombre = EXCLUDED.nombre, xp_minimo = EXCLUDED.xp_minimo, descripcion = EXCLUDED.descripcion,
  color = EXCLUDED.color, icono = EXCLUDED.icono, recompensa_monedas = EXCLUDED.recompensa_monedas,
  desbloqueos = EXCLUDED.desbloqueos, requisitos = EXCLUDED.requisitos;

-- -----------------------------------------------------------------------------
-- Insignias
-- -----------------------------------------------------------------------------
INSERT INTO insignias (codigo, nombre, descripcion, icono, color, rareza, origen, precio_monedas, nivel_requerido, orden) VALUES
  -- Por nivel
  ('nivel-explorador', 'Explorador',        'Alcanzaste el nivel Explorador.',                  'compass',        '#a8bb2c', 'rara',       'nivel',  NULL, 1, 10),
  ('nivel-avanzado',   'Avanzado',          'Alcanzaste el nivel Avanzado.',                    'mountain',       '#fda879', 'rara',       'nivel',  NULL, 1, 11),
  ('nivel-experto',    'Experto',           'Alcanzaste el nivel Experto.',                     'rocket',         '#484ea2', 'epica',      'nivel',  NULL, 1, 12),
  -- Por racha
  ('racha-7',          'Llama semanal',     'Estudiaste 7 días seguidos.',                      'flame',          '#fda879', 'comun',      'racha',  NULL, 1, 20),
  ('racha-30',         'Fuego constante',   'Estudiaste 30 días seguidos.',                     'flame',          '#f47c48', 'epica',      'racha',  NULL, 1, 21),
  ('racha-100',        'Llama eterna',      '100 días seguidos de estudio. ¡Leyenda!',          'flame',          '#e0a526', 'legendaria', 'racha',  NULL, 1, 22),
  -- Por logros
  ('centenario',       'Centenario',        '100 respuestas correctas.',                        'target',         '#484ea2', 'rara',       'logro',  NULL, 1, 30),
  ('perfeccionista',   'Perfeccionista',    '100 % de aciertos en un minisimulacro.',           'gem',            '#81a1f6', 'epica',      'logro',  NULL, 1, 31),
  ('veterano',         'Veterano',          '10 simulacros completados.',                       'medal',          '#a8bb2c', 'epica',      'logro',  NULL, 1, 32),
  ('todoterreno',      'Todoterreno',       'Respondiste preguntas de las 5 áreas.',            'globe',          '#2fb3a0', 'rara',       'logro',  NULL, 1, 33),
  ('madrugador',       'Madrugador',        'Estudiaste antes de las 7:00 a. m.',               'sunrise',        '#fda879', 'comun',      'logro',  NULL, 1, 34),
  ('buho',             'Búho nocturno',     'Estudiaste después de las 10:00 p. m.',            'moon-star',      '#484ea2', 'comun',      'logro',  NULL, 1, 35)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, color = EXCLUDED.color,
  rareza = EXCLUDED.rareza, origen = EXCLUDED.origen, precio_monedas = EXCLUDED.precio_monedas,
  nivel_requerido = EXCLUDED.nivel_requerido, orden = EXCLUDED.orden;

-- Las insignias de la tienda ya no se venden y la del nivel Maestro ya no existe: quien
-- las obtuvo las conserva (activa = FALSE solo las oculta de la colección de los demás).
UPDATE insignias SET activa = FALSE WHERE (origen = 'tienda' OR codigo = 'nivel-maestro') AND activa;

-- Insignia de cada nivel.
UPDATE niveles n SET insignia_id = i.id
  FROM insignias i
 WHERE i.codigo = CASE n.numero WHEN 2 THEN 'nivel-explorador' WHEN 3 THEN 'nivel-avanzado'
                                WHEN 4 THEN 'nivel-experto' END;

-- -----------------------------------------------------------------------------
-- Materias, temas y subtemas (temario 2026: 9 bloques y 84 temas)
-- -----------------------------------------------------------------------------
INSERT INTO materias (slug, nombre, nombre_corto, descripcion, color, icono, peso_global, orden) VALUES
  ('matematicas',         'Matemáticas',           'Matemáticas', 'Razonamiento cuantitativo: álgebra, geometría, estadística, probabilidad y cálculo básico.', '#484ea2', 'calculator',     3, 1),
  ('lectura-critica',     'Lectura Crítica',       'Lectura',     'Comprender, interpretar y evaluar textos continuos y discontinuos.',                         '#81a1f6', 'book-open-text', 3, 2),
  ('ciencias-naturales',  'Ciencias Naturales',    'Ciencias',    'Biología, física, química, medio ambiente y pensamiento científico.',                         '#a8bb2c', 'flask-conical',  3, 3),
  ('sociales-ciudadanas', 'Sociales y Ciudadanas', 'Sociales',    'Historia, geografía, economía, política y competencias ciudadanas.',                         '#2fb3a0', 'landmark',       3, 4),
  ('ingles',              'Inglés',                'Inglés',      'Comprensión lectora y uso del idioma inglés según el Marco Común Europeo.',                  '#b27af0', 'languages',      1, 5)
ON CONFLICT (slug) DO UPDATE SET
  nombre = EXCLUDED.nombre, nombre_corto = EXCLUDED.nombre_corto, descripcion = EXCLUDED.descripcion,
  color = EXCLUDED.color, icono = EXCLUDED.icono, peso_global = EXCLUDED.peso_global, orden = EXCLUDED.orden;

INSERT INTO temas (materia_id, slug, nombre, descripcion, orden)
SELECT m.id, t.slug, t.nombre, t.descripcion, t.orden
  FROM (VALUES
    ('matematicas', 'matematicas', 'Matemáticas', 'Doce temas: de las operaciones básicas a las técnicas de conteo.', 1),
    ('lectura-critica', 'lectura-critica', 'Lectura Crítica', 'Siete temas para leer, analizar y evaluar cualquier texto.', 1),
    ('ciencias-naturales', 'biologia-macro', 'Biología Macro', 'Ecosistemas, evolución, cuerpo humano y medio ambiente.', 1),
    ('ciencias-naturales', 'biologia-micro', 'Biología Micro', 'La célula, su reproducción, su metabolismo y la genética.', 2),
    ('ciencias-naturales', 'quimica', 'Química', 'La materia, el átomo, las reacciones, las soluciones y los gases.', 3),
    ('ciencias-naturales', 'fisica', 'Física', 'Magnitudes, movimiento, fuerzas, ondas, electricidad y calor.', 4),
    ('sociales-ciudadanas', 'sociales-y-ciudadanas', 'Sociales y Ciudadanas', 'Derechos, Constitución, participación, protección y economía.', 1),
    ('sociales-ciudadanas', 'historia', 'Historia', 'Historia del mundo, de Latinoamérica y de Colombia.', 2),
    ('ingles', 'ingles', 'Inglés', 'Nueve temas de gramática en contexto para la prueba de Inglés.', 1)
  ) AS t (materia, slug, nombre, descripcion, orden)
  JOIN materias m ON m.slug = t.materia
ON CONFLICT (slug) DO UPDATE SET
  materia_id = EXCLUDED.materia_id, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden, activo = TRUE;

INSERT INTO subtemas (tema_id, slug, nombre, descripcion, icono, nivel_requerido, orden)
SELECT t.id, s.slug, s.nombre, s.descripcion, s.icono, s.nivel, s.orden
  FROM (VALUES
    ('matematicas', 'operaciones-basicas', 'Operaciones básicas', '', 'calculator', 1, 1),
    ('matematicas', 'porcentajes', 'Porcentajes', '', 'chart-column', 1, 2),
    ('matematicas', 'ecuaciones-basicas', 'Ecuaciones básicas', 'Ecuaciones de 1.° y 2.° grado', 'sigma', 1, 3),
    ('matematicas', 'geometria-i', 'Geometría I', 'Figuras geométricas, área y perímetro', 'triangle', 1, 4),
    ('matematicas', 'geometria-ii', 'Geometría II', 'Ángulos y triángulos', 'compass', 2, 5),
    ('matematicas', 'plano-cartesiano', 'Plano cartesiano', '', 'grid-3x3', 1, 6),
    ('matematicas', 'trigonometria-i', 'Trigonometría I', 'Teorema de Pitágoras y relaciones trigonométricas', 'triangle', 1, 7),
    ('matematicas', 'trigonometria-ii', 'Trigonometría II', 'Ley del seno y del coseno', 'mountain', 2, 8),
    ('matematicas', 'funciones-i', 'Funciones I', 'Dominio y rango', 'chart-spline', 1, 9),
    ('matematicas', 'funciones-ii', 'Funciones II', 'Tipos de funciones', 'chart-line', 2, 10),
    ('matematicas', 'medidas-tendencia-central', 'Medidas de tendencia central', 'Media, mediana y moda', 'chart-column', 1, 11),
    ('matematicas', 'tecnicas-de-conteo', 'Técnicas de conteo', 'Combinación, permutación y probabilidad', 'dices', 1, 12),
    ('lectura-critica', 'como-analizar-un-texto', '¿Cómo analizar un texto?', '', 'search', 1, 1),
    ('lectura-critica', 'tipos-de-textos', 'Tipos de textos e intenciones comunicativas', '', 'file-text', 1, 2),
    ('lectura-critica', 'taller-tipos-de-textos', 'Taller de tipos de textos', '', 'notebook-pen', 1, 3),
    ('lectura-critica', 'figuras-literarias', 'Figuras literarias', '', 'sparkles', 1, 4),
    ('lectura-critica', 'la-argumentacion', 'La argumentación', '', 'messages-square', 1, 5),
    ('lectura-critica', 'falacias-argumentativas', 'Falacias argumentativas', '', 'triangle-alert', 1, 6),
    ('lectura-critica', 'mini-detalles-de-los-textos', 'Mini detalles de los textos', '', 'eye', 1, 7),
    ('biologia-macro', 'ecosistemas', 'Ecosistemas', '', 'leaf', 1, 1),
    ('biologia-macro', 'simbiosis', 'Simbiosis', '', 'hand-heart', 1, 2),
    ('biologia-macro', 'ciclos-biogeoquimicos', 'Ciclos biogeoquímicos', '', 'refresh-cw', 1, 3),
    ('biologia-macro', 'metodo-cientifico', 'Método científico', '', 'microscope', 1, 4),
    ('biologia-macro', 'evolucion-de-las-especies', 'Evolución de las especies', '', 'footprints', 1, 5),
    ('biologia-macro', 'organos-del-cuerpo-humano', 'Órganos del cuerpo humano', '', 'heart', 1, 6),
    ('biologia-macro', 'ciencia-tecnologia-sociedad', 'Ciencia, tecnología y sociedad', '', 'globe', 1, 7),
    ('biologia-macro', 'medio-ambiente', 'Medio ambiente', '', 'sprout', 1, 8),
    ('biologia-micro', 'celula-procariota-eucariota', 'Célula procariota y eucariota', '', 'microscope', 1, 1),
    ('biologia-micro', 'organelos-de-la-celula', 'Organelos de la célula', '', 'puzzle', 1, 2),
    ('biologia-micro', 'transporte-de-membrana', 'Transporte de membrana', '', 'filter', 1, 3),
    ('biologia-micro', 'reproduccion-celular-i', 'Reproducción celular I', '', 'infinity', 1, 4),
    ('biologia-micro', 'reproduccion-celular-ii', 'Reproducción celular II', '', 'rotate-ccw', 2, 5),
    ('biologia-micro', 'metabolismo-celular', 'Metabolismo celular', '', 'zap', 1, 6),
    ('biologia-micro', 'transcripcion-y-traduccion', 'Transcripción y traducción', '', 'dna', 1, 7),
    ('biologia-micro', 'genetica-mendeliana', 'Genética mendeliana', '', 'grid-3x3', 1, 8),
    ('quimica', 'materia-y-propiedades-i', 'La materia y sus propiedades', '', 'flask-conical', 1, 1),
    ('quimica', 'materia-y-propiedades-ii', 'La materia y sus propiedades II', '', 'test-tube', 2, 2),
    ('quimica', 'escalas-de-temperatura', 'Escalas de temperatura', '', 'sun', 1, 3),
    ('quimica', 'mezclas-y-separacion', 'Mezclas y métodos de separación', '', 'filter', 1, 4),
    ('quimica', 'el-atomo', 'El átomo y sus características', '', 'atom', 1, 5),
    ('quimica', 'configuracion-electronica', 'Configuración electrónica', '', 'circle-dot', 1, 6),
    ('quimica', 'reacciones-y-ph', 'Tipos de reacciones y pH', '', 'test-tube', 1, 7),
    ('quimica', 'estequiometria-i', 'Estequiometría I', '', 'scale', 1, 8),
    ('quimica', 'estequiometria-ii', 'Estequiometría II', '', 'calculator', 2, 9),
    ('quimica', 'soluciones', 'Soluciones', '', 'flask-conical', 1, 10),
    ('quimica', 'gases-ideales', 'Gases ideales', '', 'gauge', 1, 11),
    ('quimica', 'quimica-organica', 'Química orgánica', '', 'route', 1, 12),
    ('fisica', 'analisis-dimensional-i', 'Análisis dimensional I', '', 'sliders-horizontal', 1, 1),
    ('fisica', 'analisis-dimensional-ii', 'Análisis dimensional II', '', 'compass', 2, 2),
    ('fisica', 'cinematica-i', 'Cinemática I', '', 'route', 1, 3),
    ('fisica', 'cinematica-ii', 'Cinemática II', '', 'rocket', 2, 4),
    ('fisica', 'dinamica-i', 'Dinámica I', '', 'target', 1, 5),
    ('fisica', 'dinamica-ii', 'Dinámica II', '', 'zap', 2, 6),
    ('fisica', 'movimiento-ondulatorio', 'Movimiento ondulatorio', '', 'chart-spline', 1, 7),
    ('fisica', 'fenomenos-ondulatorios', 'Fenómenos ondulatorios', '', 'sparkles', 1, 8),
    ('fisica', 'sonido-y-optica', 'Sonido y óptica', '', 'eye', 1, 9),
    ('fisica', 'electromagnetismo', 'Electromagnetismo', '', 'zap', 1, 10),
    ('fisica', 'termodinamica', 'Termodinámica', '', 'flame', 1, 11),
    ('fisica', 'colisiones-cantidad-movimiento', 'Colisiones y cantidad de movimiento', '', 'crosshair', 1, 12),
    ('sociales-y-ciudadanas', 'derechos-humanos', 'Derechos humanos', '', 'hand-heart', 1, 1),
    ('sociales-y-ciudadanas', 'constitucion-de-1991', 'Constitución de 1991', '', 'scroll', 1, 2),
    ('sociales-y-ciudadanas', 'mecanismos-de-participacion', 'Mecanismos de participación', '', 'users', 1, 3),
    ('sociales-y-ciudadanas', 'mecanismos-de-proteccion', 'Mecanismos de protección', '', 'shield', 1, 4),
    ('sociales-y-ciudadanas', 'prejuicios', 'Prejuicios', '', 'user-round', 1, 5),
    ('sociales-y-ciudadanas', 'modelos-economicos-i', 'Modelos económicos I', '', 'coins', 1, 6),
    ('sociales-y-ciudadanas', 'modelos-economicos-ii', 'Modelos económicos II', '', 'trending-up', 2, 7),
    ('historia', 'historia-del-mundo-i', 'Historia del mundo I', 'Edad Media, Imperio romano, el islam', 'landmark', 1, 1),
    ('historia', 'historia-del-mundo-ii', 'Historia del mundo II', 'Feudalismo, absolutismo, las cruzadas, Renacimiento, la Ilustración', 'landmark', 2, 2),
    ('historia', 'historia-del-mundo-iii', 'Historia del mundo III', 'Revolución francesa, revolución industrial, independencia de Estados Unidos, ideas ilustradas', 'flag', 2, 3),
    ('historia', 'historia-del-siglo-xx', 'Historia del siglo XX', 'Primera Guerra Mundial, revolución rusa, URSS, Guerra Fría, muro de Berlín', 'globe', 1, 4),
    ('historia', 'historia-de-latinoamerica-i', 'Historia de Latinoamérica I', '', 'map', 1, 5),
    ('historia', 'historia-de-latinoamerica-ii', 'Historia de Latinoamérica II', '', 'map-pin', 2, 6),
    ('historia', 'historia-de-colombia-i', 'Historia de Colombia I', '', 'flag', 1, 7),
    ('historia', 'historia-de-colombia-ii', 'Historia de Colombia II', '', 'history', 2, 8),
    ('historia', 'eventos-canonicos', 'Eventos canónicos', '', 'calendar-days', 1, 9),
    ('ingles', 'estructura-oracion-imperativo', 'Estructura de la oración y modo imperativo', '', 'pen-line', 1, 1),
    ('ingles', 'presente-simple-progresivo', 'Presente simple y progresivo', '', 'clock', 1, 2),
    ('ingles', 'pasado-simple-progresivo', 'Pasado simple y progresivo', '', 'history', 1, 3),
    ('ingles', 'futuro-comparativos-superlativos', 'Futuro, comparativos y superlativos', '', 'trending-up', 1, 4),
    ('ingles', 'modal-phrasal-verbs', 'Modal verbs y phrasal verbs', '', 'key', 1, 5),
    ('ingles', 'perfecto-preposiciones', 'Tiempo perfecto y preposiciones in, on, at', '', 'map-pin', 1, 6),
    ('ingles', 'wh-questions-conectores', 'Wh questions y conectores', '', 'circle-help', 1, 7),
    ('ingles', 'gerundio-infinitivo-adverbios', 'Gerundio e infinitivo y adverbios de tiempo', '', 'spell-check', 1, 8),
    ('ingles', 'adverbios-voz-pasiva', 'Adverbios y voz pasiva', '', 'whole-word', 1, 9)
  ) AS s (tema, slug, nombre, descripcion, icono, nivel, orden)
  JOIN temas t ON t.slug = s.tema
ON CONFLICT (slug) DO UPDATE SET
  tema_id = EXCLUDED.tema_id, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
  icono = EXCLUDED.icono, nivel_requerido = EXCLUDED.nivel_requerido, orden = EXCLUDED.orden, activo = TRUE;

-- Temas y subtemas de temarios anteriores: se conservan (con su historial) pero dejan de mostrarse.
UPDATE subtemas SET activo = (slug IN ('operaciones-basicas', 'porcentajes', 'ecuaciones-basicas', 'geometria-i', 'geometria-ii', 'plano-cartesiano', 'trigonometria-i', 'trigonometria-ii', 'funciones-i', 'funciones-ii', 'medidas-tendencia-central', 'tecnicas-de-conteo', 'como-analizar-un-texto', 'tipos-de-textos', 'taller-tipos-de-textos', 'figuras-literarias', 'la-argumentacion', 'falacias-argumentativas', 'mini-detalles-de-los-textos', 'ecosistemas', 'simbiosis', 'ciclos-biogeoquimicos', 'metodo-cientifico', 'evolucion-de-las-especies', 'organos-del-cuerpo-humano', 'ciencia-tecnologia-sociedad', 'medio-ambiente', 'celula-procariota-eucariota', 'organelos-de-la-celula', 'transporte-de-membrana', 'reproduccion-celular-i', 'reproduccion-celular-ii', 'metabolismo-celular', 'transcripcion-y-traduccion', 'genetica-mendeliana', 'materia-y-propiedades-i', 'materia-y-propiedades-ii', 'escalas-de-temperatura', 'mezclas-y-separacion', 'el-atomo', 'configuracion-electronica', 'reacciones-y-ph', 'estequiometria-i', 'estequiometria-ii', 'soluciones', 'gases-ideales', 'quimica-organica', 'analisis-dimensional-i', 'analisis-dimensional-ii', 'cinematica-i', 'cinematica-ii', 'dinamica-i', 'dinamica-ii', 'movimiento-ondulatorio', 'fenomenos-ondulatorios', 'sonido-y-optica', 'electromagnetismo', 'termodinamica', 'colisiones-cantidad-movimiento', 'derechos-humanos', 'constitucion-de-1991', 'mecanismos-de-participacion', 'mecanismos-de-proteccion', 'prejuicios', 'modelos-economicos-i', 'modelos-economicos-ii', 'historia-del-mundo-i', 'historia-del-mundo-ii', 'historia-del-mundo-iii', 'historia-del-siglo-xx', 'historia-de-latinoamerica-i', 'historia-de-latinoamerica-ii', 'historia-de-colombia-i', 'historia-de-colombia-ii', 'eventos-canonicos', 'estructura-oracion-imperativo', 'presente-simple-progresivo', 'pasado-simple-progresivo', 'futuro-comparativos-superlativos', 'modal-phrasal-verbs', 'perfecto-preposiciones', 'wh-questions-conectores', 'gerundio-infinitivo-adverbios', 'adverbios-voz-pasiva'));
UPDATE temas SET activo = (slug IN ('matematicas', 'lectura-critica', 'biologia-macro', 'biologia-micro', 'quimica', 'fisica', 'sociales-y-ciudadanas', 'historia', 'ingles'));
UPDATE preguntas SET activa = FALSE WHERE subtema_id IN (SELECT id FROM subtemas WHERE NOT activo);
UPDATE lecciones SET activa = FALSE WHERE subtema_id IN (SELECT id FROM subtemas WHERE NOT activo);

-- -----------------------------------------------------------------------------
-- Logros (criterios evaluados por backend/src/services/logros.service.js)
-- -----------------------------------------------------------------------------
INSERT INTO logros (codigo, nombre, descripcion, icono, categoria, criterio, meta, xp_recompensa, monedas_recompensa, insignia_id, secreto, orden)
SELECT l.codigo, l.nombre, l.descripcion, l.icono, l.categoria, l.criterio, l.meta, l.xp, l.monedas,
       (SELECT id FROM insignias WHERE codigo = l.insignia), l.secreto, l.orden
  FROM (VALUES
    ('primeros-pasos',   'Primeros pasos',             'Responde tu primera pregunta.',                          'footprints',      'progreso',   'respuestas_total',           1,    20,   5,   NULL,             FALSE, 1),
    ('aprendiz',         'Aprendiz',                   'Completa tu primera lección.',                           'book-open',       'progreso',   'lecciones_total',            1,    30,   10,  NULL,             FALSE, 2),
    ('primera-semana',   'Primera semana de estudio',  'Mantén una racha de 7 días.',                            'flame',           'constancia', 'racha',                      7,    100,  30,  NULL,             FALSE, 3),
    ('racha-30',         'Imparable',                  'Mantén una racha de 30 días.',                           'flame',           'constancia', 'racha',                      30,   300,  100, NULL,             FALSE, 4),
    ('racha-100',        'Leyenda de la constancia',   'Mantén una racha de 100 días.',                          'flame',           'constancia', 'racha',                      100,  1000, 300, NULL,             FALSE, 5),
    ('correctas-100',    '100 preguntas correctas',    'Acumula 100 respuestas correctas.',                      'target',          'precision',  'correctas_total',            100,  150,  40,  'centenario',     FALSE, 6),
    ('correctas-500',    'Máquina de aciertos',        'Acumula 500 respuestas correctas.',                      'zap',             'precision',  'correctas_total',            500,  500,  120, NULL,             FALSE, 7),
    ('primer-simulacro', 'Primer simulacro',           'Completa tu primer simulacro o minisimulacro.',          'clipboard-list',  'simulacros', 'simulacros_total',           1,    50,   15,  NULL,             FALSE, 8),
    ('simulacros-10',    '10 simulacros completados',  'Completa 10 simulacros o minisimulacros.',               'medal',           'simulacros', 'simulacros_total',           10,   300,  80,  'veterano',       FALSE, 9),
    ('puntaje-300',      'Barrera de los 300',         'Obtén 300 puntos o más en un simulacro completo.',       'trophy',          'simulacros', 'puntaje_simulacro_completo', 300,  200,  60,  NULL,             FALSE, 10),
    ('perfeccionista',   'Perfeccionista',             'Obtén el 100 % de aciertos en un minisimulacro.',        'gem',             'precision',  'mini_perfecto',              1,    150,  50,  'perfeccionista', FALSE, 11),
    ('retador',          'Retador',                    'Supera tu primer reto.',                                 'swords',          'simulacros', 'retos_superados',            1,    80,   20,  NULL,             FALSE, 12),
    ('todoterreno',      'Todoterreno',                'Responde preguntas de las 5 áreas.',                     'globe',           'progreso',   'materias_distintas',         5,    80,   20,  'todoterreno',    FALSE, 13),
    ('dominio-total',    'Dominio total',              'Domina un subtema (dominio de 80 % o más).',             'badge-check',     'progreso',   'subtemas_dominados',         1,    100,  30,  NULL,             FALSE, 14),
    ('dedicado',         'Estudiante dedicado',        'Completa 25 lecciones.',                                 'graduation-cap',  'progreso',   'lecciones_total',            25,   250,  60,  NULL,             FALSE, 15),
    ('nivel-experto',    'Nivel Experto',              'Alcanza el nivel 4: Experto.',                           'rocket',          'progreso',   'nivel',                      4,    0,    100, NULL,             FALSE, 16),
    ('conversador',      'Buen conversador',           'Envía 10 mensajes a Vanty.',                             'messages-square', 'social',     'mensajes_vanty',             10,   50,   15,  NULL,             FALSE, 18),
    ('estilo-propio',    'Estilo propio',              'Compra tu primer artículo en la tienda.',                'palette',         'especial',   'compras',                    1,    30,   0,   NULL,             FALSE, 19),
    ('madrugador',       'Madrugador',                 'Estudia antes de las 7:00 a. m.',                        'sunrise',         'especial',   'estudio_madrugada',          1,    40,   10,  'madrugador',     TRUE,  20),
    ('buho-nocturno',    'Búho nocturno',              'Estudia después de las 10:00 p. m.',                     'moon-star',       'especial',   'estudio_nocturno',           1,    40,   10,  'buho',           TRUE,  21),
    -- Temario 2026, simulacros y calendario
    ('calendario-listo', 'Fecha en la mira',           'Elige el calendario en el que presentarás el ICFES.',    'calendar-days',   'especial',   'calendario_elegido',         1,    20,   5,   NULL,             FALSE, 22),
    ('temas-5',          'Primeros temas',             'Completa 5 temas del temario (lección y dominio de 60 %).', 'book-open-check', 'progreso', 'temas_completados',          5,    80,   20,  NULL,             FALSE, 23),
    ('temas-25',         'Un tercio del temario',      'Completa 25 temas del temario.',                         'list-checks',     'progreso',   'temas_completados',          25,   250,  60,  NULL,             FALSE, 24),
    ('cinco-areas',      'Explorador de áreas',        'Completa al menos un tema en cada una de las 5 áreas.',  'compass',         'progreso',   'areas_con_tema',             5,    120,  30,  NULL,             FALSE, 25),
    ('area-completa',    'Área dominada',              'Completa todos los temas de un área.',                   'mountain',        'progreso',   'areas_completas',            1,    300,  80,  NULL,             FALSE, 26),
    ('temario-completo', 'Temario completo',           'Completa todos los temas del temario.',                  'graduation-cap',  'progreso',   'temario_porcentaje',         100,  800,  200, NULL,             FALSE, 27),
    ('lecciones-50',     'Lector incansable',          'Completa 50 lecciones.',                                 'book-open-text',  'progreso',   'lecciones_total',            50,   300,  70,  NULL,             FALSE, 28),
    ('primer-completo',  'Prueba de fuego',            'Termina tu primer simulacro completo (las dos sesiones).', 'flag',          'simulacros', 'simulacros_completos',       1,    150,  40,  NULL,             FALSE, 29),
    ('cinco-simulacros', 'Simulacros al día',          'Termina los 5 simulacros completos.',                    'clipboard-list',  'simulacros', 'simulacros_completos_distintos', 5, 500, 120, NULL,             FALSE, 30),
    ('camino-mini',      'Camino recorrido',           'Completa los 10 minisimulacros del camino.',             'route',           'simulacros', 'minis_distintos',            10,   300,  80,  NULL,             FALSE, 31),
    ('puntaje-400',      'Club de los 400',            'Obtén 400 puntos o más en un simulacro completo.',       'crown',           'simulacros', 'puntaje_simulacro_completo', 400,  400,  100, NULL,             FALSE, 32),
    ('retador-total',    'Retador total',              'Supera los 5 retos.',                                    'swords',          'simulacros', 'retos_distintos',            5,    300,  80,  NULL,             FALSE, 33),
    ('correctas-1000',   'Mil aciertos',               'Acumula 1000 respuestas correctas.',                     'target',          'precision',  'correctas_total',            1000, 700,  150, NULL,             FALSE, 34),
    ('punteria-fina',    'Puntería fina',              'Llega al 70 % de aciertos con 200 respuestas o más.',    'crosshair',       'precision',  'precision_200',              70,   200,  50,  NULL,             FALSE, 35),
    ('dias-30',          '30 días de estudio',         'Estudia 30 días distintos.',                             'calendar',        'constancia', 'dias_activos',               30,   200,  50,  NULL,             FALSE, 36),
    ('dias-100',         '100 días de estudio',        'Estudia 100 días distintos.',                            'sunrise',         'constancia', 'dias_activos',               100,  600,  150, NULL,             FALSE, 37),
    ('nivel-explorador', 'Nivel Explorador',           'Alcanza el nivel 2: Explorador.',                        'compass',         'progreso',   'nivel',                      2,    0,    20,  NULL,             FALSE, 38),
    ('nivel-avanzado',   'Nivel Avanzado',             'Alcanza el nivel 3: Avanzado.',                          'mountain',        'progreso',   'nivel',                      3,    0,    50,  NULL,             FALSE, 39)
  ) AS l (codigo, nombre, descripcion, icono, categoria, criterio, meta, xp, monedas, insignia, secreto, orden)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, categoria = EXCLUDED.categoria,
  criterio = EXCLUDED.criterio, meta = EXCLUDED.meta, xp_recompensa = EXCLUDED.xp_recompensa,
  monedas_recompensa = EXCLUDED.monedas_recompensa, insignia_id = EXCLUDED.insignia_id,
  secreto = EXCLUDED.secreto, orden = EXCLUDED.orden;

-- El logro del nivel Maestro se retira (quien lo desbloqueó lo conserva).
UPDATE logros SET activo = FALSE WHERE codigo = 'nivel-maestro' AND activo;

-- -----------------------------------------------------------------------------
-- Tienda de avatar (los artículos con precio 0 se entregan al registrarse)
-- -----------------------------------------------------------------------------
INSERT INTO items_tienda (codigo, categoria, nombre, descripcion, precio, nivel_requerido, datos, orden) VALUES
  ('color-lima',             'color',     'Lima',              'El verde de ICFES Lab.',                       0,   1, '{"hex":"#d5e068"}', 1),
  ('color-cielo',            'color',     'Cielo',             'Azul claro y tranquilo.',                      0,   1, '{"hex":"#81a1f6"}', 2),
  ('color-indigo',           'color',     'Índigo',            'Azul profundo y enfocado.',                    0,   1, '{"hex":"#6a70c9"}', 3),
  ('color-durazno',          'color',     'Durazno',           'Cálido como tu racha.',                        40,  1, '{"hex":"#fda879"}', 4),
  ('color-menta',            'color',     'Menta',             'Fresco para estudiar sin estrés.',             40,  1, '{"hex":"#7fd6b8"}', 5),
  ('color-lavanda',          'color',     'Lavanda',           'Suave y creativo.',                            60,  1, '{"hex":"#b9a3f5"}', 6),
  ('color-coral',            'color',     'Coral',             'Energía para los simulacros.',                 60,  1, '{"hex":"#ff8a80"}', 7),
  ('color-dorado',           'color',     'Dorado',            'Exclusivo para expertos.',                     250, 4, '{"hex":"#f2c14e"}', 8),
  ('color-galaxia',          'color',     'Galaxia',           'El color de los expertos.',                    400, 4, '{"hex":"#6c5ce7","hex2":"#81a1f6"}', 9),
  ('expresion-feliz',        'expresion', 'Feliz',             'Siempre con buena actitud.',                   0,   1, '{"forma":"feliz"}', 1),
  ('expresion-sonrisa',      'expresion', 'Sonriente',         'Una gran sonrisa.',                            0,   1, '{"forma":"sonrisa"}', 2),
  ('expresion-guino',        'expresion', 'Guiño',             'Tranquilo, lo tienes controlado.',             30,  1, '{"forma":"guino"}', 3),
  ('expresion-concentrado',  'expresion', 'Concentrado',       'Modo estudio activado.',                       40,  1, '{"forma":"concentrado"}', 4),
  ('expresion-asombro',      'expresion', 'Asombro',           '¡No lo puedo creer!',                          50,  1, '{"forma":"asombro"}', 5),
  ('expresion-estrella',     'expresion', 'Ojos de estrella',  'Deslumbrado por tu progreso.',                 120, 3, '{"forma":"estrella"}', 6),
  ('expresion-genio',        'expresion', 'Modo genio',        'Gafas de sol para mentes brillantes.',         200, 4, '{"forma":"genio"}', 7),
  ('accesorio-ninguno',      'accesorio', 'Sin accesorio',     'Estilo minimalista.',                          0,   1, '{"forma":"ninguno"}', 1),
  ('accesorio-lazo',         'accesorio', 'Moño',              'Elegante para el día del examen.',             50,  1, '{"forma":"lazo"}', 2),
  ('accesorio-gafas',        'accesorio', 'Gafas de estudio',  'Para leer hasta la letra pequeña.',            60,  1, '{"forma":"gafas"}', 3),
  ('accesorio-gorra',        'accesorio', 'Gorra',             'Estilo relajado.',                             70,  1, '{"forma":"gorra"}', 4),
  ('accesorio-antenas',      'accesorio', 'Antenas',           'Captan conocimiento a distancia.',             80,  1, '{"forma":"antenas"}', 5),
  ('accesorio-audifonos',    'accesorio', 'Audífonos',         'Tu lista de estudio favorita.',                90,  1, '{"forma":"audifonos"}', 6),
  ('accesorio-birrete',      'accesorio', 'Birrete de grado',  'Visualiza tu graduación.',                     150, 3, '{"forma":"birrete"}', 7),
  ('accesorio-corona',       'accesorio', 'Corona',            'Solo para expertos.',                          500, 4, '{"forma":"corona"}', 8),
  ('fondo-indigo',           'fondo',     'Índigo',            'El fondo clásico.',                            0,   1, '{"hex":"#484ea2"}', 1),
  ('fondo-cielo',            'fondo',     'Cielo',             'Claro como tus ideas.',                        0,   1, '{"hex":"#dfe8ff"}', 2),
  ('fondo-lima',             'fondo',     'Lima suave',        'Fresco y luminoso.',                           0,   1, '{"hex":"#f1f5c8"}', 3),
  ('fondo-atardecer',        'fondo',     'Atardecer',         'Tonos cálidos de fin de jornada.',             30,  1, '{"hex":"#ffe2d1","hex2":"#fda879","patron":"gradiente"}', 4),
  ('fondo-estrellas',        'fondo',     'Noche estrellada',  'Para las sesiones nocturnas.',                 120, 1, '{"hex":"#23264f","patron":"estrellas"}', 5),
  ('fondo-circuitos',        'fondo',     'Circuitos',         'Tecnología en cada neurona.',                  150, 2, '{"hex":"#1f3b4d","patron":"circuitos"}', 6),
  ('fondo-aurora',           'fondo',     'Aurora',            'Los colores de ICFES Lab en movimiento.',      220, 3, '{"hex":"#81a1f6","hex2":"#d5e068","patron":"gradiente"}', 7),
  ('fondo-dorado',           'fondo',     'Rayos dorados',     'Brilla como un experto.',                      350, 4, '{"hex":"#fff1c9","patron":"rayos"}', 8),
  ('protector-racha',        'protector', 'Protector de racha', 'Si un día no estudias, tu racha se mantiene. Máximo 3 a la vez.', 100, 1, '{}', 1)
ON CONFLICT (codigo) DO UPDATE SET
  categoria = EXCLUDED.categoria, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
  precio = EXCLUDED.precio, nivel_requerido = EXCLUDED.nivel_requerido, datos = EXCLUDED.datos, orden = EXCLUDED.orden;

-- -----------------------------------------------------------------------------
-- Recompensas especiales por racha
-- -----------------------------------------------------------------------------
INSERT INTO recompensas_racha (dias, nombre, xp, monedas, protectores, insignia_id)
SELECT r.dias, r.nombre, r.xp, r.monedas, r.protectores, (SELECT id FROM insignias WHERE codigo = r.insignia)
  FROM (VALUES
    (3,   'Chispa',                  30,   10,  0, NULL),
    (7,   'Semana de fuego',         70,   25,  1, 'racha-7'),
    (14,  'Dos semanas imparables',  150,  40,  1, NULL),
    (30,  'Mes de campeón',          300,  100, 2, 'racha-30'),
    (60,  'Constancia de acero',     500,  150, 2, NULL),
    (100, 'Llama eterna',            1000, 300, 3, 'racha-100')
  ) AS r (dias, nombre, xp, monedas, protectores, insignia)
ON CONFLICT (dias) DO UPDATE SET
  nombre = EXCLUDED.nombre, xp = EXCLUDED.xp, monedas = EXCLUDED.monedas,
  protectores = EXCLUDED.protectores, insignia_id = EXCLUDED.insignia_id;

-- -----------------------------------------------------------------------------
-- Simulacros completos: 5 simulacros del Saber 11, cada uno con 2 sesiones de 4 h 30 min:
--   Primera sesión (120): Lectura Crítica 41, Matemáticas 25, Sociales y Ciudadanas 25, Ciencias Naturales 29.
--   Segunda sesión (134): Matemáticas 25, Sociales y Ciudadanas 25, Ciencias Naturales 29, Inglés 55.
--   Total por simulacro: 254 preguntas (120 + 134; la solicitud decía 244, pero la distribución por área suma 254).
-- Si el banco tiene menos preguntas de un área, se usan todas las disponibles y el tiempo
-- se ajusta al ritmo real (~2 min/pregunta).
-- -----------------------------------------------------------------------------
INSERT INTO simulacros (tipo, numero, codigo, titulo, descripcion, icono, config, nivel_requerido, porcentaje_aprobacion, xp_recompensa, monedas_recompensa)
SELECT 'completo', n, 'simulacro-' || n, 'Simulacro ' || n,
       'Simulacro completo del Saber 11 (254 preguntas): primera sesión con Lectura Crítica (41), Matemáticas (25), Sociales y Ciudadanas (25) y Ciencias Naturales (29); segunda sesión con Matemáticas (25), Sociales y Ciudadanas (25), Ciencias Naturales (29) e Inglés (55).',
       'clipboard-list',
       jsonb_build_object(
         'seleccion', 'fija',
         'semilla', 1000 + n * 37,
         'dificultad', jsonb_build_array(1, 3),
         'sesiones', jsonb_build_array(
           jsonb_build_object('numero', 1, 'titulo', 'Primera sesión', 'duracion_min', 270,
             'preguntas', jsonb_build_object('lectura-critica', 41, 'matematicas', 25, 'sociales-ciudadanas', 25, 'ciencias-naturales', 29)),
           jsonb_build_object('numero', 2, 'titulo', 'Segunda sesión', 'duracion_min', 270,
             'preguntas', jsonb_build_object('matematicas', 25, 'sociales-ciudadanas', 25, 'ciencias-naturales', 29, 'ingles', 55))
         )),
       1, 0, 200, 50
  FROM generate_series(1, 5) AS n
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, config = EXCLUDED.config,
  xp_recompensa = EXCLUDED.xp_recompensa, monedas_recompensa = EXCLUDED.monedas_recompensa, activo = TRUE;

-- Los simulacros 6 a 10 de versiones anteriores se retiran; sus resultados se conservan.
UPDATE simulacros SET activo = FALSE WHERE tipo = 'completo' AND numero > 5 AND activo;

-- -----------------------------------------------------------------------------
-- Minisimulacros: camino de 10 etapas (20 a 30 preguntas, 30 minutos).
-- Cada etapa se desbloquea al completar la anterior.
-- -----------------------------------------------------------------------------
INSERT INTO simulacros (tipo, numero, codigo, titulo, descripcion, icono, config, nivel_requerido, porcentaje_aprobacion, xp_recompensa, monedas_recompensa)
SELECT 'mini', n, 'mini-' || n, 'Minisimulacro ' || n,
       CASE WHEN n <= 3 THEN 'Calentamiento: 20 preguntas de las cinco áreas con dificultad baja y media.'
            WHEN n <= 7 THEN 'Ritmo de examen: 25 preguntas mezcladas de todas las dificultades.'
            ELSE 'Recta final: 30 preguntas exigentes para llegar en tu mejor forma.' END,
       'timer',
       jsonb_build_object(
         'seleccion', 'adaptativa',
         'dificultad', CASE WHEN n <= 3 THEN jsonb_build_array(1, 2)
                            WHEN n <= 7 THEN jsonb_build_array(1, 3)
                            ELSE jsonb_build_array(2, 3) END,
         'sesiones', jsonb_build_array(
           jsonb_build_object('numero', 1, 'titulo', 'Minisimulacro ' || n, 'duracion_min', 30,
             'preguntas', jsonb_build_object(
               'matematicas', q, 'lectura-critica', q, 'ciencias-naturales', q, 'sociales-ciudadanas', q, 'ingles', q)))),
       1, 0, 60 + (n - 1) * 5, 15
  FROM generate_series(1, 10) AS n,
       LATERAL (SELECT CASE WHEN n <= 3 THEN 4 WHEN n <= 7 THEN 5 ELSE 6 END AS q) AS cantidad
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, config = EXCLUDED.config,
  xp_recompensa = EXCLUDED.xp_recompensa, monedas_recompensa = EXCLUDED.monedas_recompensa;

-- Encadena el camino: el minisimulacro n requiere el n-1.
UPDATE simulacros s
   SET requiere_simulacro_id = prev.id
  FROM simulacros prev
 WHERE s.tipo = 'mini' AND prev.tipo = 'mini' AND prev.numero = s.numero - 1;

-- -----------------------------------------------------------------------------
-- Retos: se desbloquean por nivel y dan recompensa solo si se supera el porcentaje.
-- En "preguntas", la clave "*" significa preguntas de cualquier área.
-- -----------------------------------------------------------------------------
INSERT INTO simulacros (tipo, numero, codigo, titulo, descripcion, icono, config, nivel_requerido, porcentaje_aprobacion, xp_recompensa, monedas_recompensa)
SELECT 'reto', r.numero, r.codigo, r.titulo, r.descripcion, r.icono,
       jsonb_build_object(
         'seleccion', r.seleccion,
         'dificultad', r.dificultad,
         'sesiones', jsonb_build_array(
           jsonb_build_object('numero', 1, 'titulo', r.titulo, 'duracion_min', r.minutos, 'preguntas', r.preguntas))),
       r.nivel, r.aprobacion, r.xp, r.monedas
  FROM (VALUES
    (1, 'reto-relampago',   'Relámpago',             '10 preguntas mixtas en 8 minutos. ¡Piensa rápido!',               'zap',       'aleatoria',     '[1,2]'::jsonb, 8,  '{"*":10}'::jsonb, 1, 60, 80,  20),
    (2, 'reto-punto-debil', 'Supera tu punto débil', '10 preguntas de tu área con menor rendimiento en 15 minutos.',    'target',    'materia_debil', '[1,3]'::jsonb, 15, '{"*":10}'::jsonb, 1, 60, 80,  20),
    (3, 'reto-precision',   'Precisión',             '12 preguntas en 15 minutos: necesitas el 80 % de aciertos.',       'crosshair', 'aleatoria',     '[1,3]'::jsonb, 15, '{"*":12}'::jsonb, 2, 80, 120, 30),
    (4, 'reto-maraton',     'Maratón mixta',         '20 preguntas de todas las áreas en 25 minutos.',                   'route',     'aleatoria',     '[1,3]'::jsonb, 25,
        '{"matematicas":4,"lectura-critica":4,"ciencias-naturales":4,"sociales-ciudadanas":4,"ingles":4}'::jsonb, 3, 70, 180, 45),
    (5, 'reto-experto',     'Desafío Experto',       '15 preguntas de dificultad alta en 20 minutos.',                   'rocket',    'aleatoria',     '[3,3]'::jsonb, 20, '{"*":15}'::jsonb, 4, 70, 250, 70)
  ) AS r (numero, codigo, titulo, descripcion, icono, seleccion, dificultad, minutos, preguntas, nivel, aprobacion, xp, monedas)
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, config = EXCLUDED.config,
  nivel_requerido = EXCLUDED.nivel_requerido, porcentaje_aprobacion = EXCLUDED.porcentaje_aprobacion,
  xp_recompensa = EXCLUDED.xp_recompensa, monedas_recompensa = EXCLUDED.monedas_recompensa;

-- El reto final del nivel Maestro se retira junto con ese nivel (sus resultados se conservan).
UPDATE simulacros SET activo = FALSE WHERE codigo = 'reto-maestro' AND activo;

-- -----------------------------------------------------------------------------
-- Configuración global (editable desde el panel de administración)
-- -----------------------------------------------------------------------------
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  -- Fechas OFICIALES de aplicación publicadas por el ICFES para cada calendario. Mientras el
  -- ICFES no las publique, "fechas" queda vacío y la plataforma lo informa sin inventar fechas.
  -- Se actualizan desde el panel de administración (cada fecha: {"fecha":"AAAA-MM-DD","descripcion":"…"}).
  -- Referencia: Calendario B 2026 se aplicó el 15 de marzo de 2026 y Calendario A 2026 el 26 de julio de 2026.
  ('calendarios_icfes',
   '{"A":{"convocatoria":"Saber 11 Calendario A 2027","meses":"entre finales de julio y agosto","fechas":[],"fuente":null},"B":{"convocatoria":"Saber 11 Calendario B 2027","meses":"en marzo","fechas":[],"fuente":null},"revisado":"2026-10-21"}',
   'Fechas oficiales del Saber 11 por calendario (A y B) publicadas por el ICFES.'),
  ('vanty',
   '{"limite_diario":80}',
   'Límite diario de mensajes a Vanty por estudiante.')
ON CONFLICT (clave) DO NOTHING;

COMMIT;
