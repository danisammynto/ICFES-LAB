"""Vuelca un .docx a un texto plano con marcadores de estructura (solo biblioteca estándar).

Marcadores por línea:
  #n texto                 encabezado de nivel n
  [p|flags] texto          párrafo normal; flags: shd=COLOR (sombreado), bdr (borde), lista=n (viñeta/numeración, nivel n),
                           est=Estilo (estilo distinto de Normal), centro, cita
  [tabla n filas x m col]  inicio de tabla; cada fila: "| c1 | c2 |"; termina con [/tabla]
  [img ruta ancho_cm]      imagen (extraída a la carpeta de medios indicada)
  [eq] texto               ecuación OMML linealizada (dentro del párrafo va como ⟦...⟧)
Las negritas se marcan con **texto**.

Uso: python -I volcar_docx.py <archivo.docx> <salida.txt> <carpeta_medios>
"""
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
M = '{http://schemas.openxmlformats.org/officeDocument/2006/math}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
WP = '{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'
PIC = '{http://schemas.openxmlformats.org/drawingml/2006/picture}'
V = '{urn:schemas-microsoft-com:vml}'

entrada, salida, medios = sys.argv[1:4]
os.makedirs(medios, exist_ok=True)

with zipfile.ZipFile(entrada) as z:
    doc = ET.fromstring(z.read('word/document.xml'))
    estilos_xml = ET.fromstring(z.read('word/styles.xml')) if 'word/styles.xml' in z.namelist() else None
    rels_xml = ET.fromstring(z.read('word/_rels/document.xml.rels'))
    numbering_xml = ET.fromstring(z.read('word/numbering.xml')) if 'word/numbering.xml' in z.namelist() else None
    archivos = {n: z.read(n) for n in z.namelist() if n.startswith('word/media/')}

# Relaciones rId -> archivo de medios
rels = {}
for rel in rels_xml:
    rels[rel.get('Id')] = rel.get('Target')

# Estilos: id -> (nombre, basado_en, esNumerado)
estilos = {}
if estilos_xml is not None:
    for s in estilos_xml.iter(f'{W}style'):
        sid = s.get(f'{W}styleId')
        nombre = s.find(f'{W}name')
        base = s.find(f'{W}basedOn')
        ppr = s.find(f'{W}pPr')
        numerado = ppr is not None and ppr.find(f'{W}numPr') is not None
        estilos[sid] = (nombre.get(f'{W}val', '') if nombre is not None else '', base.get(f'{W}val') if base is not None else None, numerado)

# Numeración: numId -> abstractNumId -> formato por nivel (bullet/decimal)
formatos_num = {}
if numbering_xml is not None:
    abstractos = {}
    for an in numbering_xml.iter(f'{W}abstractNum'):
        niveles = {}
        for lvl in an.iter(f'{W}lvl'):
            fmt = lvl.find(f'{W}numFmt')
            niveles[lvl.get(f'{W}ilvl')] = fmt.get(f'{W}val') if fmt is not None else 'bullet'
        abstractos[an.get(f'{W}abstractNumId')] = niveles
    for num in numbering_xml.iter(f'{W}num'):
        aid = num.find(f'{W}abstractNumId')
        if aid is not None:
            formatos_num[num.get(f'{W}numId')] = abstractos.get(aid.get(f'{W}val'), {})


def nivel_encabezado(sid):
    visto = set()
    while sid and sid not in visto:
        visto.add(sid)
        nombre, base, _ = estilos.get(sid, ('', None, False))
        m = re.match(r'(?i)(heading|t[ií]tulo)\s*(\d)$', nombre.strip())
        if m:
            return int(m.group(2))
        if re.match(r'(?i)^title$|^t[ií]tulo$', nombre.strip()):
            return 0
        sid = base
    return None


def estilo_numerado(sid):
    visto = set()
    while sid and sid not in visto:
        visto.add(sid)
        nombre, base, numerado = estilos.get(sid, ('', None, False))
        if numerado or re.search(r'(?i)list|lista|viñeta|vi.eta', nombre):
            return True
        sid = base
    return False


contador_img = [0]


def extraer_imagen(blip_rid):
    destino = rels.get(blip_rid)
    if not destino:
        return None
    clave = 'word/' + destino if not destino.startswith('word/') else destino
    datos = archivos.get(clave)
    if datos is None:
        return None
    contador_img[0] += 1
    nombre = os.path.basename(destino)
    ruta = os.path.join(medios, nombre)
    if not os.path.exists(ruta):
        with open(ruta, 'wb') as f:
            f.write(datos)
    return nombre


def texto_omath(om):
    partes = []
    for el in om.iter():
        tag = el.tag
        if tag == f'{M}t':
            partes.append(el.text or '')
        elif tag == f'{M}f':  # fracción: num/den
            pass
    # Linealización sencilla con marcadores de fracción, raíz, sub y superíndice.
    def lin(el):
        tag = el.tag
        if tag == f'{M}t':
            return el.text or ''
        if tag == f'{M}f':
            num = el.find(f'{M}num'); den = el.find(f'{M}den')
            return f'({lin(num)})/({lin(den)})'
        if tag == f'{M}rad':
            deg = el.find(f'{M}deg'); e = el.find(f'{M}e')
            d = lin(deg) if deg is not None else ''
            return (f'{d}√(' if d.strip() else '√(') + lin(e) + ')'
        if tag == f'{M}sSup':
            return f'{lin(el.find(f"{M}e"))}^({lin(el.find(f"{M}sup"))})'
        if tag == f'{M}sSub':
            return f'{lin(el.find(f"{M}e"))}_({lin(el.find(f"{M}sub"))})'
        if tag == f'{M}sSubSup':
            return f'{lin(el.find(f"{M}e"))}_({lin(el.find(f"{M}sub"))})^({lin(el.find(f"{M}sup"))})'
        if tag == f'{M}d':  # delimitadores
            return '(' + ''.join(lin(c) for c in el if c.tag == f'{M}e') + ')'
        if tag in (f'{M}nary',):
            sub = el.find(f'{M}sub'); sup = el.find(f'{M}sup'); e = el.find(f'{M}e')
            chr_ = el.find(f'{M}naryPr/{M}chr')
            simbolo = chr_.get(f'{M}val') if chr_ is not None else '∫'
            return f'{simbolo}[{lin(sub) if sub is not None else ""}→{lin(sup) if sup is not None else ""}]({lin(e) if e is not None else ""})'
        return ''.join(lin(c) for c in el)
    return lin(om)


def texto_run(r):
    partes = []
    for el in r:
        if el.tag == f'{W}t':
            partes.append(el.text or '')
        elif el.tag == f'{W}tab':
            partes.append('\t')
        elif el.tag in (f'{W}br', f'{W}cr'):
            partes.append('\n')
        elif el.tag == f'{W}sym':
            partes.append(f"[sym {el.get(f'{W}char')}]")
        elif el.tag == f'{W}drawing':
            for blip in el.iter(f'{A}blip'):
                nombre = extraer_imagen(blip.get(f'{R}embed'))
                ext = el.find(f'.//{WP}extent')
                ancho = round(int(ext.get('cx')) / 360000, 1) if ext is not None else ''
                desc = el.find(f'.//{WP}docPr')
                alt = (desc.get('descr') or desc.get('title') or '') if desc is not None else ''
                partes.append(f' [img {nombre} {ancho}cm{" alt=" + alt if alt else ""}] ')
        elif el.tag == f'{W}pict':
            for im in el.iter(f'{V}imagedata'):
                nombre = extraer_imagen(im.get(f'{R}id'))
                partes.append(f' [img {nombre}] ')
    texto = ''.join(partes)
    rpr = r.find(f'{W}rPr')
    if rpr is not None and texto.strip():
        b = rpr.find(f'{W}b')
        if b is not None and b.get(f'{W}val', 'true') not in ('0', 'false'):
            texto = f'**{texto}**'
        va = rpr.find(f'{W}vertAlign')
        if va is not None:
            texto = f'^{texto}' if va.get(f'{W}val') == 'superscript' else f'_{texto}' if va.get(f'{W}val') == 'subscript' else texto
    return texto


def texto_parrafo(p):
    partes = []
    for el in p:
        if el.tag == f'{W}r':
            partes.append(texto_run(el))
        elif el.tag == f'{W}hyperlink' or el.tag == f'{W}smartTag' or el.tag == f'{W}ins':
            for r in el.iter(f'{W}r'):
                partes.append(texto_run(r))
        elif el.tag == f'{M}oMath':
            partes.append(f'⟦{texto_omath(el)}⟧')
        elif el.tag == f'{M}oMathPara':
            for om in el.iter(f'{M}oMath'):
                partes.append(f'⟦{texto_omath(om)}⟧')
    texto = ''.join(partes)
    texto = re.sub(r'\*\*\s*\*\*', '', texto)
    texto = texto.replace('****', '')
    return texto.replace('\n', ' ⏎ ')


def flags_parrafo(p):
    flags = []
    ppr = p.find(f'{W}pPr')
    if ppr is None:
        return flags, None
    ps = ppr.find(f'{W}pStyle')
    sid = ps.get(f'{W}val') if ps is not None else None
    nombre = estilos.get(sid, ('', None, False))[0]
    if sid and nombre and nombre.lower() not in ('normal',):
        flags.append(f'est={nombre}')
    shd = ppr.find(f'{W}shd')
    if shd is not None and shd.get(f'{W}fill') not in (None, 'auto', 'FFFFFF'):
        flags.append(f"shd={shd.get(f'{W}fill')}")
    if ppr.find(f'{W}pBdr') is not None:
        flags.append('bdr')
    nump = ppr.find(f'{W}numPr')
    if nump is not None:
        ilvl = nump.find(f'{W}ilvl'); numid = nump.find(f'{W}numId')
        nivel = ilvl.get(f'{W}val') if ilvl is not None else '0'
        nid = numid.get(f'{W}val') if numid is not None else None
        fmt = formatos_num.get(nid, {}).get(nivel, '?')
        flags.append(f'lista={nivel}:{fmt}')
    elif estilo_numerado(sid):
        flags.append('lista=0:estilo')
    jc = ppr.find(f'{W}jc')
    if jc is not None and jc.get(f'{W}val') == 'center':
        flags.append('centro')
    return flags, sid


lineas = []


def volcar_tabla(tbl, prof=0):
    filas = list(tbl.findall(f'{W}tr'))
    ncol = max((len(f.findall(f'{W}tc')) for f in filas), default=0)
    lineas.append(f'[tabla {len(filas)} filas x {ncol} col]')
    for f in filas:
        celdas = []
        for tc in f.findall(f'{W}tc'):
            textos = []
            for hijo in tc:
                if hijo.tag == f'{W}p':
                    t = texto_parrafo(hijo).strip()
                    fl, _ = flags_parrafo(hijo)
                    if any(x.startswith('lista') for x in fl):
                        t = '• ' + t
                    if t:
                        textos.append(t)
                elif hijo.tag == f'{W}tbl':
                    textos.append('[subtabla]')
            shd = tc.find(f'{W}tcPr/{W}shd')
            marca = f"{{shd={shd.get(f'{W}fill')}}}" if shd is not None and shd.get(f'{W}fill') not in (None, 'auto', 'FFFFFF') else ''
            celdas.append(marca + ' ⏎ '.join(textos))
        lineas.append('| ' + ' | '.join(celdas) + ' |')
    lineas.append('[/tabla]')


cuerpo = doc.find(f'{W}body')
for el in cuerpo:
    if el.tag == f'{W}p':
        texto = texto_parrafo(el).strip()
        flags, sid = flags_parrafo(el)
        nivel = nivel_encabezado(sid)
        if nivel is not None:
            lineas.append(f'#{nivel} {texto}')
        elif texto or any(f.startswith('shd') for f in flags):
            lineas.append(f"[p{'|' + ' '.join(flags) if flags else ''}] {texto}")
    elif el.tag == f'{W}tbl':
        volcar_tabla(el)
    elif el.tag == f'{W}sdt':
        for p in el.iter(f'{W}p'):
            t = texto_parrafo(p).strip()
            if t:
                lineas.append(f'[p|sdt] {t}')

with open(salida, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lineas) + '\n')
print(f'{os.path.basename(entrada)}: {len(lineas)} líneas, {contador_img[0]} imágenes → {salida}')
