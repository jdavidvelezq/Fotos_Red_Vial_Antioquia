"""CAPA 1 — Metadatos de la fotografía (EXIF, GPS, XMP)."""
import re

from . import fechas

try:  # soporte HEIC opcional
    from pillow_heif import register_heif_opener
    register_heif_opener()
except Exception:  # pragma: no cover
    pass

GPS_IFD, EXIF_IFD = 0x8825, 0x8769


def _a_float(v):
    try:
        return float(v)
    except (TypeError, ValueError, ZeroDivisionError):
        try:
            return v[0] / v[1]
        except Exception:
            return None


def _dms_a_decimal(dms, ref):
    try:
        g, m, s = (_a_float(x) for x in dms)
    except Exception:
        return None
    if g is None:
        return None
    v = g + (m or 0) / 60 + (s or 0) / 3600
    return -v if str(ref).upper().strip("\x00 ") in ("S", "W") else v


def _limpio(v):
    if isinstance(v, bytes):
        try:
            return v.decode("utf-8", "ignore").strip("\x00 ")
        except Exception:
            return None
    if isinstance(v, tuple):
        return [_limpio(x) for x in v]
    if hasattr(v, "numerator"):
        return _a_float(v)
    return v


def leer_metadatos(img, raw_bytes=None):
    """Lee todos los metadatos disponibles de una imagen PIL abierta."""
    from PIL import ExifTags

    out = {"tiene_exif": False, "tiene_gps": False, "exif": {}, "gps": {}, "xmp": {}}
    exif = img.getexif()
    if exif:
        out["tiene_exif"] = True
        tags = dict(exif.items())
        try:
            tags.update(exif.get_ifd(EXIF_IFD))
        except Exception:
            pass
        for k, v in tags.items():
            nombre = ExifTags.TAGS.get(k, str(k))
            if nombre in ("MakerNote", "UserComment", "PrintImageMatching") or k in (GPS_IFD, EXIF_IFD):
                continue
            lv = _limpio(v)
            if isinstance(lv, (str, int, float, list)) or lv is None:
                out["exif"][nombre] = lv
        try:
            gps = exif.get_ifd(GPS_IFD)
        except Exception:
            gps = {}
        for k, v in (gps or {}).items():
            out["gps"][ExifTags.GPSTAGS.get(k, str(k))] = _limpio(v)

    g = out["gps"]
    lat = lon = None
    if g.get("GPSLatitude") and g.get("GPSLongitude"):
        lat = _dms_a_decimal(g["GPSLatitude"], g.get("GPSLatitudeRef", "N"))
        lon = _dms_a_decimal(g["GPSLongitude"], g.get("GPSLongitudeRef", "E"))
        # Coordenadas 0,0 son típicamente GPS sin señal
        if lat is not None and lon is not None and not (abs(lat) < 1e-9 and abs(lon) < 1e-9):
            out["tiene_gps"] = True
    alt = _a_float(g.get("GPSAltitude")) if g.get("GPSAltitude") is not None else None
    if alt is not None and str(g.get("GPSAltitudeRef", 0)) in ("1", "b'\\x01'"):
        alt = -alt

    # XMP (algunas apps guardan GPS solo en XMP)
    xmp_txt = None
    if raw_bytes:
        m = re.search(rb"<x:xmpmeta.*?</x:xmpmeta>", raw_bytes, re.S)
        if m:
            xmp_txt = m.group(0).decode("utf-8", "ignore")
    if xmp_txt:
        for campo in ("GPSLatitude", "GPSLongitude", "DateTimeOriginal", "CreateDate", "ModifyDate"):
            mm = re.search(rf"{campo}[\"'>=\s]+([^\"'<]+)", xmp_txt)
            if mm:
                out["xmp"][campo] = mm.group(1).strip()
        if not out["tiene_gps"] and out["xmp"].get("GPSLatitude") and out["xmp"].get("GPSLongitude"):
            def _xmp(v):
                mm = re.match(r"(\d+),(\d+(?:\.\d+)?)([NSEW])", v)
                if not mm:
                    return None
                d = int(mm[1]) + float(mm[2]) / 60
                return -d if mm[3] in "SW" else d
            lat, lon = _xmp(out["xmp"]["GPSLatitude"]), _xmp(out["xmp"]["GPSLongitude"])
            out["tiene_gps"] = lat is not None and lon is not None
            out["gps_fuente"] = "XMP"

    e = out["exif"]
    dto = fechas.desde_exif(e.get("DateTimeOriginal") or out["xmp"].get("DateTimeOriginal"))
    gps_local = None
    if g.get("GPSDateStamp") and g.get("GPSTimeStamp"):
        ts = g["GPSTimeStamp"]
        try:
            hms = ":".join(f"{int(float(x)):02d}" for x in ts)
            gps_local = fechas.gps_utc_a_colombia(g["GPSDateStamp"], hms)
        except Exception:
            gps_local = None

    out["normalizado"] = {
        "latitud_decimal": round(lat, 7) if out["tiene_gps"] else None,
        "longitud_decimal": round(lon, 7) if out["tiene_gps"] else None,
        "altitud_m": alt,
        "coordenada_fuente": {k: g.get(k) for k in ("GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef")} if g else None,
        "gps_fecha_hora_local": gps_local,
        "date_time_original": dto,
        "create_date": fechas.desde_exif(e.get("DateTimeDigitized") or out["xmp"].get("CreateDate")),
        "modify_date": fechas.desde_exif(e.get("DateTime") or out["xmp"].get("ModifyDate")),
        "camara_marca": e.get("Make"), "camara_modelo": e.get("Model"),
        "lente": e.get("LensModel") or e.get("LensMake"), "orientacion": e.get("Orientation"),
        "software": e.get("Software"), "copyright": e.get("Copyright"), "artista": e.get("Artist"),
        "ancho": img.width, "alto": img.height,
    }
    return out
