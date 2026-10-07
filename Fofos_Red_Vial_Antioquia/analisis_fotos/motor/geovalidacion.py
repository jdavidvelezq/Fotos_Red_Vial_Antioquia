"""Validación geográfica: rangos, Antioquia (polígono/bbox), distancias y UTM."""
import json
import math
from functools import lru_cache

from . import config


def rango_valido(lat, lon):
    return lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180


def en_bbox(lat, lon, bbox):
    return bbox["lat_min"] <= lat <= bbox["lat_max"] and bbox["lon_min"] <= lon <= bbox["lon_max"]


def en_colombia(lat, lon):
    return en_bbox(lat, lon, config.COLOMBIA_BBOX)


@lru_cache(maxsize=1)
def _poligonos_antioquia():
    """Carga anillos exteriores [(lon, lat), ...] del GeoJSON oficial si existe."""
    ruta = config.ANTIOQUIA_GEOJSON
    if not ruta.exists():
        return None
    data = json.loads(ruta.read_text(encoding="utf-8"))
    feats = data.get("features", [data]) if data.get("type") == "FeatureCollection" else [data]
    anillos = []
    for f in feats:
        geom = f.get("geometry", f)
        if geom["type"] == "Polygon":
            anillos.append(geom["coordinates"])
        elif geom["type"] == "MultiPolygon":
            anillos.extend(geom["coordinates"])
    return anillos or None


def _punto_en_anillo(x, y, anillo):
    dentro = False
    n = len(anillo)
    j = n - 1
    for i in range(n):
        xi, yi = anillo[i][0], anillo[i][1]
        xj, yj = anillo[j][0], anillo[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            dentro = not dentro
        j = i
    return dentro


def dentro_de_antioquia(lat, lon):
    """Devuelve (bool|None, metodo). Usa polígono oficial si está disponible."""
    if not rango_valido(lat, lon):
        return None, None
    polis = _poligonos_antioquia()
    if polis:
        for poly in polis:
            if _punto_en_anillo(lon, lat, poly[0]) and not any(_punto_en_anillo(lon, lat, h) for h in poly[1:]):
                return True, "POLIGONO"
        return False, "POLIGONO"
    return en_bbox(lat, lon, config.ANTIOQUIA_BBOX), "BBOX"


def distancia_m(lat1, lon1, lat2, lon2):
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def utm_a_geograficas(zona, hemisferio_norte, este, norte):
    """Conversión UTM (WGS84) -> lat/lon. Implementación estándar (Snyder)."""
    a, f, k0 = 6378137.0, 1 / 298.257223563, 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x = este - 500000.0
    y = norte if hemisferio_norte else norte - 10000000.0
    lon0 = math.radians((zona - 1) * 6 - 180 + 3)
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    phi1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
            + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
            + (151 * e1 ** 3 / 96) * math.sin(6 * mu))
    n1 = a / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    t1 = math.tan(phi1) ** 2
    c1 = ep2 * math.cos(phi1) ** 2
    r1 = a * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = lon0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6
                  + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def origen_nacional_a_geograficas(este, norte):
    """MAGNA-SIRGAS Origen Nacional (CTM12, EPSG:9377) -> WGS84. Requiere pyproj."""
    try:
        from pyproj import Transformer
    except ImportError:
        return None
    t = Transformer.from_crs("EPSG:9377", "EPSG:4326", always_xy=True)
    lon, lat = t.transform(este, norte)
    return lat, lon
