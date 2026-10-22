"""Convierte el volcado del banco de preguntas (banco.txt) en los JSON de preguntas de ICFES Lab.

Estructura esperada del volcado:
  #1 **Materia**            → bloque del temario (Biología Macro, Matemáticas…)
  #2 **Tema**               → subtema del catálogo (se empareja por el campo "banco")
  [p] **N. **enunciado      → inicio de pregunta (los párrafos siguientes hasta las opciones
                              forman el contexto; el último es el enunciado)
  [p] A. … / B. … / C. … / D. …
  [p] **Respuesta correcta: X. …**

Uso: python -I banco_a_json.py <banco.txt> <catalogo.json> <carpeta_salida>
Escribe <carpeta_salida>/<materia>.json y un informe de anomalías en la salida estándar.
"""
import json
import os
import re
import sys
import unicodedata

entrada, ruta_catalogo, salida = sys.argv[1:4]
catalogo = json.load(open(ruta_catalogo, encoding='utf-8'))
TEMAS = {t['slug']: t for t in catalogo['temas']}


def normalizar(texto):
    t = unicodedata.normalize('NFD', texto)
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    t = t.lower().replace('**', '')
    t = re.sub(r'[^a-z0-9 ]+', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def limpiar(texto):
    t = texto.replace('**', '').replace(' ⏎ ', '\n').strip()
    return re.sub(r'[ \t]+', ' ', t)


por_banco = {normalizar(s['banco']): s for s in catalogo['subtemas']}
# Alias por si el banco escribe el tema con pequeñas diferencias.
por_banco[normalizar('Modal verbs and phrasal verbs')] = por_banco[normalizar('Modal verbs y phrasal verbs')]

lineas = open(entrada, encoding='utf-8').read().split('\n')
RE_TEMA = re.compile(r'^#2 (.+)$')
RE_PREGUNTA = re.compile(r'^\[p[^\]]*\] \*\*(\d+)\. ?\*\*\s*(.*)$')
RE_OPCION = re.compile(r'^\[p[^\]]*\] ([A-D])[.)]\s+(.*)$')
RE_RESPUESTA = re.compile(r'^\[p[^\]]*\] \*\*Respuesta correcta:\s*(?:opci[oó]n\s*)?([A-D])\.?\s*(.*?)\*\*\s*$')
RE_PARRAFO = re.compile(r'^\[p[^\]]*\] (.*)$')

anomalias = []
preguntas = []  # dicts con subtema, numero, parrafos, opciones, correcta, texto_respuesta
subtema_actual = None
actual = None


def cerrar():
    global actual
    if actual is not None:
        preguntas.append(actual)
    actual = None


for n, linea in enumerate(lineas, 1):
    if linea.startswith('#1 '):
        cerrar()
        continue
    m = RE_TEMA.match(linea)
    if m:
        cerrar()
        clave = normalizar(m.group(1))
        # "Historia del mundo I : Edad media…" → se empareja por la parte anterior a los dos puntos.
        subtema_actual = por_banco.get(clave) or por_banco.get(normalizar(m.group(1).split(':')[0]))
        if not subtema_actual:
            anomalias.append(f'línea {n}: tema del banco sin equivalente en el catálogo: {m.group(1)}')
        continue
    m = RE_PREGUNTA.match(linea)
    if m:
        cerrar()
        actual = {'subtema': subtema_actual, 'numero': int(m.group(1)), 'linea': n, 'parrafos': [limpiar(m.group(2))], 'opciones': [], 'correcta': None, 'texto_respuesta': ''}
        continue
    if actual is None:
        if linea.strip() and not linea.startswith('[p|centro]') and not linea.startswith('[p|bdr centro]'):
            anomalias.append(f'línea {n}: texto fuera de una pregunta: {linea[:80]}')
        continue
    m = RE_RESPUESTA.match(linea)
    if m:
        actual['correcta'] = m.group(1)
        actual['texto_respuesta'] = limpiar(m.group(2))
        cerrar()
        continue
    m = RE_OPCION.match(linea)
    if m and not actual['correcta']:
        actual['opciones'].append((m.group(1), limpiar(m.group(2))))
        continue
    m = RE_PARRAFO.match(linea)
    if m:
        if actual['opciones']:
            anomalias.append(f'línea {n}: párrafo después de las opciones (pregunta {actual["numero"]}): {m.group(1)[:80]}')
        else:
            actual['parrafos'].append(limpiar(m.group(1)))
cerrar()

# Construcción de los JSON por materia.
salidas = {m: {'materia': m, 'contextos': {}, 'preguntas': []} for m in catalogo['materias']}
contador = {}
for p in preguntas:
    s = p['subtema']
    if not s:
        anomalias.append(f'línea {p["linea"]}: pregunta sin subtema asignado')
        continue
    # Preguntas de "selección múltiple con múltiple respuesta" (afirmaciones 1–4 y una regla
    # "si 1 y 2 son correctas, marque A…"): se convierten en opciones A–D con las parejas.
    if not p['opciones']:
        instruccion = next((x for x in p['parrafos'] if re.search(r'marque [A-D]', x)), None)
        parejas = re.findall(r'si (\d) y (\d)(?: son correctas)?,? marque ([A-D])', instruccion or '', re.I)
        afirmaciones = [x for x in p['parrafos'] if re.match(r'^\d\. ', x)]
        if instruccion and len(parejas) == 4 and len(afirmaciones) == 4:
            p['opciones'] = [(letra, f'Afirmaciones {a} y {b}') for a, b, letra in sorted(parejas, key=lambda x: x[2])]
            p['parrafos'] = [x for x in p['parrafos'] if x not in afirmaciones and x != instruccion] + ['\n'.join(afirmaciones), 'Solo dos de las afirmaciones anteriores son correctas. ¿Cuáles son?']
    letras = [o[0] for o in p['opciones']]
    # La prueba de Inglés usa 3 opciones (A–C) en varias partes; el resto tiene 4 (A–D).
    if letras not in (['A', 'B', 'C', 'D'], ['A', 'B', 'C']):
        anomalias.append(f'línea {p["linea"]}: la pregunta {p["numero"]} de {s["nombre"]} tiene opciones {letras}')
        continue
    if not p['correcta']:
        anomalias.append(f'línea {p["linea"]}: la pregunta {p["numero"]} de {s["nombre"]} no tiene respuesta correcta')
        continue
    materia = TEMAS[s['tema']]['materia']
    prefijo = catalogo['materias'][materia]['prefijo']
    contador[s['slug']] = contador.get(s['slug'], 0) + 1
    codigo = f"{prefijo}-{s['abr']}-{contador[s['slug']]:02d}"
    parrafos = [x for x in p['parrafos'] if x]
    enunciado = parrafos[-1]
    contexto = '\n'.join(parrafos[:-1]) if len(parrafos) > 1 else None
    opcion_correcta = next(o[1] for o in p['opciones'] if o[0] == p['correcta'])
    # Si la línea de respuesta añade algo más que el texto de la opción, se conserva como explicación.
    extra = p['texto_respuesta']
    if normalizar(extra) == normalizar(opcion_correcta) or not extra:
        explicacion = ''
    elif normalizar(extra).startswith(normalizar(opcion_correcta)):
        explicacion = extra[len(opcion_correcta):].strip(' .;:')
    else:
        explicacion = extra
    if re.search(r'\b(figura|gr[aá]fica|tabla|diagrama|imagen|esquema)\b', (contexto or '') + ' ' + enunciado, re.I):
        anomalias.append(f'revisar {codigo}: menciona figura, gráfica o tabla (no hay imagen en el banco)')
    salidas[materia]['preguntas'].append({
        'codigo': codigo,
        'subtema': s['slug'],
        'dificultad': 2,
        'competencia': None,
        'contexto_ref': None,
        'contexto': contexto,
        'enunciado': enunciado,
        'imagen': None,
        'imagen_alt': None,
        'opciones': [{'letra': l, 'texto': t, 'correcta': l == p['correcta'], 'retroalimentacion': None} for l, t in p['opciones']],
        'explicacion': explicacion,
        'tiempo_estimado_seg': 120,
        'etiquetas': [],
    })

os.makedirs(salida, exist_ok=True)
total = 0
for materia, datos in salidas.items():
    with open(os.path.join(salida, f'{materia}.json'), 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
        f.write('\n')
    total += len(datos['preguntas'])
    print(f'{materia}: {len(datos["preguntas"])} preguntas')
print(f'TOTAL: {total} preguntas en {len(contador)} subtemas')
faltantes = [s['slug'] for s in catalogo['subtemas'] if s['slug'] not in contador]
if faltantes:
    print('Subtemas sin preguntas:', ', '.join(faltantes))
print(f'\nAnomalías ({len(anomalias)}):')
for a in anomalias:
    print(' -', a)
