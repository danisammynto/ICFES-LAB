-- =============================================================================
--  ICFES Lab · Datos iniciales del catálogo (idempotente: se puede re-ejecutar)
--  Contenido académico (preguntas y lecciones): database/contenido/*.json
--  → cargado con `npm run db:seed` o con database/seed_contenido.sql
-- =============================================================================

SET client_encoding = 'UTF8';

BEGIN;

-- -----------------------------------------------------------------------------
-- Niveles
-- -----------------------------------------------------------------------------
INSERT INTO niveles (numero, nombre, xp_minimo, descripcion, color, icono, recompensa_monedas, desbloqueos) VALUES
  (1, 'Principiante', 0,    'Das tus primeros pasos hacia el ICFES.', '#81a1f6', 'sprout', 0,
      '["Subtemas básicos de las 5 áreas", "Camino de minisimulacros y simulacros completos", "Retos Relámpago y Supera tu punto débil"]'),
  (2, 'Explorador',   400,  'Ya conoces el terreno: es hora de explorar temas nuevos.', '#a8bb2c', 'compass', 30,
      '["Subtemas: Probabilidad, Análisis de textos, Física, Economía y Context understanding", "Reto Precisión", "Insignia Explorador", "Fondo Circuitos en la tienda"]'),
  (3, 'Avanzado',     1500,  'Dominas lo esencial y vas por los temas más exigentes.', '#fda879', 'mountain', 60,
      '["Subtemas: Cálculo básico, Argumentación, Química, Política y Language use", "Reto Maratón mixta", "Insignia Avanzado", "Birrete de grado y Ojos de estrella"]'),
  (4, 'Experto',      4500, 'Piensas como un experto: precisión y estrategia.', '#484ea2', 'rocket', 100,
      '["Reto Desafío Experto", "Insignia Experto", "Color Dorado y Modo genio para tu avatar"]'),
  (5, 'Maestro ICFES', 10000, 'La cima: estás listo para brillar en el Saber 11.', '#e0a526', 'crown', 200,
      '["Reto final Maestro ICFES", "Insignia legendaria Maestro ICFES", "Corona y color Galaxia para tu avatar"]')
ON CONFLICT (numero) DO UPDATE SET
  nombre = EXCLUDED.nombre, xp_minimo = EXCLUDED.xp_minimo, descripcion = EXCLUDED.descripcion,
  color = EXCLUDED.color, icono = EXCLUDED.icono, recompensa_monedas = EXCLUDED.recompensa_monedas,
  desbloqueos = EXCLUDED.desbloqueos;

-- -----------------------------------------------------------------------------
-- Insignias
-- -----------------------------------------------------------------------------
INSERT INTO insignias (codigo, nombre, descripcion, icono, color, rareza, origen, precio_monedas, nivel_requerido, orden) VALUES
  -- Por nivel
  ('nivel-explorador', 'Explorador',        'Alcanzaste el nivel Explorador.',                  'compass',        '#a8bb2c', 'rara',       'nivel',  NULL, 1, 10),
  ('nivel-avanzado',   'Avanzado',          'Alcanzaste el nivel Avanzado.',                    'mountain',       '#fda879', 'rara',       'nivel',  NULL, 1, 11),
  ('nivel-experto',    'Experto',           'Alcanzaste el nivel Experto.',                     'rocket',         '#484ea2', 'epica',      'nivel',  NULL, 1, 12),
  ('nivel-maestro',    'Maestro ICFES',     'Llegaste a la cima: nivel Maestro ICFES.',         'crown',          '#e0a526', 'legendaria', 'nivel',  NULL, 1, 13),
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
  ('buho',             'Búho nocturno',     'Estudiaste después de las 10:00 p. m.',            'moon-star',      '#484ea2', 'comun',      'logro',  NULL, 1, 35),
  -- De tienda
  ('tienda-libro',     'Ratón de biblioteca', 'Para quienes nunca dejan de leer.',              'book-open',      '#81a1f6', 'comun',      'tienda', 80,   1, 40),
  ('tienda-rayo',      'Mente rápida',      'Respuestas veloces y certeras.',                   'zap',            '#d5e068', 'rara',       'tienda', 120,  1, 41),
  ('tienda-estrella',  'Estrella ICFES',    'Brillas en cada simulacro.',                       'star',           '#e0a526', 'rara',       'tienda', 180,  1, 42),
  ('tienda-cerebro',   'Cerebro galáctico', 'Tu capacidad de análisis no tiene límites.',       'brain',          '#b27af0', 'epica',      'tienda', 250,  2, 43),
  ('tienda-birrete',   'Futuro profesional', 'Ya te ves en la universidad.',                    'graduation-cap', '#484ea2', 'epica',      'tienda', 300,  2, 44),
  ('tienda-gema',      'Diamante académico', 'La insignia más valiosa de la tienda.',           'gem',            '#2fb3a0', 'legendaria', 'tienda', 450,  3, 45)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, color = EXCLUDED.color,
  rareza = EXCLUDED.rareza, origen = EXCLUDED.origen, precio_monedas = EXCLUDED.precio_monedas,
  nivel_requerido = EXCLUDED.nivel_requerido, orden = EXCLUDED.orden;

-- Insignia de cada nivel.
UPDATE niveles n SET insignia_id = i.id
  FROM insignias i
 WHERE i.codigo = CASE n.numero WHEN 2 THEN 'nivel-explorador' WHEN 3 THEN 'nivel-avanzado'
                                WHEN 4 THEN 'nivel-experto'    WHEN 5 THEN 'nivel-maestro' END;

-- -----------------------------------------------------------------------------
-- Materias, temas y subtemas
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
    ('matematicas',         'numerico-variacional',    'Pensamiento numérico y variacional', 'Números, álgebra y variación.',                        1),
    ('matematicas',         'espacial-metrico',        'Pensamiento espacial y métrico',     'Formas, medidas y el espacio.',                        2),
    ('matematicas',         'aleatorio',               'Pensamiento aleatorio',              'Datos, azar e incertidumbre.',                         3),
    ('lectura-critica',     'comprension-literal',     'Comprensión literal',                'Qué dice el texto.',                                   1),
    ('lectura-critica',     'comprension-inferencial', 'Comprensión inferencial',            'Lo que el texto sugiere sin decirlo.',                 2),
    ('lectura-critica',     'lectura-evaluativa',      'Reflexión y evaluación',             'Evaluar argumentos, estructura e intención.',          3),
    ('ciencias-naturales',  'entorno-vivo',            'Entorno vivo',                       'Los seres vivos y su relación con el ambiente.',       1),
    ('ciencias-naturales',  'entorno-fisico',          'Entorno físico y químico',           'Materia, energía y sus transformaciones.',             2),
    ('ciencias-naturales',  'indagacion',              'Indagación científica',              'Cómo se construye el conocimiento científico.',        3),
    ('sociales-ciudadanas', 'pensamiento-social',      'Pensamiento social',                 'Historia y territorio.',                               1),
    ('sociales-ciudadanas', 'poder-sociedad',          'Poder, economía y sociedad',         'Cómo se organizan el poder y la economía.',            2),
    ('sociales-ciudadanas', 'ciudadania-constitucion', 'Ciudadanía y Constitución',          'Derechos, deberes y participación.',                   3),
    ('ingles',              'reading-comprehension',   'Comprensión de lectura',             'Reading literal e inferencial.',                       1),
    ('ingles',              'language-structure',      'Estructura del idioma',              'Gramática y uso del idioma en contexto.',              2),
    ('ingles',              'lexicon',                 'Léxico',                             'Vocabulario, definiciones y avisos.',                  3)
  ) AS t (materia, slug, nombre, descripcion, orden)
  JOIN materias m ON m.slug = t.materia
ON CONFLICT (slug) DO UPDATE SET
  materia_id = EXCLUDED.materia_id, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

INSERT INTO subtemas (tema_id, slug, nombre, descripcion, icono, nivel_requerido, orden)
SELECT t.id, s.slug, s.nombre, s.descripcion, s.icono, s.nivel, s.orden
  FROM (VALUES
    ('numerico-variacional',    'algebra',               'Álgebra',               'Ecuaciones, proporciones, porcentajes y expresiones algebraicas.',   'sigma',           1, 1),
    ('numerico-variacional',    'calculo-basico',        'Cálculo básico',        'Tasas de cambio, pendientes y análisis de gráficas de funciones.',   'chart-spline',    3, 2),
    ('espacial-metrico',        'geometria',             'Geometría',             'Áreas, perímetros, volúmenes, semejanza y teorema de Pitágoras.',    'triangle',        1, 1),
    ('aleatorio',               'estadistica',           'Estadística',           'Medidas de tendencia central y lectura de tablas y gráficos.',       'chart-column',    1, 1),
    ('aleatorio',               'probabilidad',          'Probabilidad',          'Casos favorables, eventos, conteo y tablas de doble entrada.',      'dices',           2, 2),
    ('comprension-literal',     'comprension-textual',   'Comprensión textual',   'Información explícita y sentido de palabras y expresiones.',         'book-open',       1, 1),
    ('comprension-inferencial', 'inferencias',           'Inferencias',           'Deducir información implícita a partir del texto.',                  'lightbulb',       1, 1),
    ('comprension-inferencial', 'interpretacion',        'Interpretación',        'Sentido global, intención comunicativa y punto de vista.',           'eye',             1, 2),
    ('lectura-evaluativa',      'analisis-textos',       'Análisis de textos',    'Estructura, función de las partes y tipos de texto.',                'search',          2, 1),
    ('lectura-evaluativa',      'argumentacion',         'Argumentación',         'Tesis, argumentos, falacias y evaluación de posturas.',              'messages-square', 3, 2),
    ('entorno-vivo',            'biologia',              'Biología',              'Célula, genética, ecosistemas y fisiología.',                        'dna',             1, 1),
    ('entorno-vivo',            'medio-ambiente',        'Medio ambiente',        'Ciclos, contaminación, biodiversidad y cambio climático.',           'leaf',            1, 2),
    ('entorno-fisico',          'fisica',                'Física',                'Movimiento, fuerzas, energía, circuitos y ondas.',                   'atom',            2, 1),
    ('entorno-fisico',          'quimica',               'Química',               'Materia, enlaces, reacciones, pH y soluciones.',                     'test-tube',       3, 2),
    ('indagacion',              'metodo-cientifico',     'Método científico',     'Variables, hipótesis, diseño experimental y conclusiones.',          'microscope',      1, 1),
    ('pensamiento-social',      'historia',              'Historia',              'Procesos históricos de Colombia y el mundo.',                        'scroll',          1, 1),
    ('pensamiento-social',      'geografia',             'Geografía',             'Regiones, recursos y relación sociedad–territorio.',                 'map',             1, 2),
    ('poder-sociedad',          'economia',              'Economía',              'Oferta, demanda, inflación, impuestos y empleo.',                    'coins',           2, 1),
    ('poder-sociedad',          'politica',              'Política',              'Ramas del poder, Estado social de derecho y conflictos.',            'scale',           3, 2),
    ('ciudadania-constitucion', 'ciudadania',            'Ciudadanía',            'Constitución de 1991, derechos y mecanismos de participación.',      'users',           1, 1),
    ('reading-comprehension',   'reading',               'Reading',               'Comprensión literal e inferencial de textos en inglés.',             'book-open-check', 1, 1),
    ('reading-comprehension',   'context-understanding', 'Context understanding', 'Entender conversaciones y situaciones comunicativas.',               'message-circle',  2, 2),
    ('language-structure',      'grammar',               'Grammar',               'Tiempos verbales, estructuras y concordancia.',                      'spell-check',     1, 1),
    ('language-structure',      'language-use',          'Language use',          'Completar textos con la palabra adecuada (cloze).',                  'pen-line',        3, 2),
    ('lexicon',                 'vocabulary',            'Vocabulary',            'Vocabulario frecuente, avisos y definiciones.',                      'whole-word',      1, 1)
  ) AS s (tema, slug, nombre, descripcion, icono, nivel, orden)
  JOIN temas t ON t.slug = s.tema
ON CONFLICT (slug) DO UPDATE SET
  tema_id = EXCLUDED.tema_id, nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion,
  icono = EXCLUDED.icono, nivel_requerido = EXCLUDED.nivel_requerido, orden = EXCLUDED.orden;

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
    ('nivel-maestro',    'Maestro ICFES',              'Alcanza el nivel 5: Maestro ICFES.',                     'crown',           'progreso',   'nivel',                      5,    0,    200, NULL,             FALSE, 17),
    ('conversador',      'Buen conversador',           'Envía 10 mensajes a Vanty.',                             'messages-square', 'social',     'mensajes_vanty',             10,   50,   15,  NULL,             FALSE, 18),
    ('estilo-propio',    'Estilo propio',              'Compra tu primer artículo en la tienda.',                'palette',         'especial',   'compras',                    1,    30,   0,   NULL,             FALSE, 19),
    ('madrugador',       'Madrugador',                 'Estudia antes de las 7:00 a. m.',                        'sunrise',         'especial',   'estudio_madrugada',          1,    40,   10,  'madrugador',     TRUE,  20),
    ('buho-nocturno',    'Búho nocturno',              'Estudia después de las 10:00 p. m.',                     'moon-star',       'especial',   'estudio_nocturno',           1,    40,   10,  'buho',           TRUE,  21)
  ) AS l (codigo, nombre, descripcion, icono, categoria, criterio, meta, xp, monedas, insignia, secreto, orden)
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, categoria = EXCLUDED.categoria,
  criterio = EXCLUDED.criterio, meta = EXCLUDED.meta, xp_recompensa = EXCLUDED.xp_recompensa,
  monedas_recompensa = EXCLUDED.monedas_recompensa, insignia_id = EXCLUDED.insignia_id,
  secreto = EXCLUDED.secreto, orden = EXCLUDED.orden;

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
  ('color-galaxia',          'color',     'Galaxia',           'El color de los Maestros ICFES.',              400, 5, '{"hex":"#6c5ce7","hex2":"#81a1f6"}', 9),
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
  ('accesorio-corona',       'accesorio', 'Corona',            'Solo para Maestros ICFES.',                    500, 5, '{"forma":"corona"}', 8),
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
-- Simulacros completos: estructura real del Saber 11 (2 sesiones de 4 h 30 min).
-- Si el banco tiene menos preguntas, el tiempo se ajusta al ritmo real (~2 min/pregunta).
-- -----------------------------------------------------------------------------
INSERT INTO simulacros (tipo, numero, codigo, titulo, descripcion, icono, config, nivel_requerido, porcentaje_aprobacion, xp_recompensa, monedas_recompensa)
SELECT 'completo', n, 'simulacro-' || n, 'Simulacro ' || n,
       'Simulacro completo con la estructura del Saber 11: dos sesiones cronometradas con preguntas mezcladas de las cinco áreas.',
       'clipboard-list',
       jsonb_build_object(
         'seleccion', 'fija',
         'semilla', 1000 + n * 37,
         'dificultad', jsonb_build_array(1, 3),
         'sesiones', jsonb_build_array(
           jsonb_build_object('numero', 1, 'titulo', 'Sesión 1', 'duracion_min', 270,
             'preguntas', jsonb_build_object('lectura-critica', 41, 'matematicas', 25, 'sociales-ciudadanas', 25, 'ciencias-naturales', 29)),
           jsonb_build_object('numero', 2, 'titulo', 'Sesión 2', 'duracion_min', 270,
             'preguntas', jsonb_build_object('matematicas', 25, 'ciencias-naturales', 29, 'sociales-ciudadanas', 25, 'ingles', 55))
         )),
       1, 0, 200, 50
  FROM generate_series(1, 10) AS n
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, config = EXCLUDED.config,
  xp_recompensa = EXCLUDED.xp_recompensa, monedas_recompensa = EXCLUDED.monedas_recompensa;

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
    (5, 'reto-experto',     'Desafío Experto',       '15 preguntas de dificultad alta en 20 minutos.',                   'rocket',    'aleatoria',     '[3,3]'::jsonb, 20, '{"*":15}'::jsonb, 4, 70, 250, 70),
    (6, 'reto-maestro',     'Maestro ICFES',         '25 preguntas exigentes en 30 minutos. El reto final.',             'crown',     'aleatoria',     '[2,3]'::jsonb, 30,
        '{"matematicas":5,"lectura-critica":5,"ciencias-naturales":5,"sociales-ciudadanas":5,"ingles":5}'::jsonb, 5, 80, 400, 120)
  ) AS r (numero, codigo, titulo, descripcion, icono, seleccion, dificultad, minutos, preguntas, nivel, aprobacion, xp, monedas)
ON CONFLICT (codigo) DO UPDATE SET
  titulo = EXCLUDED.titulo, descripcion = EXCLUDED.descripcion, icono = EXCLUDED.icono, config = EXCLUDED.config,
  nivel_requerido = EXCLUDED.nivel_requerido, porcentaje_aprobacion = EXCLUDED.porcentaje_aprobacion,
  xp_recompensa = EXCLUDED.xp_recompensa, monedas_recompensa = EXCLUDED.monedas_recompensa;

-- -----------------------------------------------------------------------------
-- Configuración global (editable desde el panel de administración)
-- -----------------------------------------------------------------------------
INSERT INTO configuracion (clave, valor, descripcion) VALUES
  ('fecha_icfes',
   '{"fecha":"2027-08-08","nombre":"Saber 11 · Calendario A 2027","estimada":true}',
   'Fecha global del próximo examen. Cada estudiante puede definir la suya en Configuración.'),
  ('vanty',
   '{"limite_diario":80}',
   'Límite diario de mensajes a Vanty por estudiante.')
ON CONFLICT (clave) DO NOTHING;

COMMIT;
