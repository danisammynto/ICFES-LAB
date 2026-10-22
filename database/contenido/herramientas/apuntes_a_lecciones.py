"""Convierte los volcados de los apuntes (volcar_docx.py) en las lecciones JSON de ICFES Lab.

Cada documento se recorre línea a línea; los encabezados deciden a qué subtema (lección) va el
contenido según el mapa de cada documento. Los párrafos, listas, tablas, imágenes, recuadros y
ecuaciones se convierten en bloques de lección. No se genera texto nuevo: todo el contenido
proviene de los documentos.

Uso: python -I apuntes_a_lecciones.py <carpeta_volcados> <carpeta_medios> <catalogo.json> <carpeta_proyecto>
"""
import json
import os
import re
import shutil
import sys
import unicodedata

carpeta_volcados, carpeta_medios, ruta_catalogo, proyecto = sys.argv[1:5]
catalogo = json.load(open(ruta_catalogo, encoding='utf-8'))
SUBTEMAS = {s['slug']: s for s in catalogo['subtemas']}
TEMAS = {t['slug']: t for t in catalogo['temas']}
PREFIJO = {m: d['prefijo'] for m, d in catalogo['materias'].items()}

# ---------------------------------------------------------------------------
# Utilidades de texto
# ---------------------------------------------------------------------------

SUPER = str.maketrans('0123456789+-−()=n', '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁽⁾⁼ⁿ')
SUBS = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
        'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
        'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', '+': '₊', '-': '₋', '−': '₋'}


def normalizar(texto):
    t = unicodedata.normalize('NFD', texto)
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    t = t.lower().replace('**', '')
    t = re.sub(r'^\s*\d+(\.\d+)*\.?\s*', '', t)  # quita la numeración "1.2 "
    t = re.sub(r'[^a-z0-9 ]+', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def embellecer_ecuacion(e):
    """Linealización OMML → texto legible (exponentes y subíndices Unicode, fracciones simples)."""
    e = e.replace('⋅', '·')
    e = re.sub(r'\^\(∘\)', '°', e)
    e = re.sub(r'\^\(([0-9+−\-=n]{1,6})\)', lambda m: m.group(1).translate(SUPER), e)

    def sub(m):
        s = m.group(1)
        if all(c in SUBS for c in s):
            return ''.join(SUBS[c] for c in s)
        return '_' + s
    e = re.sub(r'_\(([A-Za-z0-9+−\-]{1,4})\)', sub, e)
    # (a)/(b) con lados simples → a/b
    e = re.sub(r'\(([^()]{1,12})\)/\(([^()]{1,12})\)', lambda m: f'{m.group(1)}/{m.group(2)}' if ' ' not in m.group(1) + m.group(2) else f'({m.group(1)})/({m.group(2)})', e)
    return e.strip()


def limpiar_texto(t):
    t = re.sub(r'⟦([^⟧]*)⟧', lambda m: embellecer_ecuacion(m.group(1)), t)
    t = t.replace('\t', ' ')
    # Marcadores de negrita pegados al texto: "** texto" → "**texto" y "texto **" → "texto**".
    t = re.sub(r'(?<!\S)\*\*[ \t]+(?=\S)', '**', t)
    t = re.sub(r'(?<=\S)([ \t]+)\*\*(?=\s|$)', r'**\1', t)
    t = re.sub(r'(?<=\S)[ \t]+\*\*(?=[.,;:)])', '**', t)
    t = t.replace('****', '')
    t = re.sub(r'\*\*\s*\*\*', '', t)
    t = re.sub(r'[ ]{2,}', ' ', t)
    return t.strip()


def quitar_negritas(t):
    return t.replace('**', '').strip()


def es_ecuacion_sola(t):
    return bool(re.fullmatch(r'\s*⟦[^⟧]*⟧\s*[.;]?\s*', t))


RE_IMG = re.compile(r'\[img (\S+)(?: ([0-9.]+)cm)?(?: alt=([^\]]*))?\]')


def titulo_ejemplo(etiqueta):
    """"Ejemplo 1.1 — Título" → "Título"; "Ejemplo 2" → None (la página muestra 'Ejemplo resuelto')."""
    t = re.sub(r'^(ejemplo resuelto|ejemplo explicado|ejemplos?)\s*[:—-]?\s*', '', etiqueta or '', flags=re.I).strip()
    t = re.sub(r'^\d+(\.\d+)*\s*[—–:.)-]?\s*', '', t).strip()
    return (t[0].upper() + t[1:]) if t else None


def etiqueta_inicial(t):
    """Si el texto empieza con una etiqueta en negrita ("**Cuidado:** …"), la devuelve con el resto."""
    m = re.match(r'^\*\*([^*]{2,90}?)\*\*[:\s]*(.*)$', t, re.S)
    if m:
        return m.group(1).strip(' :.'), m.group(2).strip()
    return None, t


def tipo_por_etiqueta(etiqueta, por_defecto):
    e = normalizar(etiqueta or '')
    if not e:
        return por_defecto
    if re.search(r'^(ejemplo|ejemplos|paso a paso|procedimiento|atajo)', e):
        return 'ejemplo'
    if re.search(r'(error|errores|cuidado|ojo|confusion|no confund|trampa|nota de seguridad)', e):
        return 'alerta'
    if re.search(r'(tip|truco|clave|estrategia|como reconocer|como identificar|que formula|precision sobre)', e):
        return 'tip'
    if re.search(r'(idea|recuerda|recordar|importante|lo esencial|dato|resumen|diferencia|definicion|concepto|por que este tema|que evalua|como se evalua)', e):
        return 'concepto'
    return por_defecto


def tipo_por_color(color, por_defecto='concepto'):
    c = (color or '').upper()
    if c in ('FDEDEC', 'FFEBEE', 'FDECEA', 'FCE4E4'):
        return 'alerta'
    if c in ('FFF6E5', 'FDF1E6', 'FFF3E0', 'FFF4DC', 'FFF8E1', 'FFF2CC'):
        return 'tip'
    return por_defecto


def contar_palabras(bloques):
    n = 0
    for b in bloques:
        for v in b.values():
            if isinstance(v, str):
                n += len(v.split())
            elif isinstance(v, list):
                for x in v:
                    if isinstance(x, str):
                        n += len(x.split())
                    elif isinstance(x, list):
                        n += sum(len(str(y).split()) for y in x)
    return n


# ---------------------------------------------------------------------------
# Configuración por documento: mapa de encabezados → subtema
#   clave: encabezado normalizado (sin numeración); con "*" al final empareja por prefijo.
#   valor: slug del subtema, o None para descartar esa sección.
# ---------------------------------------------------------------------------

def mapa_desde_lista(pares):
    return [(k.rstrip('*'), k.endswith('*'), v) for k, v in pares]


FORMULAS_FISICA = {
    'Notación científica': 'analisis-dimensional-i', 'Conversión km/h ↔ m/s': 'analisis-dimensional-ii',
    'Vectores perpendiculares': 'analisis-dimensional-ii', 'MRU': 'cinematica-i', 'MRUA': 'cinematica-i',
    'Caída libre': 'cinematica-ii', 'Lanzamiento vertical': 'cinematica-ii', 'Tiro parabólico': 'cinematica-ii',
    'MCU': 'cinematica-ii', 'Segunda ley de Newton': 'dinamica-i', 'Peso': 'dinamica-i', 'Ley de Hooke': 'dinamica-i',
    'Fricción': 'dinamica-ii', 'Torque': 'dinamica-ii', 'Trabajo': 'dinamica-ii', 'Potencia': 'dinamica-ii',
    'Energía cinética': 'dinamica-ii', 'Energía potencial': 'dinamica-ii', 'Conservación de energía': 'dinamica-ii',
    'Péndulo y resorte': 'movimiento-ondulatorio', 'Ondas': 'movimiento-ondulatorio',
    'Índice de refracción y Snell': 'fenomenos-ondulatorios', 'Lentes': 'sonido-y-optica',
    'Ley de Coulomb': 'electromagnetismo', 'Campo eléctrico': 'electromagnetismo', 'Ley de Ohm': 'electromagnetismo',
    'Potencia eléctrica': 'electromagnetismo', 'Resistencias': 'electromagnetismo',
    'Temperatura': 'termodinamica', 'Calor': 'termodinamica', 'Dilatación': 'termodinamica', 'Gases ideales': 'termodinamica',
    'Primera ley': 'termodinamica', 'Cantidad de movimiento': 'colisiones-cantidad-movimiento',
    'Impulso': 'colisiones-cantidad-movimiento', 'Conservación de p': 'colisiones-cantidad-movimiento',
}
FORMULAS_QUIMICA = {
    'Densidad': 'materia-y-propiedades-i', 'Kelvin y Celsius': 'escalas-de-temperatura', 'Fahrenheit': 'escalas-de-temperatura',
    'Calor': 'escalas-de-temperatura', 'Número de neutrones': 'el-atomo', 'Carga de un ion': 'el-atomo',
    'Tipo de enlace': 'configuracion-electronica', 'pH': 'reacciones-y-ph', 'Moles': 'estequiometria-i',
    'Número de partículas': 'estequiometria-i', 'Rendimiento': 'estequiometria-ii', '% m/V': 'soluciones',
    '% m/m': 'soluciones', 'Molaridad': 'soluciones', 'Dilución': 'soluciones', 'Ley de Boyle': 'gases-ideales',
    'Ley de Charles': 'gases-ideales', 'Ley de Gay-Lussac': 'gases-ideales', 'Gas ideal': 'gases-ideales', 'Alcanos': 'quimica-organica',
}

DOCUMENTOS = {
    'Matematicas_pr': {
        'area': 'matematicas', 'estilo': 'matematicas',
        'mapa': mapa_desde_lista([
            ('operaciones basicas', 'operaciones-basicas'), ('porcentajes', 'porcentajes'), ('ecuaciones basicas*', 'ecuaciones-basicas'),
            ('geometria i figuras*', 'geometria-i'), ('geometria ii angulos*', 'geometria-ii'), ('plano cartesiano', 'plano-cartesiano'),
            ('trigonometria i teorema*', 'trigonometria-i'), ('trigonometria ii ley*', 'trigonometria-ii'),
            ('funciones i dominio*', 'funciones-i'), ('funciones ii tipos*', 'funciones-ii'),
            ('medidas de tendencia central', 'medidas-tendencia-central'), ('tecnicas de conteo*', 'tecnicas-de-conteo'),
        ]),
    },
    'Fisica_preICFE': {
        'area': 'ciencias-naturales', 'estilo': 'fisica', 'preambulo': 'analisis-dimensional-i',
        'mapa': mapa_desde_lista([
            ('analisis dimensional i', 'analisis-dimensional-i'), ('analisis dimensional ii', 'analisis-dimensional-ii'),
            ('cinematica i', 'cinematica-i'), ('cinematica ii', 'cinematica-ii'), ('dinamica i', 'dinamica-i'), ('dinamica ii', 'dinamica-ii'),
            ('movimiento ondulatorio', 'movimiento-ondulatorio'), ('fenomenos ondulatorios', 'fenomenos-ondulatorios'),
            ('sonido optica', 'sonido-y-optica'), ('electromagnetismo', 'electromagnetismo'), ('termodinamica', 'termodinamica'),
            ('colisiones y cantidad de movimiento', 'colisiones-cantidad-movimiento'), ('resumen de formulas', '__formulas__'),
        ]),
        'formulas': FORMULAS_FISICA,
    },
    'BiologiaMICRO_': {
        'area': 'ciencias-naturales', 'estilo': 'biomicro',
        'mapa': mapa_desde_lista([
            ('como abordar las preguntas de biologia', 'celula-procariota-eucariota'),
            ('celula procariota y eucariota', 'celula-procariota-eucariota'), ('organelos de la celula', 'organelos-de-la-celula'),
            ('transporte de membrana', 'transporte-de-membrana'), ('reproduccion celular i', 'reproduccion-celular-i'),
            ('reproduccion celular ii', 'reproduccion-celular-ii'), ('metabolismo celular', 'metabolismo-celular'),
            ('transcripcion y traduccion', 'transcripcion-y-traduccion'), ('genetica mendeliana', 'genetica-mendeliana'),
        ]),
    },
    'Biologia_PreIC': {
        'area': 'ciencias-naturales', 'estilo': 'biomacro',
        'mapa': mapa_desde_lista([
            ('presentacion y como usar este material', 'ecosistemas'), ('contenido', None), ('como esta organizado cada tema', None),
            ('la prueba de ciencias naturales en saber 11', 'ecosistemas'), ('estrategia general para responder*', 'ecosistemas'),
            ('ecosistemas', 'ecosistemas'), ('simbiosis y relaciones ecologicas', 'simbiosis'), ('ciclos biogeoquimicos', 'ciclos-biogeoquimicos'),
            ('metodo cientifico', 'metodo-cientifico'), ('evolucion de las especies', 'evolucion-de-las-especies'),
            ('organos y sistemas del cuerpo humano', 'organos-del-cuerpo-humano'), ('ciencia tecnologia y sociedad*', 'ciencia-tecnologia-sociedad'),
            ('medio ambiente', 'medio-ambiente'), ('fuentes consultadas', 'medio-ambiente'),
        ]),
    },
    'Historia__mate': {
        'area': 'sociales-ciudadanas', 'estilo': 'historia',
        'mapa': mapa_desde_lista([
            ('historia material de estudio para saber 11', 'historia-del-mundo-i'),
            ('como aparece la historia en la prueba saber 11', 'historia-del-mundo-i'), ('conceptos basicos para entender la historia', 'historia-del-mundo-i'),
            ('la edad media', 'historia-del-mundo-i'),
            ('el feudalismo', 'historia-del-mundo-ii'), ('la crisis del feudalismo', 'historia-del-mundo-ii'), ('las cruzadas', 'historia-del-mundo-ii'),
            ('diferencias entre la alta y la baja edad media', 'historia-del-mundo-ii'), ('el renacimiento y el humanismo', 'historia-del-mundo-ii'),
            ('la ilustracion', 'historia-del-mundo-ii'),
            ('la primera revolucion industrial', 'historia-del-mundo-iii'), ('la independencia de estados unidos', 'historia-del-mundo-iii'),
            ('la revolucion francesa*', 'historia-del-mundo-iii'), ('el imperialismo del siglo xix', 'historia-del-mundo-iii'),
            ('la primera guerra mundial*', 'historia-del-siglo-xx'), ('la revolucion rusa*', 'historia-del-siglo-xx'), ('la revolucion mexicana', 'historia-del-siglo-xx'),
            ('los anos felices 20*', 'historia-del-siglo-xx'), ('el nazismo y la segunda guerra mundial*', 'historia-del-siglo-xx'), ('la guerra fria*', 'historia-del-siglo-xx'),
            ('epoca precolombina', 'historia-de-latinoamerica-i'), ('epoca colonial', 'historia-de-latinoamerica-i'),
            ('los procesos de independencia', 'historia-de-latinoamerica-i'), ('la revolucion cubana*', 'historia-de-latinoamerica-ii'),
            ('la escuela de las americas*', 'historia-de-latinoamerica-ii'),
            ('epoca precolombina llegada de los espanoles y conquista', 'historia-de-colombia-i'),
            ('antecedentes de la independencia', 'historia-de-colombia-i'), ('el grito de independencia*', 'historia-de-colombia-i'),
            ('la patria boba*', 'historia-de-colombia-i'), ('la campana libertadora*', 'historia-de-colombia-i'),
            ('la gran colombia y la nueva granada', 'historia-de-colombia-i'), ('los partidos tradicionales*', 'historia-de-colombia-i'),
            ('la guerra de los mil dias*', 'historia-de-colombia-i'), ('la separacion de panama*', 'historia-de-colombia-i'),
            ('la masacre de las bananeras*', 'historia-de-colombia-ii'), ('el bogotazo*', 'historia-de-colombia-ii'), ('la violencia*', 'historia-de-colombia-ii'),
            ('la dictadura de rojas pinilla*', 'historia-de-colombia-ii'), ('el frente nacional*', 'historia-de-colombia-ii'),
            ('la evolucion de las guerrillas', 'historia-de-colombia-ii'), ('la epoca de los carteles*', 'historia-de-colombia-ii'),
            ('la constitucion de 1991', 'historia-de-colombia-ii'),
            ('lineas de tiempo de repaso', 'eventos-canonicos'), ('fuentes', 'eventos-canonicos'),
        ]),
        'solo_mapeados_h2h3': True,
    },
    'Ingles_Temario': {
        'area': 'ingles', 'estilo': 'ingles',
        'mapa': mapa_desde_lista([
            ('antes de empezar', 'estructura-oracion-imperativo'), ('estructura de la oracion y modo imperativo', 'estructura-oracion-imperativo'),
            ('presente simple y presente progresivo', 'presente-simple-progresivo'), ('pasado simple y pasado progresivo', 'pasado-simple-progresivo'),
            ('futuro comparativos y superlativos', 'futuro-comparativos-superlativos'), ('modal verbs y phrasal verbs', 'modal-phrasal-verbs'),
            ('tiempos perfectos y preposiciones in on at', 'perfecto-preposiciones'), ('wh questions y conectores', 'wh-questions-conectores'),
            ('gerundio e infinitivo y adverbios de tiempo', 'gerundio-infinitivo-adverbios'), ('adverbios y voz pasiva', 'adverbios-voz-pasiva'),
            ('fuentes consultadas', 'adverbios-voz-pasiva'),
        ]),
    },
    'Lectura_Critic': {
        'area': 'lectura-critica', 'estilo': 'lectura',
        'mapa': mapa_desde_lista([
            ('contenido', None), ('como analizar un texto', 'como-analizar-un-texto'), ('tipos de textos e intenciones comunicativas', 'tipos-de-textos'),
            ('taller de tipos de textos', 'taller-tipos-de-textos'), ('figuras literarias', 'figuras-literarias'), ('la argumentacion', 'la-argumentacion'),
            ('falacias argumentativas', 'falacias-argumentativas'), ('mini detalles de los textos', 'mini-detalles-de-los-textos'),
            ('fuentes', 'mini-detalles-de-los-textos'),
        ]),
    },
    'Qui__mica___Ma': {
        'area': 'ciencias-naturales', 'estilo': 'quimica',
        'mapa': mapa_desde_lista([
            ('quimica material de estudio para saber 11', 'materia-y-propiedades-i'), ('como se evalua la quimica en saber 11', 'materia-y-propiedades-i'),
            ('contenido', None), ('la materia y sus propiedades', 'materia-y-propiedades-i'),
            ('estados de la materia y cambios de estado', 'materia-y-propiedades-ii'), ('temperatura escalas y calor especifico', 'escalas-de-temperatura'),
            ('clasificacion de la materia y transformaciones', 'materia-y-propiedades-ii'), ('mezclas y metodos de separacion', 'mezclas-y-separacion'),
            ('el atomo', 'el-atomo'), ('la tabla periodica y sus propiedades', 'el-atomo'), ('configuracion electronica', 'configuracion-electronica'),
            ('enlaces quimicos', 'configuracion-electronica'), ('acidos bases y ph', 'reacciones-y-ph'), ('reacciones quimicas y energia', 'reacciones-y-ph'),
            ('estequiometria', 'estequiometria-i'), ('reactivo limite y reactivo en exceso', 'estequiometria-ii'), ('rendimiento de reaccion', 'estequiometria-ii'),
            ('confiabilidad de las mediciones', 'estequiometria-ii'), ('soluciones y solubilidad', 'soluciones'), ('gases ideales', 'gases-ideales'),
            ('quimica organica', 'quimica-organica'), ('como analizar experimentos y datos', 'estequiometria-ii'),
            ('tabla resumen de formulas', '__formulas__'), ('fuentes', 'quimica-organica'),
        ]),
        'formulas': FORMULAS_QUIMICA, 'solo_mapeados_h2h3': True,
    },
    'Sociales_preIC': {
        'area': 'sociales-ciudadanas', 'estilo': 'sociales',
        'mapa': mapa_desde_lista([
            ('como usar este material', 'derechos-humanos'), ('derechos humanos', 'derechos-humanos'), ('constitucion de 1991', 'constitucion-de-1991'),
            ('mecanismos de participacion', 'mecanismos-de-participacion'), ('mecanismos de proteccion', 'mecanismos-de-proteccion'),
            ('prejuicios y discriminacion', 'prejuicios'), ('modelos economicos i*', 'modelos-economicos-i'), ('modelos economicos ii*', 'modelos-economicos-ii'),
            ('fuentes consultadas', 'modelos-economicos-ii'),
        ]),
    },
}


def resolver(mapa, encabezado):
    """Devuelve el mapeo más específico (la clave más larga que coincida)."""
    n = normalizar(encabezado)
    mejor = None
    for clave, prefijo, slug in mapa:
        if n == clave or (prefijo and n.startswith(clave)):
            if mejor is None or len(clave) > len(mejor[0]):
                mejor = (clave, slug)
    return (True, mejor[1]) if mejor else (False, None)


# ---------------------------------------------------------------------------
# Conversión
# ---------------------------------------------------------------------------

class Convertidor:
    def __init__(self, nombre, config, lineas, medios):
        self.nombre = nombre
        self.config = config
        self.lineas = lineas
        self.medios = medios
        self.estilo = config['estilo']
        self.lecciones = {}      # slug → lista de bloques
        self.formulas = {}       # slug → filas de fórmulas
        self.slug = config.get('preambulo')
        self.en_toc = False
        self.imagenes = {}       # slug → contador
        self.pendiente_lista = None
        self.pendiente_recuadro = None  # (tipo_clave, lineas)
        self.ultimo_bloque_imagen = None
        self.avisos = []

    # ---- utilidades de salida -------------------------------------------------
    def bloques(self):
        if self.slug is None or self.slug == '__formulas__':
            return None
        return self.lecciones.setdefault(self.slug, [])

    def emitir(self, bloque):
        if 'titulo' in bloque and not bloque['titulo']:
            del bloque['titulo']
        b = self.bloques()
        if b is not None:
            b.append(bloque)

    def cerrar_lista(self):
        if self.pendiente_lista:
            items, ordenada = self.pendiente_lista
            self.emitir({'tipo': 'lista', 'items': items, 'ordenada': ordenada})
            self.pendiente_lista = None

    def cerrar_recuadro(self):
        if not self.pendiente_recuadro:
            return
        clave, lineas = self.pendiente_recuadro
        self.pendiente_recuadro = None
        self.emitir_recuadro(clave, lineas)

    def flush(self):
        self.cerrar_lista()
        self.cerrar_recuadro()

    # ---- recuadros ------------------------------------------------------------
    def emitir_recuadro(self, clave, lineas):
        """clave: ('formula'|'ejemplo'|'tip'|'alerta'|'concepto'|'auto', color)."""
        tipo, color = clave
        lineas = [limpiar_texto(l) for l in lineas if limpiar_texto(l)]
        if not lineas:
            return
        if tipo == 'formula':
            self.emitir({'tipo': 'formula', 'contenido': quitar_negritas('\n'.join(lineas))})
            return
        etiqueta, resto = etiqueta_inicial(lineas[0])
        if etiqueta is None and re.fullmatch(r'\*\*[^*]+\*\*', lineas[0]):
            etiqueta, resto = quitar_negritas(lineas[0]), ''
        cuerpo = ([resto] if resto else []) + lineas[1:]
        if tipo == 'auto':
            tipo = tipo_por_etiqueta(etiqueta, tipo_por_color(color))
        etiqueta = (etiqueta or '').replace('✎', '').replace('✔', '').replace('⚠', '').strip(' :')
        if tipo == 'ejemplo':
            bloque = {'tipo': 'ejemplo', 'titulo': titulo_ejemplo(etiqueta)}  # sin título → la página muestra 'Ejemplo resuelto'
            respuesta = None
            cuerpo_final = []
            for l in cuerpo:
                m = re.match(r'^\*\*Respuesta:?\*\*:?\s*(.*)$', l)
                if m and respuesta is None:
                    respuesta = quitar_negritas(m.group(1))
                else:
                    cuerpo_final.append(l)
            bloque['contenido'] = '\n\n'.join(cuerpo_final)
            if respuesta:
                bloque['respuesta'] = respuesta
            self.emitir(bloque)
            return
        titulos = {'tip': 'Tip ICFES', 'alerta': 'Cuidado', 'concepto': 'Idea clave'}
        self.emitir({'tipo': tipo, 'titulo': etiqueta or titulos[tipo], 'contenido': '\n\n'.join(cuerpo) if cuerpo else etiqueta})

    # ---- tablas ---------------------------------------------------------------
    def procesar_tabla(self, filas_crudas):
        filas = []
        colores = []
        for f in filas_crudas:
            celdas = [c for c in f.strip().strip('|').split(' | ')] if ' | ' in f else [f.strip().strip('|').strip()]
            fila, col = [], []
            for c in celdas:
                m = re.match(r'^\s*\{shd=([0-9A-Fa-f]+)\}\s*(.*)$', c, re.S)
                col.append(m.group(1).upper() if m else None)
                fila.append(limpiar_texto((m.group(2) if m else c).replace(' ⏎ ', '\n').replace('⏎', '\n')))
            filas.append(fila)
            colores.append(col)
        if not filas:
            return
        # Tabla de una celda → recuadro.
        if len(filas) == 1 and len(filas[0]) == 1:
            texto = filas[0][0]
            partes = [p for p in texto.split('\n') if p.strip()]
            if partes and normalizar(partes[0]) == 'contenido':
                return
            self.emitir_recuadro(('auto', colores[0][0]), partes)
            return
        if filas[0] and normalizar(filas[0][0]) == 'contenido' and len(filas[0]) == 1:
            return  # tabla de contenido del documento
        # Encabezado: primera fila sombreada con color oscuro o toda en negrita.
        oscuro = all(c and int(c[:2], 16) < 0x80 for c in colores[0]) if colores[0] and all(colores[0]) else False
        negrita = all(re.fullmatch(r'\*\*[^*]*\*\*', c.strip()) or not c.strip() for c in filas[0]) and any(c.strip() for c in filas[0])
        if oscuro or negrita:
            encabezado = [quitar_negritas(c) for c in filas[0]]
            cuerpo = filas[1:]
        else:
            encabezado, cuerpo = None, filas
        self.emitir({'tipo': 'tabla', 'encabezado': encabezado, 'filas': cuerpo})

    # ---- imágenes -------------------------------------------------------------
    def emitir_imagen(self, archivo, alt):
        if self.bloques() is None:
            return
        origen = os.path.join(self.medios, archivo)
        if not os.path.exists(origen):
            self.avisos.append(f'imagen no encontrada: {archivo}')
            return
        n = self.imagenes.get(self.slug, 0) + 1
        self.imagenes[self.slug] = n
        destino_dir = os.path.join(proyecto, 'frontend', 'img', 'lecciones', self.slug)
        os.makedirs(destino_dir, exist_ok=True)
        ext = os.path.splitext(archivo)[1].lower() or '.png'
        nombre = f'{n:02d}{ext}'
        shutil.copyfile(origen, os.path.join(destino_dir, nombre))
        bloque = {'tipo': 'imagen', 'src': f'/img/lecciones/{self.slug}/{nombre}', 'alt': quitar_negritas(limpiar_texto(alt or '')), 'pie': None}
        self.emitir(bloque)
        self.ultimo_bloque_imagen = bloque

    # ---- recorrido ------------------------------------------------------------
    def convertir(self):
        i = 0
        lineas = self.lineas
        while i < len(lineas):
            linea = lineas[i].rstrip('\n')
            i += 1
            if not linea.strip():
                continue
            # Encabezados
            m = re.match(r'^#(\d) (.*)$', linea)
            if m:
                nivel, texto = int(m.group(1)), quitar_negritas(limpiar_texto(m.group(2)))
                self.flush()
                self.en_toc = False
                if nivel == 0:
                    continue  # título de portada: no cambia la sección
                encontrado, slug = resolver(self.config['mapa'], texto)
                if encontrado:
                    self.slug = slug
                    if slug == '__formulas__':
                        continue
                    if nivel >= 2 and self.config.get('solo_mapeados_h2h3') and self.bloques() is not None:
                        self.emitir({'tipo': 'subtitulo', 'nivel': min(nivel, 3), 'texto': re.sub(r'^\d+(\.\d+)*\.?\s*', '', texto)})
                    continue
                if nivel <= 1:
                    self.slug = None  # H1 sin mapa: se descarta su contenido
                    self.avisos.append(f'H1 sin mapa (descartado): {texto}')
                    continue
                if nivel == 0:
                    continue
                if normalizar(texto) in ('contenido', 'indice'):
                    self.en_toc = True
                    continue
                if self.bloques() is not None:
                    self.emitir({'tipo': 'subtitulo', 'nivel': min(nivel, 3), 'texto': re.sub(r'^\d+(\.\d+)*\.?\s*', '', texto)})
                continue
            if self.en_toc:
                continue
            # Tablas
            if linea.startswith('[tabla'):
                self.flush()
                filas = []
                while i < len(lineas) and not lineas[i].startswith('[/tabla]'):
                    filas.append(lineas[i].rstrip('\n'))
                    i += 1
                i += 1
                if self.slug == '__formulas__':
                    self.repartir_formulas(filas)
                elif self.bloques() is not None:
                    self.procesar_tabla(filas)
                continue
            # Párrafos
            m = re.match(r'^\[p(?:\|([^\]]*))?\] ?(.*)$', linea)
            if not m:
                continue
            flags, texto = (m.group(1) or ''), m.group(2)
            if self.bloques() is None:
                continue
            if texto.strip() in ('', '⏎'):
                self.flush()
                continue
            if re.fullmatch(r'\*\*Contenido\*\*', texto.strip()):
                self.flush()
                self.en_toc = True
                continue
            self.procesar_parrafo(flags, texto, lineas, i)
        self.flush()

    def repartir_formulas(self, filas_crudas):
        mapa = self.config.get('formulas', {})
        for f in filas_crudas[1:]:
            celdas = [limpiar_texto(c.replace(' ⏎ ', '\n')) for c in f.strip().strip('|').split(' | ')]
            celdas = [re.sub(r'^\{shd=[0-9A-Fa-f]+\}\s*', '', c) for c in celdas]
            if len(celdas) < 2:
                continue
            tema = quitar_negritas(celdas[0])
            slug = mapa.get(tema)
            if not slug:
                self.avisos.append(f'fila de fórmulas sin tema asignado: {tema}')
                continue
            self.formulas.setdefault(slug, []).append([quitar_negritas(c) for c in celdas])

    def procesar_parrafo(self, flags, texto, lineas, i):
        estilo = self.estilo
        shd = re.search(r'shd=([0-9A-Fa-f]+)', flags)
        color = shd.group(1).upper() if shd else None
        bdr = ' bdr' in f' {flags}' or flags == 'bdr' or flags.startswith('bdr')
        est = re.search(r'est=([^\]]*?)(?: lista=|$| centro)', flags)
        est = est.group(1).strip() if est else ''
        lista = re.search(r'lista=\d+:(\w+)', flags)

        # Imágenes dentro del párrafo
        if '[img ' in texto:
            self.flush()
            for mi in RE_IMG.finditer(texto):
                self.emitir_imagen(mi.group(1), mi.group(3))
            resto = RE_IMG.sub('', texto).strip()
            if resto and resto != '⏎':
                self.emitir({'tipo': 'texto', 'contenido': limpiar_texto(resto)})
            return
        # Pie de imagen
        if self.ultimo_bloque_imagen is not None and (est == 'Image Caption' or (('centro' in flags) and re.match(r'^\s*(\*\*)?(Figura|Imagen|Esquema|Gráfica|Tabla)\b', texto))):
            self.ultimo_bloque_imagen['pie'] = quitar_negritas(limpiar_texto(texto))
            self.ultimo_bloque_imagen = None
            return
        self.ultimo_bloque_imagen = None

        # Listas
        if lista:
            self.cerrar_recuadro()
            ordenada = lista.group(1) == 'decimal'
            item = limpiar_texto(texto)
            if self.pendiente_lista and self.pendiente_lista[1] == ordenada:
                self.pendiente_lista[0].append(item)
            else:
                self.cerrar_lista()
                self.pendiente_lista = ([item], ordenada)
            return
        self.cerrar_lista()

        # Recuadros según el documento
        clave = None
        if estilo == 'matematicas':
            if color == 'EAF1FB':
                clave = ('formula', color)
            elif color == 'FDF1E6':
                clave = ('auto', color)
            elif bdr and not color:
                clave = ('bdr', None)
        elif estilo == 'fisica':
            if est == 'Ejemplo':
                clave = ('ejemplo', None)
            elif est == 'Clave':
                clave = ('tip', None)
        elif estilo == 'biomicro':
            if color in ('FFF6E5', 'EAF3FB', 'FDEDEC'):
                clave = ('auto', color)
        elif estilo == 'ingles':
            if color == 'EAF2FA':
                clave = ('auto', color)
        elif color and color not in ('F2F6FB', 'F2F7FC', 'F2F6FA', 'E8F0FB', 'F4F6F9'):
            clave = ('auto', color)

        if clave is not None:
            if clave[0] == 'bdr':
                # Matemáticas: los bloques con borde son ejemplos resueltos si empiezan como tal.
                if self.pendiente_recuadro and self.pendiente_recuadro[0] == ('ejemplo', None):
                    self.pendiente_recuadro[1].append(texto)
                    return
                if re.match(r'^\*\*Ejemplo', texto):
                    self.cerrar_recuadro()
                    self.pendiente_recuadro = (('ejemplo', None), [texto])
                    return
                self.cerrar_recuadro()
                clave = None  # párrafo normal
            else:
                if self.pendiente_recuadro and self.pendiente_recuadro[0] == clave and not (clave[0] == 'ejemplo' and re.match(r'^\*\*Ejemplo', texto)) and not (estilo in ('biomicro', 'ingles', 'matematicas') and re.fullmatch(r'\*\*[^*]+\*\*', texto.strip()) and clave[0] == 'auto'):
                    self.pendiente_recuadro[1].append(texto)
                    return
                self.cerrar_recuadro()
                self.pendiente_recuadro = (clave, [texto])
                return
        self.cerrar_recuadro()

        t = limpiar_texto(texto)
        if not t:
            return
        if es_ecuacion_sola(texto):
            self.emitir({'tipo': 'formula', 'contenido': quitar_negritas(t)})
            return
        # Párrafos con etiqueta inicial en negrita que indican un recuadro (Ejemplo:, Cuidado:, Nota:…)
        etiqueta, resto = etiqueta_inicial(t)
        if etiqueta and resto and len(etiqueta) <= 40:
            tipo = tipo_por_etiqueta(etiqueta, None)
            if tipo == 'ejemplo':
                self.emitir({'tipo': 'ejemplo', 'titulo': titulo_ejemplo(etiqueta), 'contenido': resto})
                return
            if tipo in ('alerta', 'tip') and estilo in ('quimica', 'historia', 'matematicas'):
                self.emitir({'tipo': tipo, 'titulo': etiqueta, 'contenido': resto})
                return
        self.emitir({'tipo': 'texto', 'contenido': t})


def resumen_de(bloques):
    # El resumen se toma del primer párrafo del tema en sí: si la lección empieza con una
    # presentación general del documento, se salta hasta el primer subtítulo.
    candidatos = bloques
    primer_subtitulo = next((i for i, b in enumerate(bloques) if b['tipo'] == 'subtitulo'), None)
    if primer_subtitulo is not None and bloques[0]['tipo'] == 'texto' and re.search(r'(este documento|este material|esta guía|cómo usar|cómo abordar)', bloques[0]['contenido'], re.I):
        candidatos = bloques[primer_subtitulo:]
    for b in candidatos:
        if b['tipo'] == 'texto':
            t = quitar_negritas(b['contenido']).split('\n')[0]
            frases = re.split(r'(?<=[.!?])\s+', t)
            r = ''
            for f in frases:
                if len(r) + len(f) + 1 > 280:
                    break
                r = f'{r} {f}'.strip()
            return r or t[:277] + '…'
    return ''


def main():
    salidas = {}
    informe = []
    for nombre, config in DOCUMENTOS.items():
        ruta = os.path.join(carpeta_volcados, f'{nombre}.txt')
        if not os.path.exists(ruta):
            informe.append(f'✖ falta el volcado {nombre}.txt')
            continue
        lineas = open(ruta, encoding='utf-8').read().split('\n')
        conv = Convertidor(nombre, config, lineas, os.path.join(carpeta_medios, nombre))
        conv.convertir()
        for slug, filas in conv.formulas.items():
            conv.lecciones.setdefault(slug, []).extend([
                {'tipo': 'subtitulo', 'nivel': 2, 'texto': 'Fórmulas clave'},
                {'tipo': 'tabla', 'encabezado': ['Tema', 'Fórmula', 'Unidades' if nombre.startswith('Fisica') else 'Significado de las letras'], 'filas': filas},
            ])
        area = config['area']
        salidas.setdefault(area, [])
        for slug, bloques in conv.lecciones.items():
            if not bloques:
                continue
            s = SUBTEMAS[slug]
            palabras = contar_palabras(bloques)
            salidas[area].append({
                'codigo': f"{PREFIJO[area]}-{s['abr']}-L1",
                'subtema': slug,
                'titulo': s['nombre'],
                'resumen': resumen_de(bloques),
                'duracion_min': max(5, min(60, round(palabras / 170))),
                'bloques': bloques,
            })
            tipos = {}
            for b in bloques:
                tipos[b['tipo']] = tipos.get(b['tipo'], 0) + 1
            informe.append(f"  {slug}: {palabras} palabras, {len(bloques)} bloques ({', '.join(f'{k} {v}' for k, v in sorted(tipos.items()))})")
        for a in conv.avisos:
            informe.append(f'  ! {nombre}: {a}')

    orden = {s['slug']: i for i, s in enumerate(catalogo['subtemas'])}
    for area, lecciones in salidas.items():
        lecciones.sort(key=lambda l: orden[l['subtema']])
        ruta = os.path.join(proyecto, 'database', 'contenido', 'lecciones', f'{area}.json')
        with open(ruta, 'w', encoding='utf-8') as f:
            json.dump({'materia': area, 'lecciones': lecciones}, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'{area}: {len(lecciones)} lecciones → {ruta}')
    con_leccion = {l['subtema'] for ls in salidas.values() for l in ls}
    faltan = [s['slug'] for s in catalogo['subtemas'] if s['slug'] not in con_leccion]
    print('Subtemas sin explicación:', ', '.join(faltan) if faltan else 'ninguno')
    print('\n'.join(informe))


main()
