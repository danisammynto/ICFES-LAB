# Formato del contenido académico de ICFES Lab

Este directorio contiene el contenido académico en JSON. El script `npm run db:seed`
lo carga en PostgreSQL y `npm run db:sql` genera `database/seed_contenido.sql`.

```
database/contenido/
├── preguntas/<materia>.json      Preguntas tipo ICFES (banco)
├── lecciones/<materia>.json      Lecciones por subtema (teoría + ejercicios)
└── conocimiento/<materia>.json   Base de conocimiento de Vanty (modo local sin API)
```

Todos los archivos se guardan en **UTF-8 sin BOM**, con JSON estrictamente válido
(comillas dobles, sin comas finales, sin comentarios).

---

## 1. Catálogo de materias y subtemas (slugs obligatorios)

| Materia (slug)        | Tema (slug) → subtemas (slug · nombre · nivel requerido)                          |
|-----------------------|------------------------------------------------------------------------------------|
| `matematicas`         | `numerico-variacional` → `algebra` · Álgebra · 1, `calculo-basico` · Cálculo básico · 3 |
|                       | `espacial-metrico` → `geometria` · Geometría · 1                                   |
|                       | `aleatorio` → `estadistica` · Estadística · 1, `probabilidad` · Probabilidad · 2    |
| `lectura-critica`     | `comprension-literal` → `comprension-textual` · Comprensión textual · 1             |
|                       | `comprension-inferencial` → `inferencias` · Inferencias · 1, `interpretacion` · Interpretación · 1 |
|                       | `lectura-evaluativa` → `analisis-textos` · Análisis de textos · 2, `argumentacion` · Argumentación · 3 |
| `ciencias-naturales`  | `entorno-vivo` → `biologia` · Biología · 1, `medio-ambiente` · Medio ambiente · 1   |
|                       | `entorno-fisico` → `fisica` · Física · 2, `quimica` · Química · 3                   |
|                       | `indagacion` → `metodo-cientifico` · Método científico · 1                          |
| `sociales-ciudadanas` | `pensamiento-social` → `historia` · Historia · 1, `geografia` · Geografía · 1       |
|                       | `poder-sociedad` → `economia` · Economía · 2, `politica` · Política · 3             |
|                       | `ciudadania-constitucion` → `ciudadania` · Ciudadanía · 1                           |
| `ingles`              | `reading-comprehension` → `reading` · Reading · 1, `context-understanding` · Context understanding · 2 |
|                       | `language-structure` → `grammar` · Grammar · 1, `language-use` · Language use · 3   |
|                       | `lexicon` → `vocabulary` · Vocabulary · 1                                           |

### Competencias ICFES válidas por materia (campo `competencia`)

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
      "fuente": "Texto original elaborado para ICFES Lab"
    }
  },
  "preguntas": [
    {
      "codigo": "MAT-ALG-01",
      "subtema": "algebra",
      "dificultad": 2,
      "competencia": "Formulación y ejecución",
      "contexto_ref": "MAT-CTX-01",
      "contexto": null,
      "enunciado": "Pregunta concreta que se responde con una sola opción.",
      "imagen": null,
      "imagen_alt": null,
      "opciones": [
        { "letra": "A", "texto": "…", "correcta": false, "retroalimentacion": "Por qué no es correcta (error típico que lleva a elegirla)." },
        { "letra": "B", "texto": "…", "correcta": true,  "retroalimentacion": "Por qué es la respuesta correcta." },
        { "letra": "C", "texto": "…", "correcta": false, "retroalimentacion": "…" },
        { "letra": "D", "texto": "…", "correcta": false, "retroalimentacion": "…" }
      ],
      "explicacion": "Explicación detallada paso a paso (3 a 8 frases). Admite **negritas** y saltos de línea \\n.",
      "tiempo_estimado_seg": 120,
      "etiquetas": ["ecuaciones lineales", "despeje"]
    }
  ]
}
```

Reglas:

- `codigo`: único, formato `<MAT|LEC|CIE|SOC|ING>-<3 letras del subtema>-<nn>`. Ej.: `MAT-GEO-02`, `ING-VOC-01`.
- `dificultad`: `1` baja, `2` media, `3` alta. Por materia: 3 de nivel 1, 4 de nivel 2, 3 de nivel 3.
- **Exactamente 4 opciones** con letras `A`, `B`, `C`, `D` en ese orden y **exactamente una** `"correcta": true`.
  Reparte la letra correcta entre A, B, C y D (no siempre la misma).
- Contexto: usa `contexto_ref` (clave de `contextos`) cuando **dos o más** preguntas comparten el mismo
  texto; usa `contexto` (texto directo) cuando es propio de una sola pregunta; o `null` si no hay contexto.
  Nunca uses los dos a la vez.
- `imagen`: ruta pública `"/img/preguntas/<CODIGO>.svg"` o `null`. Si hay imagen, `imagen_alt` es obligatorio.
- `tiempo_estimado_seg`: entre 45 y 240.
- Sin LaTeX: usa Unicode (×, ÷, √, ², ³, π, ≤, ≥, ≠, ½, →, °, Δ) y fracciones como `3/4`.
- Contenido **100 % original** (no copies preguntas reales del ICFES ni de libros). Contexto colombiano cuando
  aplique (nombres, ciudades, pesos colombianos `$12.500`, instituciones).
- Las opciones incorrectas deben ser plausibles y corresponder a errores típicos reales.

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

Una lección por subtema (5 por materia).

```json
{
  "materia": "matematicas",
  "lecciones": [
    {
      "codigo": "MAT-ALG-L1",
      "subtema": "algebra",
      "titulo": "Ecuaciones lineales sin miedo",
      "resumen": "Una frase que describe lo que el estudiante aprenderá.",
      "duracion_min": 8,
      "bloques": [
        { "tipo": "texto", "contenido": "Párrafo explicativo. Admite **negritas**." },
        { "tipo": "concepto", "titulo": "Idea clave", "contenido": "Definición o principio central." },
        { "tipo": "formula", "contenido": "a·x + b = c  →  x = (c − b) / a", "nota": "Opcional: cuándo se usa." },
        { "tipo": "ejemplo", "titulo": "Ejemplo resuelto", "enunciado": "…", "pasos": ["Paso 1…", "Paso 2…"], "respuesta": "x = 4" },
        { "tipo": "lista", "titulo": "Errores frecuentes", "items": ["…", "…"] },
        { "tipo": "tip", "contenido": "Tip ICFES: estrategia concreta para el examen." },
        { "tipo": "ejercicio", "enunciado": "Pregunta corta de comprobación.", "opciones": ["…", "…", "…", "…"], "correcta": 2, "explicacion": "Por qué la opción correcta lo es." }
      ]
    }
  ]
}
```

Reglas:

- `codigo`: `<MAT|LEC|CIE|SOC|ING>-<3 letras del subtema>-L1`.
- Entre 7 y 11 bloques por lección. Obligatorio: al menos 1 `concepto`, 1 `ejemplo`, 1 `tip` y **2 `ejercicio`**.
- `ejercicio.opciones`: exactamente 4 textos; `correcta` es el **índice 0–3** de la opción correcta.
- `formula` es opcional en materias no numéricas.
- `duracion_min`: entre 5 y 15.
- Tono cercano, motivador y claro para estudiantes de grado 10.º y 11.º en Colombia.

---

## 4. Base de conocimiento de Vanty — `conocimiento/<materia>.json`

Vanty la usa cuando no hay API de IA configurada para responder dudas académicas.

```json
{
  "materia": "matematicas",
  "entradas": [
    {
      "id": "mat-pitagoras",
      "subtema": "geometria",
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

- 8 entradas por materia, cubriendo los conceptos más preguntados de sus 5 subtemas.
- `palabras_clave`: 4 a 10 términos en minúscula, **incluyendo variantes con y sin tilde**, singular y
  plural cuando aplique (así Vanty los reconoce aunque el estudiante escriba sin tildes).
- `id`: único, en minúscula con guiones, prefijo de materia (`mat-`, `lec-`, `cie-`, `soc-`, `ing-`).
