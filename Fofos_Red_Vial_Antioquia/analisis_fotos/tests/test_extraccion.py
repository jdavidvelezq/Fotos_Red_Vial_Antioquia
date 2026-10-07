"""Pruebas del detector de coordenadas y fechas (solo librería estándar + pytest)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

from motor import coordenadas as co  # noqa: E402
from motor import fechas as fe  # noqa: E402


def _uno(texto):
    cands = [co.puntuar(c) for c in co.buscar_en_texto(texto)]
    assert cands, f"sin candidatos para {texto!r}"
    return max(cands, key=lambda c: c["confianza"])


@pytest.mark.parametrize("texto", [
    "+6,1703N -75,1630W", "6.1703 N 75.1630 W", "+6.1703N -75.1630W", "6,1703N -75,1630W",
    "6.1703 N, 75.1630 W", "+6.1703 -75.1630", "6.1703 -75.1630", "6.1703, -75.1630",
    "Lat: 6.1703 Lon: -75.1630", "Latitude: 6.1703  Longitude: -75.1630",
    "Latitud: 6,1703 Longitud: -75,1630", "6.1703N 75.1630O", "6.1703 N 75.1630 Oeste",
])
def test_formatos_decimales(texto):
    c = _uno(texto)
    assert c["latitud"] == pytest.approx(6.1703, abs=1e-6)
    assert c["longitud"] == pytest.approx(-75.1630, abs=1e-6)
    assert c["dentro_de_antioquia"] is True


def test_ejemplo_foto_con_ruido():
    texto = "7 sept 2026 9:32:56 a. m.  +6,1703N -75,1630W"
    c = _uno(texto)
    assert (c["latitud"], c["longitud"]) == (6.1703, -75.163)
    assert c["coordenada_original"] == "+6,1703N -75,1630W"
    assert c["confianza"] >= 0.9


def test_correccion_ocr_O_por_cero():
    c = _uno("6.1703N -75.163OW")
    assert c["longitud"] == pytest.approx(-75.163)
    assert c["correcciones"][0]["tipo_correccion"] == "OCR_CONFUSION_LETRA_DIGITO"
    assert c["valor_corregido"] == "6.1703N -75.1630W"


def test_hemisferio_mal_leido():
    c = _uno("6.1703N -75.1630VV")
    assert c["longitud"] == pytest.approx(-75.163)
    assert any(k["tipo_correccion"] == "OCR_HEMISFERIO" for k in c["correcciones"])


def test_dms():
    c = _uno("6°10'13.1\"N 75°09'46.8\"W")
    assert c["latitud"] == pytest.approx(6.170306, abs=1e-5)
    assert c["longitud"] == pytest.approx(-75.163, abs=1e-5)
    c = _uno("6° 10' 13\" N  75° 09' 46\" W")
    assert c["formato"] == "DMS"


def test_dms_dos_lineas():
    lineas = [{"texto": "6° 10' 13\" N", "confianza": 0.9, "bbox": [0, 0, 10, 10]},
              {"texto": "75° 09' 46\" W", "confianza": 0.9, "bbox": [0, 12, 10, 22]}]
    cands = co.buscar_en_lineas(lineas)
    assert any(abs(c["longitud"] + 75.1628) < 1e-3 for c in cands)


def test_utm():
    c = _uno("18N 436000 682000")
    assert 6.0 < c["latitud"] < 6.3 and -75.7 < c["longitud"] < -75.4


def test_no_inventa():
    for t in ["Grada el peñol", "Contrato 4600018621", "Km 12+300", "7 sept 2026 9:32:56", "Valor 3.5 m"]:
        assert co.buscar_en_texto(t) == [], t


def test_signo_omitido_baja_confianza():
    c = _uno("6.1703, 75.1630")
    assert c["longitud"] < 0 and c["confianza"] <= 0.45 and c["estado"] == "REQUIERE_REVISION"


def test_fuera_de_antioquia_se_conserva():
    c = _uno("4.7110N 74.0721W")  # Bogotá
    assert c["dentro_de_antioquia"] is False and c["estado"] == "REQUIERE_REVISION"


# ---------------- Fechas ----------------
@pytest.mark.parametrize("texto,esperado,ambigua", [
    ("07/09/2026", "2026-09-07", True), ("7 sept 2026", "2026-09-07", False),
    ("7 septiembre 2026", "2026-09-07", False), ("2026-09-07", "2026-09-07", False),
    ("07-09-2026", "2026-09-07", True), ("09/25/2026", "2026-09-25", False),
    ("7 de septiembre de 2026", "2026-09-07", False), ("Sep 7, 2026", "2026-09-07", False),
])
def test_fechas(texto, esperado, ambigua):
    r = fe.buscar_fechas(texto)
    assert r and r[0]["fecha"] == esperado
    assert r[0]["ambigua"] == ambigua


def test_horas():
    assert fe.buscar_horas("9:32:56 a. m.")[0]["hora"] == "09:32:56"
    assert fe.buscar_horas("3:05 p.m.")[0]["hora"] == "15:05:00"
    assert fe.buscar_horas("21:40:01")[0]["hora"] == "21:40:01"
    assert fe.buscar_horas("+6,1703N -75,1630W") == []


def test_fecha_nombre_archivo():
    r = fe.desde_nombre_archivo("IMG_20260907_093256.jpg")
    assert r["fecha"] == "2026-09-07" and r["hora"] == "09:32:56"
    r = fe.desde_nombre_archivo("IMG-20260907-WA0012.jpg")
    assert r["fecha"] == "2026-09-07" and r["hora"] is None
