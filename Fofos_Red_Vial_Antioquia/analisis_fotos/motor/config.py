"""Configuración central del motor de análisis fotográfico."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("FOTOS_DATA_DIR", BASE_DIR / "datos"))
UPLOAD_DIR = DATA_DIR / "fotos"
THUMB_DIR = DATA_DIR / "miniaturas"
DB_PATH = DATA_DIR / "fotos_red_vial.sqlite"
# Polígono oficial de Antioquia (GeoJSON). Si no existe se usa el bounding box.
ANTIOQUIA_GEOJSON = Path(os.getenv("ANTIOQUIA_GEOJSON", BASE_DIR / "recursos" / "antioquia.geojson"))

# Bounding box aproximado del departamento de Antioquia (WGS84).
ANTIOQUIA_BBOX = {"lat_min": 5.40, "lat_max": 8.90, "lon_min": -77.15, "lon_max": -73.85}
# Bounding box aproximado de Colombia continental + insular.
COLOMBIA_BBOX = {"lat_min": -4.30, "lat_max": 13.60, "lon_min": -82.00, "lon_max": -66.80}

# Orden de motores OCR a intentar. Los no instalados se omiten.
OCR_MOTORES = [m.strip() for m in os.getenv("OCR_MOTORES", "paddle,easyocr,tesseract").split(",") if m.strip()]
OCR_IDIOMAS = ["es", "en"]

# Visión multimodal (Gemini). Requiere GEMINI_API_KEY en el entorno.
VISION_HABILITADA = os.getenv("VISION_HABILITADA", "1") == "1"
VISION_MODELO = os.getenv("VISION_MODELO", "gemini-3.8-flash")

# Umbrales
UMBRAL_CONFLICTO_COORD_M = float(os.getenv("UMBRAL_CONFLICTO_COORD_M", "150"))
UMBRAL_CONFLICTO_HORA_MIN = 10
UMBRAL_CONFIANZA_BAJA = 0.70
UMBRAL_PHASH_DUPLICADO = 6
UMBRAL_PHASH_SIMILAR = 12

# Zona horaria de Colombia (UTC-5, sin horario de verano)
OFFSET_COLOMBIA_H = -5

for d in (DATA_DIR, UPLOAD_DIR, THUMB_DIR):
    d.mkdir(parents=True, exist_ok=True)
