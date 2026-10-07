"""Detección y normalización de fechas y horas (OCR, EXIF, nombre de archivo).

Para Colombia, una fecha numérica ambigua (ambos campos <= 12) se interpreta como
DD/MM/YYYY y se marca `ambigua=True`. Siempre se conserva el texto original.
"""
import re
from datetime import date, datetime, timedelta

from . import config
from .textos import corregir_contexto_numerico, sin_tildes

MESES = {"ene": 1, "enero": 1, "jan": 1, "january": 1, "feb": 2, "febrero": 2, "february": 2,
         "mar": 3, "marzo": 3, "march": 3, "abr": 4, "abril": 4, "apr": 4, "april": 4, "may": 5, "mayo": 5,
         "jun": 6, "junio": 6, "june": 6, "jul": 7, "julio": 7, "july": 7, "ago": 8, "agosto": 8, "aug": 8,
         "august": 8, "sep": 9, "sept": 9, "set": 9, "septiembre": 9, "setiembre": 9, "september": 9,
         "oct": 10, "octubre": 10, "october": 10, "nov": 11, "noviembre": 11, "november": 11,
         "dic": 12, "diciembre": 12, "dec": 12, "december": 12}
_MES_RX = "|".join(sorted(MESES, key=len, reverse=True))

RX_ISO = re.compile(r"(?<!\d)(?P<y>(?:19|20)\d{2})[-/.:](?P<m>\d{1,2})[-/.:](?P<d>\d{1,2})(?!\d)")
RX_NUM = re.compile(r"(?<![\d.,])(?P<a>\d{1,2})[-/.](?P<b>\d{1,2})[-/.](?P<y>(?:19|20)?\d{2})(?![\d.,]|\d)")
RX_TXT_DMY = re.compile(rf"(?<!\d)(?P<d>\d{{1,2}})\s*(?:de\s+)?[-/.]?\s*(?P<mes>{_MES_RX})\.?\s*(?:de\s+|del\s+)?[-/.,]?\s*(?P<y>(?:19|20)\d{{2}})(?!\d)", re.I)
RX_TXT_MDY = re.compile(rf"(?P<mes>{_MES_RX})\.?\s+(?P<d>\d{{1,2}})(?:st|nd|rd|th)?,?\s+(?P<y>(?:19|20)\d{{2}})(?!\d)", re.I)
RX_HORA = re.compile(
    r"(?<![\d.,])(?P<h>[01]?\d|2[0-3])\s?[:hH]\s?(?P<mi>[0-5]\d)(?:\s?:\s?(?P<s>[0-5]\d))?(?:[.,]\d{1,3})?"
    r"\s*(?P<ampm>a\.?\s?m\.?|p\.?\s?m\.?|am\b|pm\b)?(?![\d.,]?\d)", re.I)


def _valida(y, m, d):
    try:
        f = date(y, m, d)
    except ValueError:
        return None
    hoy = date.today()
    if f.year < 1990 or f > hoy + timedelta(days=1):
        return f, "FECHA_FUERA_DE_RANGO_PLAUSIBLE"
    return f, None


def buscar_fechas(texto):
    if not texto:
        return []
    t, corr = corregir_contexto_numerico(texto)
    tn = sin_tildes(t)
    res, usados = [], []

    def add(m, y, mo, d, formato, ambigua=False, nota=None):
        if any(not (m.end() <= a or m.start() >= b) for a, b in usados):
            return
        v = _valida(y, mo, d)
        if not v:
            return
        f, alerta = v
        usados.append(m.span())
        res.append({"fecha": f.isoformat(), "fecha_original": texto[m.start():m.end()].strip(), "formato": formato,
                    "ambigua": ambigua, "nota": nota, "alerta": alerta,
                    "correcciones": [c for c in corr if c["valor_ocr"] in texto[m.start():m.end()]]})

    for m in RX_ISO.finditer(tn):
        add(m, int(m["y"]), int(m["m"]), int(m["d"]), "YYYY-MM-DD")
    for m in RX_TXT_DMY.finditer(tn):
        add(m, int(m["y"]), MESES[m["mes"].lower()], int(m["d"]), "D MES YYYY")
    for m in RX_TXT_MDY.finditer(tn):
        add(m, int(m["y"]), MESES[m["mes"].lower()], int(m["d"]), "MES D, YYYY")
    for m in RX_NUM.finditer(tn):
        a, b, y = int(m["a"]), int(m["b"]), int(m["y"])
        if y < 100:
            y += 2000
        if a > 12 and b <= 12:
            add(m, y, b, a, "DD/MM/YYYY")
        elif b > 12 and a <= 12:
            add(m, y, a, b, "MM/DD/YYYY", nota="Interpretada MM/DD porque el segundo campo > 12")
        elif a <= 12 and b <= 12:
            add(m, y, b, a, "DD/MM/YYYY", ambigua=a != b,
                nota="Fecha ambigua: se asume DD/MM/YYYY (convención Colombia)" if a != b else None)
    res.sort(key=lambda r: texto.find(r["fecha_original"]))
    return res


def buscar_horas(texto):
    if not texto:
        return []
    t, _ = corregir_contexto_numerico(texto)
    res = []
    for m in RX_HORA.finditer(t):
        h, mi, s = int(m["h"]), int(m["mi"]), int(m["s"] or 0)
        ampm = (m["ampm"] or "").lower().replace(".", "").replace(" ", "")
        if ampm == "pm" and h < 12:
            h += 12
        elif ampm == "am" and h == 12:
            h = 0
        if ampm and int(m["h"]) > 12:
            continue
        # Requiere ':' (o 'h') entre horas y minutos: evita confundir decimales de coordenadas.
        res.append({"hora": f"{h:02d}:{mi:02d}:{s:02d}", "hora_original": texto[m.start():m.end()].strip(),
                    "formato": "12H" if ampm else "24H", "con_segundos": m["s"] is not None})
    return res


def desde_exif(valor):
    """'2026:09:07 09:32:56' -> (fecha, hora)."""
    if not valor:
        return None
    v = str(valor).strip().replace("\x00", "")
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y:%m:%d %H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            dt = datetime.strptime(v[:19], fmt)
            return {"fecha": dt.date().isoformat(), "hora": dt.strftime("%H:%M:%S"), "original": v}
        except ValueError:
            continue
    return None


def gps_utc_a_colombia(fecha_gps, hora_gps):
    """GPSDateStamp/GPSTimeStamp están en UTC: convierte a hora local de Colombia."""
    try:
        dt = datetime.strptime(f"{fecha_gps} {hora_gps}", "%Y:%m:%d %H:%M:%S")
    except (ValueError, TypeError):
        return None
    loc = dt + timedelta(hours=config.OFFSET_COLOMBIA_H)
    return {"fecha": loc.date().isoformat(), "hora": loc.strftime("%H:%M:%S"),
            "original": f"{fecha_gps} {hora_gps} UTC"}


RX_ARCHIVO = [
    (re.compile(r"(?<!\d)(?P<y>20\d{2})(?P<m>[01]\d)(?P<d>[0-3]\d)[_\-T ]?(?P<H>[0-2]\d)(?P<M>[0-5]\d)(?P<S>[0-5]\d)(?!\d{2,})"), "FECHA_HORA"),
    (re.compile(r"(?<!\d)(?P<y>20\d{2})[-_.]?(?P<m>[01]\d)[-_.]?(?P<d>[0-3]\d)(?!\d)"), "FECHA"),
]


def desde_nombre_archivo(nombre):
    base = nombre.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    for rx, tipo in RX_ARCHIVO:
        m = rx.search(base)
        if not m:
            continue
        v = _valida(int(m["y"]), int(m["m"]), int(m["d"]))
        if not v:
            continue
        hora = f"{m['H']}:{m['M']}:{m['S']}" if tipo == "FECHA_HORA" and int(m["H"]) < 24 else None
        nota = None
        up = base.upper()
        if "-WA" in up:
            nota = "WhatsApp: la fecha del nombre suele ser la de recepción/envío, no la de captura"
        elif up.startswith("PXL_"):
            nota = "Google Pixel: la hora del nombre está en UTC"
        return {"fecha": v[0].isoformat(), "hora": hora, "original": m.group(0), "nota": nota}
    return None
