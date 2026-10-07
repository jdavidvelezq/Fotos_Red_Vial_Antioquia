"""CAPA 2 — OCR sobre TODA la imagen, con motores intercambiables y multi-versión.

Estrategia:
1. OCR de la imagen completa (original) con el primer motor disponible.
2. Si hay texto inclinado, se endereza la imagen completa y se repite.
3. Re-OCR "enfocado": cada región de texto DESCUBIERTA en el paso 1 que contenga dígitos
   se recorta (bbox dinámica), se amplía 3x y se vuelve a leer — clave para coordenadas,
   fechas, placas y códigos pequeños.
4. Si no aparece coordenada/fecha, se ejecutan versiones adicionales completas
   (ampliada, contraste, texto claro, nitidez...) y motores de respaldo.
Cada fragmento conserva texto, confianza, bbox en coordenadas de la imagen ORIGINAL,
versión de imagen y motor.
"""
import logging
import re

import cv2

from . import config
from . import preprocesamiento as pp

log = logging.getLogger(__name__)


class MotorOCR:
    nombre = "base"

    def leer(self, bgr):
        """Devuelve [{texto, confianza, poligono[[x,y]*4]}] en coords de `bgr`."""
        raise NotImplementedError


class MotorPaddle(MotorOCR):
    nombre = "paddle"

    def __init__(self):
        from paddleocr import PaddleOCR
        try:
            self.ocr = PaddleOCR(lang="es", use_textline_orientation=True)
            self.v3 = True
        except TypeError:
            self.ocr = PaddleOCR(lang="es", use_angle_cls=True, show_log=False)
            self.v3 = False

    def leer(self, bgr):
        out = []
        if self.v3:
            for r in self.ocr.predict(bgr):
                d = r.json.get("res", r) if hasattr(r, "json") else r
                for t, s, p in zip(d["rec_texts"], d["rec_scores"], d["rec_polys"]):
                    out.append({"texto": t, "confianza": float(s), "poligono": [[float(x), float(y)] for x, y in p]})
        else:
            for linea in (self.ocr.ocr(bgr, cls=True) or [[]])[0] or []:
                p, (t, s) = linea
                out.append({"texto": t, "confianza": float(s), "poligono": p})
        return out


class MotorEasy(MotorOCR):
    nombre = "easyocr"

    def __init__(self):
        import easyocr
        self.reader = easyocr.Reader(config.OCR_IDIOMAS, gpu=False, verbose=False)

    def leer(self, bgr):
        return [{"texto": t, "confianza": float(s), "poligono": [[float(x), float(y)] for x, y in p]}
                for p, t, s in self.reader.readtext(bgr, paragraph=False)]


class MotorTesseract(MotorOCR):
    nombre = "tesseract"

    def __init__(self):
        import pytesseract
        pytesseract.get_tesseract_version()
        self.t = pytesseract

    def leer(self, bgr):
        d = self.t.image_to_data(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), lang="spa+eng", config="--psm 11",
                                 output_type=self.t.Output.DICT)
        out = []
        for i, t in enumerate(d["text"]):
            if t.strip() and float(d["conf"][i]) > 0:
                x, y, w, h = d["left"][i], d["top"][i], d["width"][i], d["height"][i]
                out.append({"texto": t, "confianza": float(d["conf"][i]) / 100,
                            "poligono": [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]})
        return out


_CLASES = {"paddle": MotorPaddle, "easyocr": MotorEasy, "tesseract": MotorTesseract}
_motores = None


def motores_disponibles():
    global _motores
    if _motores is None:
        _motores = []
        for n in config.OCR_MOTORES:
            try:
                _motores.append(_CLASES[n]())
                log.info("Motor OCR disponible: %s", n)
            except Exception as e:  # motor no instalado
                log.warning("Motor OCR %s no disponible: %s", n, e)
    return _motores


def _a_frag(r, motor, version, escala=1.0, offset=(0, 0), M_inv=None):
    pts = r["poligono"]
    if M_inv is not None:
        import numpy as np
        arr = np.hstack([np.array(pts, dtype=float), np.ones((len(pts), 1))])
        pts = (M_inv @ arr.T).T.tolist()
    xs = [p[0] / escala + offset[0] for p in pts]
    ys = [p[1] / escala + offset[1] for p in pts]
    return {"texto": r["texto"].strip(), "confianza": round(r["confianza"], 4),
            "bbox": [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))],
            "poligono": [[int(p[0] / escala + offset[0]), int(p[1] / escala + offset[1])] for p in pts],
            "motor": motor, "version_imagen": version}


def _iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua else 0


def fusionar(fragmentos):
    """Para regiones solapadas, conserva la lectura de mayor confianza como principal
    y guarda las alternativas (útil para detectar OCR conflictivo)."""
    finales = []
    for f in sorted(fragmentos, key=lambda x: -x["confianza"]):
        for g in finales:
            if _iou(f["bbox"], g["bbox"]) > 0.5:
                if f["texto"] != g["texto"]:
                    g.setdefault("alternativas", []).append({k: f[k] for k in ("texto", "confianza", "motor", "version_imagen")})
                break
        else:
            finales.append(dict(f))
    return finales


_RX_INTERES = re.compile(r"\d")


def ejecutar(bgr, necesita_mas=None, max_versiones=None):
    """Ejecuta el OCR multi-capa. `necesita_mas(fragmentos)` decide si seguir con
    versiones adicionales (p. ej. si aún no hay coordenada)."""
    motores = motores_disponibles()
    informe = {"motores": [m.nombre for m in motores], "versiones": [], "inclinacion_grados": 0.0}
    if not motores:
        informe["error"] = "No hay motores OCR instalados"
        return [], informe
    principal = motores[0]
    crudos = []

    res = principal.leer(bgr)
    crudos += [_a_frag(r, principal.nombre, "original") for r in res]
    informe["versiones"].append("original")

    # Corrección de inclinación de la imagen completa
    ang = pp.estimar_inclinacion([r["poligono"] for r in res])
    informe["inclinacion_grados"] = round(ang, 2)
    if abs(ang) > 2.0:
        rot, M = pp.rotar(bgr, ang)
        M_inv = cv2.invertAffineTransform(M)
        crudos += [_a_frag(r, principal.nombre, "enderezada", M_inv=M_inv) for r in principal.leer(rot)]
        informe["versiones"].append("enderezada")

    # Re-OCR enfocado en regiones descubiertas con dígitos (coordenadas, fechas, placas)
    vistos = []
    for f in [c for c in crudos if _RX_INTERES.search(c["texto"])]:
        if any(_iou(f["bbox"], v) > 0.6 for v in vistos):
            continue
        vistos.append(f["bbox"])
        rec, off = pp.recortar_region(bgr, f["bbox"])
        if rec.size == 0:
            continue
        alto = rec.shape[0]
        factor = 3.0 if alto < 60 else 2.0 if alto < 120 else 1.0
        rec2 = pp.nitidez(pp.ampliar(rec, factor)) if factor > 1 else rec
        for r in principal.leer(rec2):
            crudos.append(_a_frag(r, principal.nombre, f"region_{factor:g}x", escala=factor, offset=off))
    if vistos:
        informe["versiones"].append(f"regiones_enfocadas({len(vistos)})")

    # Versiones adicionales y motores de respaldo solo si hace falta
    adicionales = ["ampliada_2x", "texto_claro", "contraste", "nitidez", "sin_ruido", "gris"][:max_versiones]
    for v in adicionales:
        if necesita_mas and not necesita_mas(fusionar(crudos)):
            break
        img_v = pp.VERSIONES[v](bgr)
        esc = pp.ESCALA.get(v, 1.0)
        crudos += [_a_frag(r, principal.nombre, v, escala=esc) for r in principal.leer(img_v)]
        informe["versiones"].append(v)
    for m in motores[1:]:
        if necesita_mas and not necesita_mas(fusionar(crudos)):
            break
        crudos += [_a_frag(r, m.nombre, "original") for r in m.leer(bgr)]
        informe["versiones"].append(f"original@{m.nombre}")

    informe["fragmentos_crudos"] = len(crudos)
    return crudos, informe
