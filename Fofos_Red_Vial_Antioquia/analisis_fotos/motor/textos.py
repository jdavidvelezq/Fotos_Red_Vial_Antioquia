"""Utilidades de texto: agrupación dinámica de fragmentos OCR en líneas/bloques y
corrección contextual de errores típicos del OCR (registrando cada corrección).

Ninguna función usa posiciones fijas: las líneas y bloques se descubren a partir de
las cajas (bbox) que devuelve el propio OCR.
"""
import re
import unicodedata

GUIONES = "\u2010\u2011\u2012\u2013\u2014\u2212~"


def sin_tildes(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def _union_bbox(bbs):
    return [min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs)]


def agrupar_lineas(fragmentos):
    """Agrupa fragmentos [{texto, confianza, bbox}] en líneas según solapamiento vertical."""
    frs = [f for f in fragmentos if f.get("texto", "").strip() and f.get("bbox")]
    frs.sort(key=lambda f: ((f["bbox"][1] + f["bbox"][3]) / 2, f["bbox"][0]))
    lineas = []
    for f in frs:
        x1, y1, x2, y2 = f["bbox"]
        h = max(1, y2 - y1)
        cy = (y1 + y2) / 2
        destino = None
        for ln in lineas:
            lx1, ly1, lx2, ly2 = ln["bbox"]
            lh = max(1, ly2 - ly1)
            if abs(cy - (ly1 + ly2) / 2) < 0.5 * min(h, lh) and 0.5 < h / lh < 2:
                gap = max(x1 - lx2, lx1 - x2)
                if gap < 3 * max(h, lh):
                    destino = ln
                    break
        if destino is None:
            lineas.append({"fragmentos": [f], "bbox": list(f["bbox"])})
        else:
            destino["fragmentos"].append(f)
            destino["bbox"] = _union_bbox([destino["bbox"], f["bbox"]])
    for ln in lineas:
        ln["fragmentos"].sort(key=lambda f: f["bbox"][0])
        ln["texto"] = " ".join(f["texto"].strip() for f in ln["fragmentos"])
        ln["confianza"] = sum(f.get("confianza", 0) for f in ln["fragmentos"]) / len(ln["fragmentos"])
    lineas.sort(key=lambda l: (l["bbox"][1], l["bbox"][0]))
    return lineas


def agrupar_bloques(lineas):
    """Agrupa líneas cercanas verticalmente y alineadas horizontalmente en bloques
    (p. ej. el sello fecha/coordenada/lugar que imprimen las apps de cámara)."""
    bloques = []
    for ln in lineas:
        x1, y1, x2, y2 = ln["bbox"]
        h = max(1, y2 - y1)
        destino = None
        for b in bloques:
            bx1, by1, bx2, by2 = b["bbox"]
            vertical = 0 <= y1 - by2 < 1.6 * h
            solape_h = min(x2, bx2) - max(x1, bx1) > -0.5 * h
            alineado = abs(x2 - bx2) < 2 * h or abs(x1 - bx1) < 2 * h
            if vertical and solape_h and alineado:
                destino = b
                break
        if destino is None:
            bloques.append({"lineas": [ln], "bbox": list(ln["bbox"])})
        else:
            destino["lineas"].append(ln)
            destino["bbox"] = _union_bbox([destino["bbox"], ln["bbox"]])
    return bloques


_MAPA_DIGITO = {"O": "0", "o": "0", "D": "0", "Q": "0", "I": "1", "l": "1", "|": "1", "i": "1",
                "S": "5", "s": "5", "B": "8", "Z": "2", "z": "2", "G": "6", "g": "9"}
_TOKEN_NUM = re.compile(r"[0-9OoDQIl|iSsBZzGg]+(?:[.,][0-9OoDQIl|iSsBZzGg]+)*")


def corregir_contexto_numerico(texto):
    """Corrige confusiones letra/dígito SOLO dentro de tokens claramente numéricos.

    Devuelve (texto_corregido, correcciones). Las sustituciones conservan la longitud,
    de modo que los índices del texto corregido siguen apuntando al texto original.
    """
    correcciones = []
    t = texto
    for g in GUIONES:
        t = t.replace(g, "-")
    chars = list(t)
    for m in _TOKEN_NUM.finditer(t):
        tok = m.group(0)
        digitos = sum(c.isdigit() for c in tok)
        letras = len(tok) - digitos - tok.count(".") - tok.count(",")
        # Evidencia suficiente: al menos 3 dígitos reales y letras minoritarias,
        # y el token no es parte de una palabra (no hay letra pegada antes).
        if digitos < 3 or letras == 0 or letras > max(1, digitos // 3):
            continue
        ini, fin = m.span()
        if ini > 0 and t[ini - 1].isalpha():
            continue
        tok_l = list(tok)
        # 'O' final pegado a número puede ser 'Oeste': solo se corrige si sigue W/E.
        if tok_l[-1] in "Oo":
            sig = t[fin:fin + 1]
            if not sig or sig.upper() not in ("W", "E", "V"):
                tok_l = tok_l[:-1]
        # Si la última letra es S/s y no sigue nada numérico, podría ser hemisferio Sur.
        if tok_l and tok_l[-1] in "Ss" and (fin >= len(t) or not t[fin].isdigit()):
            tok_l = tok_l[:-1]
        cambiado = False
        for i, c in enumerate(tok_l):
            if c in _MAPA_DIGITO and not c.isdigit():
                chars[ini + i] = _MAPA_DIGITO[c]
                cambiado = True
        if cambiado:
            correcciones.append({
                "valor_ocr": tok,
                "valor_corregido": "".join(chars[ini:fin]),
                "tipo_correccion": "OCR_CONFUSION_LETRA_DIGITO", "pos": ini,
            })
    return "".join(chars), correcciones


_HEMI_OCR = [(re.compile(r"(?<=\d)\s?(VV|vv|\\/\\/)(?![a-zA-Z0-9])"), "W"),
             (re.compile(r"(?<=\d)\s?([Vv])(?![a-zA-Z0-9])"), "W"),
             (re.compile(r"(?<=\d)\s?([H])(?![a-zA-Z0-9])"), "N"),
             (re.compile(r"(?<=\d)\s?(w)(?![a-zA-Z0-9])"), "W"),
             (re.compile(r"(?<=\d)\s?([nse])(?![a-zA-Z0-9])"), None)]


def corregir_hemisferios(texto):
    """Corrige letras de hemisferio mal leídas inmediatamente después de un número."""
    correcciones = []
    chars = list(texto)
    for rx, reemplazo in _HEMI_OCR:
        for m in rx.finditer(texto):
            ini, fin = m.span(1)
            orig = m.group(1)
            nuevo = (reemplazo or orig.upper()).ljust(len(orig))
            if orig != nuevo.strip():
                chars[ini:fin] = list(nuevo)
                correcciones.append({"valor_ocr": orig, "valor_corregido": nuevo.strip(),
                                     "tipo_correccion": "OCR_HEMISFERIO", "pos": ini})
    return "".join(chars), correcciones
