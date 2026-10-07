"""Análisis de calidad de la fotografía y huellas para duplicados."""
import hashlib

import cv2
import numpy as np


def analizar_calidad(bgr, fragmentos, hay_coordenada_legible):
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    escala = 1000 / max(h, w)
    gs = cv2.resize(g, None, fx=escala, fy=escala) if escala < 1 else g
    nitidez = float(cv2.Laplacian(gs, cv2.CV_64F).var())
    brillo = float(gs.mean())
    oscuros = float((gs < 20).mean())
    quemados = float((gs > 245).mean())
    area_texto = sum((f["bbox"][2] - f["bbox"][0]) * (f["bbox"][3] - f["bbox"][1]) for f in fragmentos) / float(h * w)
    util = max(0.0, 1 - oscuros - quemados - min(area_texto, 0.5))
    conf_txt = [f["confianza"] for f in fragmentos]
    conf_media = float(np.mean(conf_txt)) if conf_txt else None

    problemas = []
    if min(h, w) < 480:
        problemas.append("RESOLUCION_BAJA")
    if nitidez < 60:
        problemas.append("DESENFOQUE")
    if brillo < 50 or oscuros > 0.4:
        problemas.append("SUBEXPUESTA")
    if brillo > 210 or quemados > 0.3:
        problemas.append("SOBREEXPUESTA")
    puntaje = 3 - len(problemas)
    calidad = "BUENA" if puntaje >= 3 else "ACEPTABLE" if puntaje == 2 else "BAJA"
    return {
        "calidad_imagen": calidad, "resolucion": f"{w}x{h}", "megapixeles": round(w * h / 1e6, 2),
        "orientacion": "HORIZONTAL" if w >= h else "VERTICAL", "nitidez_laplaciano": round(nitidez, 1),
        "desenfocada": nitidez < 60, "brillo_medio": round(brillo, 1), "pct_oscuro": round(oscuros * 100, 1),
        "pct_sobreexpuesto": round(quemados * 100, 1), "pct_imagen_util": round(util * 100, 1),
        "texto_legible": bool(conf_txt) and conf_media >= 0.6, "confianza_media_ocr": round(conf_media, 3) if conf_media else None,
        "coordenada_legible": hay_coordenada_legible, "problemas": problemas,
    }


def sha256(datos: bytes):
    return hashlib.sha256(datos).hexdigest()


def phash(bgr, tam=32, bajo=8):
    """Hash perceptual DCT de 64 bits (hex)."""
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    g = cv2.resize(g, (tam, tam), interpolation=cv2.INTER_AREA).astype(np.float32)
    d = cv2.dct(g)[:bajo, :bajo]
    med = np.median(d.flatten()[1:])
    bits = (d > med).flatten()
    return "%016x" % int("".join("1" if b else "0" for b in bits), 2)


def dhash(bgr):
    g = cv2.resize(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY), (9, 8), interpolation=cv2.INTER_AREA)
    bits = (g[:, 1:] > g[:, :-1]).flatten()
    return "%016x" % int("".join("1" if b else "0" for b in bits), 2)


def hamming(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")
