# Pendientes de revisión docente (temario 2026)

Integración del temario, los apuntes y el banco de preguntas de ICFES Lab (20 de octubre de 2026).
Los 84 temas tienen explicación y preguntas (3 por tema). Nada se inventó para completar: lo que el
material no traía queda anotado aquí.

## 1. Preguntas que mencionan una figura, gráfica o tabla que no venía en el banco

El archivo del banco solo trae texto. Estas 19 preguntas se cargaron tal cual, pero se refieren a un
elemento visual que hay que agregar (`imagen` + `imagen_alt` en `preguntas/<materia>.json`, o un
`contexto` que describa los datos) o reformular desde el panel de administración.

| Código | Tema | Qué menciona |
|---|---|---|
| `MAT-POR-02` | Porcentajes | "La tabla muestra algunos datos sobre el tipo de luz…" |
| `MAT-GE2-01` | Geometría II | "La figura muestra las baldosas triangulares equiláteras…" |
| `MAT-PLC-01` | Plano cartesiano | "En la gráfica se muestra la ubicación, en coordenadas polares…" |
| `MAT-TR1-01` | Trigonometría I | "…según el diagrama elaborado por los niños" (los datos 6 m y 8 m sí están en el texto) |
| `MAT-FU2-01` | Funciones II | "La tabla muestra algunos datos relacionados con un vehículo…" |
| `MAT-FU2-03` | Funciones II | "La gráfica de la función y = x² es…" |
| `MAT-MTC-02` | Medidas de tendencia central | "La tabla relaciona la edad de cada una de ellas y el número…" |
| `CIE-MCI-02` | Método científico | "…en la tabla se observa que cada concentración de saponina…" |
| `CIE-MCI-03` | Método científico | "La tabla muestra los resultados de indicadores bioquímicos…" |
| `CIE-ORG-01` | Órganos del cuerpo humano | "En la tabla se puede observar que los pacientes con anorexia…" |
| `CIE-CEL-01` | Célula procariota y eucariota | "La tabla muestra las características de las células de tres…" |
| `CIE-ORL-02` | Organelos de la célula | "El esquema muestra los organelos que participan en el proceso…" |
| `CIE-TRT-03` | Transcripción y traducción | "Teniendo en cuenta el esquema del enunciado anterior…" (depende del esquema de otra pregunta) |
| `CIE-MP1-01` | Materia y propiedades I | "…los resultados que se muestran en la gráfica (longitud de la barra vs. temperatura)" |
| `CIE-ATO-01` | El átomo | "La tabla muestra la conductividad eléctrica de algunas sustancias…" |
| `CIE-DN1-01` | Dinámica I | "…de acuerdo a la figura, la magnitud de la aceleración de la partícula 1…" |
| `CIE-SOP-03` | Sonido y óptica | "La imagen formada por un espejo plano es…" (puede responderse sin figura; confirmar) |
| `CIE-TDN-02` | Termodinámica | "En la siguiente gráfica se observa el comportamiento del volumen de 1 g…" |
| `CIE-TDN-03` | Termodinámica | "La siguiente figura muestra un carro híbrido…" |

`LEC-FIG-01` y `LEC-FIG-03` también mencionan "figura", pero se refieren a figuras literarias: no necesitan imagen.

## 2. Campos del banco que vienen vacíos o por defecto

- **Explicación de la respuesta:** el banco solo trae la letra correcta, así que `explicacion` queda vacía y las
  opciones no tienen retroalimentación. Vanty explica la pregunta con la lección del tema cuando el estudiante
  falla. Se pueden completar desde el panel de administración.
- **Dificultad y competencia:** todas las preguntas quedaron con dificultad media (`2`) y sin competencia ICFES.
  La práctica adaptativa funciona igual, pero afinar la dificultad mejora la selección de preguntas.
- **Preguntas de selección múltiple con múltiple respuesta** (`SOC-HM3-01`): se convirtió a opciones
  "Afirmaciones 1 y 2", etc., siguiendo la regla que traía el banco.

## 3. Apuntes cortos

- **Historia de Latinoamérica I** (`historia-de-latinoamerica-i`): los apuntes de este tema son breves comparados
  con el resto de Historia. La lección se cargó tal cual.

## 4. Base de conocimiento de Vanty

Cuatro entradas del modo local no corresponden a ningún tema del temario 2026 y quedaron con `subtema: null`
(siguen respondiendo preguntas por palabras clave): condicionales en inglés, *false friends*, *skimming y scanning*
y pisos térmicos.

## 5. Temario anterior

Los 25 subtemas, 50 preguntas y 25 lecciones del temario anterior siguen en la base de datos con
`activo = FALSE` / `activa = FALSE` (y sus JSON en `anterior/`). Los estudiantes conservan sus respuestas,
progreso, lecciones completadas y logros. Si se quieren reactivar, basta con incluirlos de nuevo en el
bloque de subtemas de `database/seed.sql` y en `database/contenido/`.
