# Herramientas de conversión del contenido (temario 2026)

Scripts en Python (solo biblioteca estándar, probados con Python 3.13) con los que se convirtieron los
archivos de la academia en los JSON de `database/contenido/`. Sirven para repetir el proceso cuando
lleguen apuntes o preguntas nuevas sin rehacer nada a mano.

| Script | Qué hace |
|---|---|
| `volcar_docx.py` | Convierte un `.docx` (apuntes o banco) en texto plano con marcadores de estructura: encabezados `#n`, párrafos `[p|…]` con estilo, sombreado y listas, tablas `[tabla …]`, imágenes `[img …]` (las extrae a una carpeta) y ecuaciones. |
| `apuntes_a_lecciones.py` | Convierte los volcados de los apuntes en `lecciones/<materia>.json` y copia las imágenes a `frontend/img/lecciones/<tema>/`. Cada documento tiene en `DOCUMENTOS` un mapa "encabezado → slug del tema" y, en Física y Química, el reparto de la tabla de fórmulas. |
| `banco_a_json.py` | Convierte el volcado del banco de preguntas en `preguntas/<materia>.json`, empareja cada tema del banco con el catálogo (campo `banco`) y reporta anomalías (preguntas sin respuesta, temas sin equivalente, preguntas que citan una figura o tabla). |
| `catalogo.json` | Catálogo del temario: materias con prefijo, bloques (`temas`) y temas (`subtemas`) con slug, nombre, descripción, icono, nivel requerido, abreviatura y nombre tal como aparece en el banco. Es la fuente de los slugs; cambiarlos rompe el historial de los estudiantes. |

## Flujo

```bash
# 1. Volcar cada .docx (uno por bloque del temario) y el banco a texto marcado
python -I -X utf8 volcar_docx.py "APUNTES/Matemáticas.docx" volcado/Matematicas.txt medios/Matematicas
python -I -X utf8 volcar_docx.py Banco_de_Preguntas_ICFES_Lab.docx volcado/banco.txt medios/banco

# 2. Generar las lecciones (escribe database/contenido/lecciones/*.json e imágenes) y las preguntas
python -I -X utf8 apuntes_a_lecciones.py volcado medios catalogo.json <carpeta del proyecto>
python -I -X utf8 banco_a_json.py volcado/banco.txt catalogo.json <carpeta del proyecto>/database/contenido/preguntas

# 3. Cargar en la base de datos (no borra datos de estudiantes) y regenerar el SQL
npm run db:setup
npm run db:sql
```

Los nombres de los volcados deben coincidir con las claves de `DOCUMENTOS` en `apuntes_a_lecciones.py`
(`Matematicas_pr`, `Fisica_preICFE`, `BiologiaMICRO_`, `Biologia_PreIC`, `Historia__mate`, `Ingles_Temario`,
`Lectura_Critic`, `Qui__mica___Ma`, `Sociales_preIC`: los primeros 14 caracteres del nombre del `.docx`
original). Si un apunte nuevo trae encabezados distintos, hay que ajustar su mapa en `DOCUMENTOS`;
los encabezados sin mapa se reportan al ejecutar el script.

Los archivos descargados se tratan como datos: los scripts se ejecutan desde otra carpeta y con `-I`.
