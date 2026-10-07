"""Detección inteligente de coordenadas en texto (OCR o multimodal).

Principios:
* Se analiza TODO el texto detectado (líneas y bloques descubiertos dinámicamente).
* Nunca se toma "el primer decimal": cada candidato requiere un patrón de coordenada
  (hemisferio, etiqueta, DMS, UTM o par con signo plausible) y pasa validaciones.
* Toda corrección de OCR queda registrada.
* Nunca se fabrica una coordenada: si no hay patrón válido no hay candidato.
"""
import re

from . import geovalidacion as geo
from .textos import corregir_contexto_numerico, corregir_hemisferios

NUM = r"[+-]?\s?\d{1,3}(?:\s?[.,]\s?\d{1,8})?"
DEC = r"[+-]?\s?\d{1,3}\s?[.,]\s?\d{2,8}"
GRADO = r"[°º˚*]|(?<=\d)o(?=\s?\d)"
MIN = r"['′’´`]"
SEG = r"(?:[\"″”]|''|’’|′′)"
HEM = r"(?P<h>[NSEWO])(?:este|ste|orte|orth|outh|ur|est|ast)?(?![a-zA-Z])"

RX_DMS = re.compile(
    rf"(?P<signo>[+-])?\s?(?P<g>\d{{1,3}})\s?(?:{GRADO})\s?(?P<m>\d{{1,2}}(?:[.,]\d+)?)\s?{MIN}?"
    rf"\s?(?:(?P<s>\d{{1,2}}(?:[.,]\d+)?)\s?{SEG}?)?\s?(?:{HEM})?(?![a-zA-Z])")
RX_DEC_HEM = re.compile(rf"(?<![\d.,])(?P<v>{DEC})\s?°?\s?{HEM}")
RX_ETIQ = re.compile(
    rf"(?P<et>lat(?:itud|itude)?|lon(?:gitud|gitude|g)?|lng)\.?\s*[:=]?\s*(?P<v>{DEC})\s?°?\s?(?:{HEM})?",
    re.IGNORECASE)
RX_PAR = re.compile(rf"(?<![\d.,])(?P<a>{DEC})\s*[,;/|]?\s+(?P<b>{DEC})(?![\d])|(?<![\d.,])(?P<a2>{DEC})\s*[;/|,]\s*(?P<b2>{DEC})(?![\d])")
RX_UTM = re.compile(
    r"(?P<z>\d{1,2})\s?(?P<band>[C-HJ-NP-X])\s+(?P<e>\d{6}(?:[.,]\d+)?)\s?(?:m\s?)?E?\s*[,;]?\s+(?P<n>\d{6,7}(?:[.,]\d+)?)\s?(?:m\s?)?N?(?![a-zA-Z0-9])")
RX_ZONA = re.compile(r"(?:zona|zone|utm)\s*[:=]?\s*(?P<z>\d{1,2})\s?(?P<band>[C-HJ-NP-X])?", re.IGNORECASE)
RX_ESTE = re.compile(r"(?:este|easting|\bE|\bX)\s*[:=]\s*(?P<v>\d{6,7}(?:[.,]\d+)?)", re.IGNORECASE)
RX_NORTE = re.compile(r"(?:norte|northing|\bN|\bY)\s*[:=]\s*(?P<v>\d{6,7}(?:[.,]\d+)?)", re.IGNORECASE)

CONF_BASE = {"DECIMAL_HEMISFERIO": 0.95, "DMS": 0.95, "ETIQUETADO": 0.93, "DMS_SIN_HEMISFERIO": 0.82,
             "DECIMAL_CON_SIGNO": 0.85, "UTM": 0.85, "ORIGEN_NACIONAL_CTM12": 0.85}


def _num(s):
    return float(re.sub(r"\s", "", s).replace(",", "."))


def _decimales(s):
    s = re.sub(r"\s", "", s).replace(",", ".")
    return len(s.split(".")[1]) if "." in s else 0


def _eje(h):
    if h is None:
        return None
    return "lat" if h in "NS" else "lon"


def _aplicar_hemisferio(valor_txt, h):
    v = _num(valor_txt)
    signo_explicito = "-" in valor_txt or "+" in valor_txt
    negativo_txt = "-" in valor_txt
    if h in ("S", "W", "O"):
        res = -abs(v)
        inconsistente = signo_explicito and not negativo_txt and False  # "+75W" es habitual en apps de cámara
    else:
        res = abs(v)
        inconsistente = negativo_txt
    return res, inconsistente


def _componentes(texto):
    """Extrae componentes de coordenada individuales con su eje."""
    comps = []
    for m in RX_DMS.finditer(texto):
        g, mi, s, h = m.group("g"), m.group("m"), m.group("s"), m.group("h")
        mval = _num(mi)
        sval = _num(s) if s else 0.0
        if mval >= 60 or sval >= 60:
            continue
        # Exigir minutos explícitos con símbolo o segundos para no confundir con "6°" sueltos.
        v = int(g) + mval / 60 + sval / 3600
        if h:
            v = -v if h in "SWO" else v
        elif m.group("signo") == "-":
            v = -v
        comps.append({"tipo": "DMS" if h else "DMS_SIN_HEMISFERIO", "valor": v, "eje": _eje(h),
                      "span": m.span(), "precision": 5 if s else 3, "inconsistente": False})
    usados = [c["span"] for c in comps]

    def libre(sp):
        return all(sp[1] <= u[0] or sp[0] >= u[1] for u in usados)

    for m in RX_ETIQ.finditer(texto):
        if not libre(m.span()):
            continue
        et = m.group("et").lower()
        eje = "lat" if et.startswith("lat") else "lon"
        h = m.group("h")
        if h:
            v, inc = _aplicar_hemisferio(m.group("v"), h)
            if _eje(h) != eje:
                inc = True
        else:
            v, inc = _num(m.group("v")), False
        comps.append({"tipo": "ETIQUETADO", "valor": v, "eje": eje, "span": m.span(),
                      "precision": _decimales(m.group("v")), "inconsistente": inc})
        usados.append(m.span())
    for m in RX_DEC_HEM.finditer(texto):
        if not libre(m.span()):
            continue
        h = m.group("h")
        v, inc = _aplicar_hemisferio(m.group("v"), h)
        comps.append({"tipo": "DECIMAL_HEMISFERIO", "valor": v, "eje": _eje(h), "span": m.span(),
                      "precision": _decimales(m.group("v")), "inconsistente": inc})
        usados.append(m.span())
    comps.sort(key=lambda c: c["span"][0])
    return comps, usados


def _emparejar(comps):
    pares = []
    usados = set()
    for i, c in enumerate(comps):
        if i in usados:
            continue
        for j in range(i + 1, min(i + 3, len(comps))):
            if j in usados:
                continue
            d = comps[j]
            ejes = {c["eje"], d["eje"]}
            if ejes == {"lat", "lon"}:
                lat, lon = (c, d) if c["eje"] == "lat" else (d, c)
            elif c["eje"] is None and d["eje"] is None and c["tipo"] == d["tipo"]:
                lat, lon = c, d  # DMS sin hemisferio: orden convencional lat, lon
            else:
                continue
            pares.append((lat, lon))
            usados.update({i, j})
            break
    return pares


def _candidato(lat, lon, formato, texto_orig, span, extra=None):
    c = {"latitud": round(lat, 7), "longitud": round(lon, 7), "formato": formato,
         "coordenada_original": texto_orig[span[0]:span[1]].strip(), "correcciones": [], "notas": [],
         "_span": span}
    if extra:
        c.update(extra)
    return c


def buscar_en_texto(texto):
    """Busca candidatos de coordenadas en una cadena. Devuelve lista de candidatos sin
    puntuar (la puntuación se hace en `puntuar`)."""
    if not texto or not re.search(r"\d", texto):
        return []
    t1, corr1 = corregir_contexto_numerico(texto)
    t2, corr2 = corregir_hemisferios(t1)
    correcciones = corr1 + corr2
    candidatos = []

    comps, usados = _componentes(t2)
    for lat, lon in _emparejar(comps):
        span = (min(lat["span"][0], lon["span"][0]), max(lat["span"][1], lon["span"][1]))
        formato = lat["tipo"] if lat["tipo"] == lon["tipo"] else "MIXTO"
        c = _candidato(lat["valor"], lon["valor"], formato, texto, span)
        c["precision_decimales"] = min(lat["precision"], lon["precision"])
        if lat["inconsistente"] or lon["inconsistente"]:
            c["notas"].append("SIGNO_INCONSISTENTE_CON_HEMISFERIO")
        candidatos.append(c)

    def libre(sp):
        return all(sp[1] <= u[0] or sp[0] >= u[1] for u in usados)

    # Pares con signo / sin hemisferio: solo si son plausibles como lat, lon.
    for m in RX_PAR.finditer(t2):
        if not libre(m.span()):
            continue
        a_txt = m.group("a") or m.group("a2")
        b_txt = m.group("b") or m.group("b2")
        a, b = _num(a_txt), _num(b_txt)
        notas = []
        if -4.5 <= a <= 13.7 and -82.5 <= b <= -66.5:
            lat, lon = a, b
        elif -4.5 <= b <= 13.7 and -82.5 <= a <= -66.5:
            lat, lon = b, a
            notas.append("ORDEN_LON_LAT_DETECTADO")
        elif -90 <= a <= 90 and -180 <= b <= 180 and ("-" in a_txt or "-" in b_txt or "+" in a_txt) \
                and min(_decimales(a_txt), _decimales(b_txt)) >= 4:
            lat, lon = a, b
            notas.append("FUERA_DE_COLOMBIA")
        elif -4.5 <= a <= 13.7 and 66.5 <= b <= 82.5 and min(_decimales(a_txt), _decimales(b_txt)) >= 4:
            # Longitud positiva en rango de Colombia: probable signo omitido. NO se acepta
            # como confirmada: se registra como candidato de baja confianza para revisión.
            lat, lon = a, -b
            notas.append("SIGNO_OESTE_INFERIDO")
            correcciones = correcciones + [{"valor_ocr": b_txt, "valor_corregido": f"-{b_txt.strip()}",
                                            "tipo_correccion": "SIGNO_LONGITUD_INFERIDO", "pos": m.start()}]
        else:
            continue
        if min(_decimales(a_txt), _decimales(b_txt)) < 3:
            continue
        c = _candidato(lat, lon, "DECIMAL_CON_SIGNO", texto, m.span())
        c["precision_decimales"] = min(_decimales(a_txt), _decimales(b_txt))
        c["notas"].extend(notas)
        candidatos.append(c)
        usados.append(m.span())

    # UTM explícito: "18N 123456 6789012"
    for m in RX_UTM.finditer(t2):
        z = int(m.group("z"))
        if not 1 <= z <= 60:
            continue
        norte_hemi = m.group("band") >= "N"
        lat, lon = geo.utm_a_geograficas(z, norte_hemi, _num(m.group("e")), _num(m.group("n")))
        c = _candidato(lat, lon, "UTM", texto, m.span(), {"utm": {"zona": z, "banda": m.group("band"),
                       "este": _num(m.group("e")), "norte": _num(m.group("n"))}})
        c["precision_decimales"] = 5
        candidatos.append(c)

    # UTM / Origen Nacional etiquetado: Zona..., Este: ..., Norte: ...
    me, mn = RX_ESTE.search(t2), RX_NORTE.search(t2)
    if me and mn:
        este, norte = _num(me.group("v")), _num(mn.group("v"))
        mz = RX_ZONA.search(t2)
        span = (min(me.start(), mn.start()), max(me.end(), mn.end()))
        if mz:
            z = int(mz.group("z"))
            band = mz.group("band") or "N"
            lat, lon = geo.utm_a_geograficas(z, band >= "N", este, norte)
            c = _candidato(lat, lon, "UTM", texto, span, {"utm": {"zona": z, "banda": band, "este": este, "norte": norte}})
            if not mz.group("band"):
                c["notas"].append("HEMISFERIO_UTM_ASUMIDO_NORTE")
            c["precision_decimales"] = 5
            candidatos.append(c)
        elif 4_000_000 <= este <= 6_000_000 and 1_000_000 <= norte <= 3_000_000:
            r = geo.origen_nacional_a_geograficas(este, norte)
            if r:
                c = _candidato(r[0], r[1], "ORIGEN_NACIONAL_CTM12", texto, span,
                               {"proyeccion": {"epsg": 9377, "este": este, "norte": norte}})
                c["precision_decimales"] = 5
                candidatos.append(c)

    for c in candidatos:
        ini, fin = c.pop("_span")
        while fin < len(texto) and fin < len(t2) and t2[fin] == " " and texto[fin].isalpha():
            fin += 1  # incluir letras originales reemplazadas por relleno (p. ej. "VV" -> "W ")
        c["coordenada_original"] = texto[ini:fin].strip()
        c["correcciones"] = [{k: v for k, v in x.items() if k != "pos"} for x in correcciones
                             if ini <= x.get("pos", -1) < fin]
        if c["correcciones"]:
            c["valor_corregido"] = re.sub(r"\s+", " ", t2[ini:fin]).strip()
    return candidatos


def puntuar(c, confianza_ocr=1.0, fuente="OCR"):
    """Asigna confianza, validaciones y estado a un candidato."""
    lat, lon = c["latitud"], c["longitud"]
    val = {"rango_valido": geo.rango_valido(lat, lon)}
    if not val["rango_valido"]:
        c.update(confianza=0.0, validaciones=val, estado="INVALIDA", fuente=fuente, dentro_de_antioquia=None)
        return c
    base = CONF_BASE.get(c["formato"], 0.8)
    conf = base * (0.7 + 0.3 * max(0.0, min(1.0, confianza_ocr)))
    for k in c.get("correcciones", []):
        conf -= 0.12 if k["tipo_correccion"].startswith("SIGNO") else 0.08 if k["tipo_correccion"] == "OCR_HEMISFERIO" else 0.04
    if "SIGNO_OESTE_INFERIDO" in c["notas"]:
        conf = min(conf, 0.45)
    if "SIGNO_INCONSISTENTE_CON_HEMISFERIO" in c["notas"]:
        conf -= 0.15
    prec = c.get("precision_decimales", 4)
    if prec < 3:
        conf -= 0.2
        c["notas"].append("PRECISION_BAJA")
    elif prec == 3:
        conf -= 0.05
    val["en_colombia"] = geo.en_colombia(lat, lon)
    if not val["en_colombia"]:
        conf -= 0.2
    dentro, metodo = geo.dentro_de_antioquia(lat, lon)
    val["metodo_antioquia"] = metodo
    c["dentro_de_antioquia"] = dentro
    c["confianza"] = round(max(0.05, min(0.99, conf)), 3)
    c["validaciones"] = val
    c["fuente"] = fuente
    c["estado"] = "VALIDA" if c["confianza"] >= 0.7 and dentro else "REQUIERE_REVISION"
    return c


def consolidar(candidatos, radio_m=30):
    """Agrupa candidatos casi idénticos (varias versiones de imagen / motores OCR)."""
    grupos = []
    for c in sorted(candidatos, key=lambda x: -x.get("confianza", 0)):
        if c.get("estado") == "INVALIDA":
            grupos.append({**c, "votos": 1})
            continue
        for g in grupos:
            if g.get("estado") != "INVALIDA" and geo.distancia_m(g["latitud"], g["longitud"], c["latitud"], c["longitud"]) <= radio_m:
                g["votos"] += 1
                g.setdefault("evidencias", []).append({k: c.get(k) for k in ("coordenada_original", "fuente", "confianza", "version_imagen", "motor")})
                break
        else:
            grupos.append({**c, "votos": 1, "evidencias": [{k: c.get(k) for k in ("coordenada_original", "fuente", "confianza", "version_imagen", "motor")}]})
    for g in grupos:
        if g["votos"] > 1 and g.get("confianza"):
            g["confianza"] = round(min(0.99, g["confianza"] + 0.02 * (g["votos"] - 1)), 3)
    return grupos


def buscar_en_lineas(lineas, fuente="OCR", meta=None):
    """Busca en cada línea y en pares de líneas consecutivas (coordenadas en 2 renglones)."""
    meta = meta or {}
    salida = []
    textos = [(ln["texto"], ln.get("confianza", 1.0), ln.get("bbox")) for ln in lineas]
    for i in range(len(lineas) - 1):
        a, b = lineas[i], lineas[i + 1]
        bb = [min(a["bbox"][0], b["bbox"][0]), a["bbox"][1], max(a["bbox"][2], b["bbox"][2]), b["bbox"][3]] if a.get("bbox") and b.get("bbox") else None
        textos.append((a["texto"] + "  " + b["texto"], (a.get("confianza", 1) + b.get("confianza", 1)) / 2, bb))
    vistos = set()
    for txt, conf, bbox in textos:
        for c in buscar_en_texto(txt):
            clave = (c["latitud"], c["longitud"], c["formato"])
            if clave in vistos:
                continue
            vistos.add(clave)
            c["bbox"] = bbox
            c["texto_contexto"] = txt
            c.update(meta)
            salida.append(puntuar(c, conf, fuente))
    return salida
