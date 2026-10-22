# Formato del contenido académico de ICFES Lab

Este directorio contiene el contenido académico en JSON. El script `npm run db:seed`
lo carga en PostgreSQL y `npm run db:sql` genera `database/seed_contenido.sql`.

```
database/contenido/
├── preguntas/<materia>.json      Preguntas tipo ICFES del banco, organizadas por materia y tema
├── lecciones/<materia>.json      Lecciones: la explicación completa de cada tema (apuntes)
├── conocimiento/<materia>.json   Base de conocimiento de Vanty (modo local sin API)
├── anterior/                     Temario anterior (25 subtemas): se conserva, pero no se carga
└── PENDIENTES.md                 Lo que queda por revisar por un docente
```

Todos los archivos se guardan en **UTF-8 sin BOM**, con JSON estrictamente válido
(comillas dobles, sin comas finales, sin comentarios).

El contenido actual proviene del **temario 2026**, del **banco de preguntas** y de los **apuntes** de
ICFES Lab (octubre de 2026). No inventes explicaciones ni preguntas para completar un tema: si falta
material, anótalo en `PENDIENTES.md`.

---

## 1. Catálogo de materias y temas (slugs obligatorios)

Las 5 materias del Saber 11 siguen siendo `matematicas`, `lectura-critica`, `ciencias-naturales`,
`sociales-ciudadanas` e `ingles` (los simulacros y el puntaje se calculan por materia). Dentro de cada
una, los **bloques del temario** son los `temas` y cada **tema del temario** es un `subtema`: el campo
`subtema` de preguntas y lecciones usa los slugs de la tercera columna. Entre paréntesis va la
abreviatura de 3 letras que se usa en los códigos.

| Materia (prefijo) | Bloque del temario (`tema`) | Temas (`subtema` (abreviatura) · nombre · nivel requerido) |
|---|---|---|
| `matematicas` (MAT) | `matematicas` · Matemáticas | `operaciones-basicas` (OPB) · Operaciones básicas · 1, `porcentajes` (POR) · Porcentajes · 1, `ecuaciones-basicas` (ECU) · Ecuaciones básicas · 1, `geometria-i` (GE1) · Geometría I · 1, `geometria-ii` (GE2) · Geometría II · 2, `plano-cartesiano` (PLC) · Plano cartesiano · 1, `trigonometria-i` (TR1) · Trigonometría I · 1, `trigonometria-ii` (TR2) · Trigonometría II · 2, `funciones-i` (FU1) · Funciones I · 1, `funciones-ii` (FU2) · Funciones II · 2, `medidas-tendencia-central` (MTC) · Medidas de tendencia central · 1, `tecnicas-de-conteo` (TCO) · Técnicas de conteo · 1 |
| `lectura-critica` (LEC) | `lectura-critica` · Lectura Crítica | `como-analizar-un-texto` (ANT) · ¿Cómo analizar un texto? · 1, `tipos-de-textos` (TIP) · Tipos de textos e intenciones comunicativas · 1, `taller-tipos-de-textos` (TAL) · Taller de tipos de textos · 1, `figuras-literarias` (FIG) · Figuras literarias · 1, `la-argumentacion` (ARM) · La argumentación · 1, `falacias-argumentativas` (FAL) · Falacias argumentativas · 1, `mini-detalles-de-los-textos` (MIN) · Mini detalles de los textos · 1 |
| `ciencias-naturales` (CIE) | `biologia-macro` · Biología Macro | `ecosistemas` (ECO) · Ecosistemas · 1, `simbiosis` (SIM) · Simbiosis · 1, `ciclos-biogeoquimicos` (CIC) · Ciclos biogeoquímicos · 1, `metodo-cientifico` (MCI) · Método científico · 1, `evolucion-de-las-especies` (EVO) · Evolución de las especies · 1, `organos-del-cuerpo-humano` (ORG) · Órganos del cuerpo humano · 1, `ciencia-tecnologia-sociedad` (CTS) · Ciencia, tecnología y sociedad · 1, `medio-ambiente` (AMB) · Medio ambiente · 1 |
|  | `biologia-micro` · Biología Micro | `celula-procariota-eucariota` (CEL) · Célula procariota y eucariota · 1, `organelos-de-la-celula` (ORL) · Organelos de la célula · 1, `transporte-de-membrana` (TRM) · Transporte de membrana · 1, `reproduccion-celular-i` (RC1) · Reproducción celular I · 1, `reproduccion-celular-ii` (RC2) · Reproducción celular II · 2, `metabolismo-celular` (MTB) · Metabolismo celular · 1, `transcripcion-y-traduccion` (TRT) · Transcripción y traducción · 1, `genetica-mendeliana` (GEN) · Genética mendeliana · 1 |
|  | `quimica` · Química | `materia-y-propiedades-i` (MP1) · La materia y sus propiedades · 1, `materia-y-propiedades-ii` (MP2) · La materia y sus propiedades II · 2, `escalas-de-temperatura` (TEM) · Escalas de temperatura · 1, `mezclas-y-separacion` (MEZ) · Mezclas y métodos de separación · 1, `el-atomo` (ATO) · El átomo y sus características · 1, `configuracion-electronica` (CFE) · Configuración electrónica · 1, `reacciones-y-ph` (RPH) · Tipos de reacciones y pH · 1, `estequiometria-i` (ES1) · Estequiometría I · 1, `estequiometria-ii` (ES2) · Estequiometría II · 2, `soluciones` (SOL) · Soluciones · 1, `gases-ideales` (GAS) · Gases ideales · 1, `quimica-organica` (QOR) · Química orgánica · 1 |
|  | `fisica` · Física | `analisis-dimensional-i` (AD1) · Análisis dimensional I · 1, `analisis-dimensional-ii` (AD2) · Análisis dimensional II · 2, `cinematica-i` (CN1) · Cinemática I · 1, `cinematica-ii` (CN2) · Cinemática II · 2, `dinamica-i` (DN1) · Dinámica I · 1, `dinamica-ii` (DN2) · Dinámica II · 2, `movimiento-ondulatorio` (MON) · Movimiento ondulatorio · 1, `fenomenos-ondulatorios` (FON) · Fenómenos ondulatorios · 1, `sonido-y-optica` (SOP) · Sonido y óptica · 1, `electromagnetismo` (ELM) · Electromagnetismo · 1, `termodinamica` (TDN) · Termodinámica · 1, `colisiones-cantidad-movimiento` (COL) · Colisiones y cantidad de movimiento · 1 |
| `sociales-ciudadanas` (SOC) | `sociales-y-ciudadanas` · Sociales y Ciudadanas | `derechos-humanos` (DDH) · Derechos humanos · 1, `constitucion-de-1991` (C91) · Constitución de 1991 · 1, `mecanismos-de-participacion` (MPA) · Mecanismos de participación · 1, `mecanismos-de-proteccion` (MPR) · Mecanismos de protección · 1, `prejuicios` (PRE) · Prejuicios · 1, `modelos-economicos-i` (ME1) · Modelos económicos I · 1, `modelos-economicos-ii` (ME2) · Modelos económicos II · 2 |
|  | `historia` · Historia | `historia-del-mundo-i` (HM1) · Historia del mundo I · 1, `historia-del-mundo-ii` (HM2) · Historia del mundo II · 2, `historia-del-mundo-iii` (HM3) · Historia del mundo III · 2, `historia-del-siglo-xx` (HXX) · Historia del siglo XX · 1, `historia-de-latinoamerica-i` (HL1) · Historia de Latinoamérica I · 1, `historia-de-latinoamerica-ii` (HL2) · Historia de Latinoamérica II · 2, `historia-de-colombia-i` (HC1) · Historia de Colombia I · 1, `historia-de-colombia-ii` (HC2) · Historia de Colombia II · 2, `eventos-canonicos` (EVC) · Eventos canónicos · 1 |
| `ingles` (ING) | `ingles` · Inglés | `estructura-oracion-imperativo` (EST) · Estructura de la oración y modo imperativo · 1, `presente-simple-progresivo` (PRE) · Presente simple y progresivo · 1, `pasado-simple-progresivo` (PAS) · Pasado simple y progresivo · 1, `futuro-comparativos-superlativos` (FUT) · Futuro, comparativos y superlativos · 1, `modal-phrasal-verbs` (MOD) · Modal verbs y phrasal verbs · 1, `perfecto-preposiciones` (PER) · Tiempo perfecto y preposiciones in, on, at · 1, `wh-questions-conectores` (WHQ) · Wh questions y conectores · 1, `gerundio-infinitivo-adverbios` (GER) · Gerundio e infinitivo y adverbios de tiempo · 1, `adverbios-voz-pasiva` (ADV) · Adverbios y voz pasiva · 1 |

En total: 9 bloques y 84 temas. Los 14 temas de **nivel 2** son las continuaciones (II y III) y se
desbloquean con el nivel Explorador; todos los demás están disponibles desde el inicio.

Para cambiar el temario: edita el bloque de `temas` y `subtemas` de `database/seed.sql` (y su lista de
slugs activos), agrega las lecciones y preguntas en JSON y ejecuta `npm run db:setup`. Los temas que
salen del temario **no se borran**: quedan con `activo = FALSE` y conservan el historial de los
estudiantes.

### Competencias ICFES válidas por materia (campo `competencia`, opcional)

- **matematicas**: `Interpretación y representación`, `Formulación y ejecución`, `Argumentación`
- **lectura-critica**: `Identificar y entender los contenidos locales`,
  `Comprender cómo se articulan las partes de un texto`,
  `Reflexionar a partir de un texto y evaluar su contenido`
- **ciencias-naturales**: `Uso comprensivo del conocimiento científico`, `Explicación de fenómenos`, `Indagación`
- **sociales-ciudadanas**: `Pensamiento social`, `Interpretación y análisis de perspectivas`,
  `Pensamiento reflexivo y sistémico`
- **ingles**: `Parte 1 · Avisos`, `Parte 2 · Léxico`, `Parte 3 · Conversación`,
  `Parte 4 · Gramática en contexto`, `Parte 5 · Comprensión literal`,
  `Parte 6 · Comprensión inferencial`, `Parte 7 · Texto incompleto`

Las preguntas del banco 2026 no traen competencia (`null`); se puede asignar desde el panel de administración.

---

## 2. Preguntas — `preguntas/<materia>.json`

```json
{
  "materia": "matematicas",
  "contextos": {
    "MAT-CTX-01": {
      "titulo": "Tarifas de un parqueadero",
      "texto": "Texto compartido por varias preguntas. Admite saltos de línea con \\n.",
      "imagen": null,
      "imagen_alt": null,
      "fuente": "Banco de preguntas ICFES Lab"
    }
  },
  "preguntas": [
    {
      "codigo": "MAT-OPB-01",
      "subtema": "operaciones-basicas",
      "dificultad": 2,
      "competencia": null,
      "contexto_ref": null,
      "contexto": "Situación o texto propio de esta pregunta (o null).",
      "enunciado": "Pregunta concreta que se responde con una sola opción.",
      "imagen": null,
      "imagen_alt": null,
      "opciones": [
        { "letra": "A", "texto": "…", "correcta": false, "retroalimentacion": null },
        { "letra": "B", "texto": "…", "correcta": true,  "retroalimentacion": null },
        { "letra": "C", "texto": "…", "correcta": false, "retroalimentacion": null },
        { "letra": "D", "texto": "…", "correcta": false, "retroalimentacion": null }
      ],
      "explicacion": "",
      "tiempo_estimado_seg": 120,
      "etiquetas": []
    }
  ]
}
```

Reglas:

- `codigo`: único, formato `<MAT|LEC|CIE|SOC|ING>-<abreviatura del tema>-<nn>`. Ej.: `MAT-GE1-02`, `ING-MOD-01`.
- `subtema`: uno de los slugs de la tabla del punto 1. Cada pregunta pertenece a **un solo tema**; no se
  mezclan temas ni materias en un archivo distinto del suyo.
- `dificultad`: `1` baja, `2` media, `3` alta (el banco 2026 usa `2` mientras un docente la ajusta).
- **3 o 4 opciones** con letras en orden (`A`, `B`, `C` y, si hay cuarta, `D`) y **exactamente una**
  `"correcta": true`. Las 3 opciones solo se usan donde la prueba real lo hace (varias partes de Inglés).
- `retroalimentacion` por opción y `explicacion` son opcionales (`null` / `""`): el banco 2026 trae
  solo la respuesta correcta. Cuando existan, admiten **negritas** y saltos de línea `\n`.
- Contexto: usa `contexto_ref` (clave de `contextos`) cuando **dos o más** preguntas comparten el mismo
  texto; usa `contexto` (texto directo) cuando es propio de una sola pregunta; o `null` si no hay contexto.
  Nunca uses los dos a la vez.
- `imagen`: ruta pública `"/img/preguntas/<CODIGO>.svg"` (o `.png`) o `null`. Si hay imagen, `imagen_alt` es obligatorio.
  Las preguntas del banco que mencionan una figura, gráfica o tabla que no venía en el archivo están listadas en `PENDIENTES.md`.
- `tiempo_estimado_seg`: entre 45 y 240.
- Sin LaTeX: usa Unicode (×, ÷, √, ², ³, π, ≤, ≥, ≠, ½, →, °, Δ) y fracciones como `3/4`.
- Las preguntas de "selección múltiple con múltiple respuesta" del banco se expresan con opciones
  `Afirmaciones 1 y 2`, `Afirmaciones 2 y 3`, etc., para que tengan una sola opción correcta.

### Imágenes SVG (opcionales)

Archivo en `frontend/img/preguntas/<CODIGO>.svg`:

- `viewBox` aproximado de `0 0 480 300`, sin atributos `width`/`height` fijos (o `width="100%"`).
- Primer elemento: `<title>` descriptivo. Fondo `<rect width="100%" height="100%" fill="#ffffff"/>`.
- Trazos y texto en `#2b2f5e`; acentos con la paleta `#484ea2`, `#81a1f6`, `#d5e068`, `#fda879`.
- `font-family="Poppins, Arial, sans-serif"`, tamaño de fuente ≥ 14.
- Sin scripts, sin enlaces externos, sin `<image>` embebidas. Las medidas y los datos deben coincidir
  exactamente con el enunciado.

---

## 3. Lecciones — `lecciones/<materia>.json`

Una lección por tema (84 en total): es la **explicación completa** del tema tal como está en los
apuntes. En la página de la lección, después de la explicación se muestran las preguntas del banco de ese
tema (`GET /api/practica/subtema/:slug`), así que las lecciones no necesitan ejercicios incrustados.

```json
{
  "materia": "matematicas",
  "lecciones": [
    {
      "codigo": "MAT-OPB-L1",
      "subtema": "operaciones-basicas",
      "titulo": "Operaciones básicas",
      "resumen": "Primeras frases de la explicación (hasta 280 caracteres).",
      "duracion_min": 8,
      "bloques": [
        { "tipo": "texto", "contenido": "Párrafo explicativo. Admite **negritas** y saltos de línea \\n." },
        { "tipo": "subtitulo", "nivel": 2, "texto": "Sección de la explicación (nivel 2 o 3)" },
        { "tipo": "concepto", "titulo": "Idea clave", "contenido": "Definición o principio central." },
        { "tipo": "formula", "contenido": "a·x + b = c  →  x = (c − b) / a", "nota": "Opcional: cuándo se usa." },
        { "tipo": "ejemplo", "titulo": "Opcional", "enunciado": "Opcional", "contenido": "Desarrollo (opcional)", "pasos": ["Paso 1…", "Paso 2…"], "respuesta": "x = 4" },
        { "tipo": "lista", "titulo": "Opcional", "items": ["…", "…"], "ordenada": false },
        { "tipo": "tabla", "encabezado": ["Columna 1", "Columna 2"], "filas": [["…", "…"], ["…", "…"]] },
        { "tipo": "imagen", "src": "/img/lecciones/operaciones-basicas/01.png", "alt": "Descripción de la imagen", "pie": "Pie de imagen (opcional)" },
        { "tipo": "tip", "contenido": "Tip ICFES: estrategia concreta para el examen." },
        { "tipo": "alerta", "titulo": "Cuidado", "contenido": "Error frecuente o advertencia." },
        { "tipo": "ejercicio", "enunciado": "Pregunta corta de comprobación (opcional).", "opciones": ["…", "…", "…", "…"], "correcta": 2, "explicacion": "Por qué la opción correcta lo es." }
      ]
    }
  ]
}
```

Reglas:

- `codigo`: `<MAT|LEC|CIE|SOC|ING>-<abreviatura del tema>-L1`.
- Tipos de bloque: `texto`, `subtitulo`, `concepto`, `formula`, `ejemplo`, `lista`, `tabla`, `imagen`,
  `tip`, `alerta` y `ejercicio`. Todos los textos admiten **negritas**; las celdas de `tabla` y los
  `items` de `lista` también.
- `imagen.src` apunta a `frontend/img/lecciones/<subtema>/NN.png` (las imágenes de los apuntes).
- `ejercicio` es opcional: `opciones` son 4 textos y `correcta` el **índice 0–3** de la correcta.
- `duracion_min`: entre 5 y 60 (unas 170 palabras por minuto de lectura).
- El contenido debe corresponder a los apuntes del tema; si un tema no tiene apuntes, no se inventa
  la lección: se registra en `PENDIENTES.md`.

---

## 4. Base de conocimiento de Vanty — `conocimiento/<materia>.json`

Vanty la usa cuando no hay API de IA configurada para responder dudas académicas.

```json
{
  "materia": "matematicas",
  "entradas": [
    {
      "id": "mat-pitagoras",
      "subtema": "trigonometria-i",
      "titulo": "Teorema de Pitágoras",
      "palabras_clave": ["pitagoras", "pitágoras", "hipotenusa", "cateto", "triangulo rectangulo"],
      "explicacion": "Explicación clara en 3 a 6 frases.",
      "ejemplo": "Ejemplo breve y concreto.",
      "tip_icfes": "Consejo práctico para el examen."
    }
  ]
}
```

Reglas:

- 8 entradas por materia, cubriendo los conceptos más preguntados.
- `subtema`: slug del tema con el que se relaciona (sirve para el "tip" al explicar una pregunta de ese
  tema) o `null` si ningún tema del temario lo cubre.
- `palabras_clave`: 4 a 10 términos en minúscula, **incluyendo variantes con y sin tilde**, singular y
  plural cuando aplique (así Vanty los reconoce aunque el estudiante escriba sin tildes).
- `id`: único, en minúscula con guiones, prefijo de materia (`mat-`, `lec-`, `cie-`, `soc-`, `ing-`).
