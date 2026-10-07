"""Preprocesamiento: genera versiones de la imagen para OCR (sin recortes fijos).

Todas las versiones cubren la imagen COMPLETA. Los únicos recortes que se hacen son
de regiones descubiertas dinámicamente por el detector de texto (ver `recortar_region`).
"""
import cv2
import numpy as np


def pil_a_bgr(img):
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def gris(bgr):
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)


def contraste(bgr):
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def nitidez(bgr):
    blur = cv2.GaussianBlur(bgr, (0, 0), 3)
    return cv2.addWeighted(bgr, 1.6, blur, -0.6, 0)


def sin_ruido(bgr):
    return cv2.fastNlMeansDenoisingColored(bgr, None, 6, 6, 7, 21)


def ampliar(bgr, factor=2):
    return cv2.resize(bgr, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)


def texto_claro_binario(bgr):
    """Realza texto blanco superpuesto (sellos de apps de cámara) sobre fondo variable."""
    g = gris(bgr)
    tophat = cv2.morphologyEx(g, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25)))
    _, th = cv2.threshold(tophat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return cv2.cvtColor(255 - th, cv2.COLOR_GRAY2BGR)


def estimar_inclinacion(bboxes_poligonos):
    """Ángulo medio (grados) de las líneas de texto detectadas (polígonos de 4 puntos)."""
    angs = []
    for p in bboxes_poligonos:
        if p is None or len(p) < 2:
            continue
        (x1, y1), (x2, y2) = p[0], p[1]
        if abs(x2 - x1) > 5:
            angs.append(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
    return float(np.median(angs)) if angs else 0.0


def rotar(bgr, angulo):
    h, w = bgr.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angulo, 1.0)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos), int(h * cos + w * sin)
    M[0, 2] += nw / 2 - w / 2
    M[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(bgr, M, (nw, nh), flags=cv2.INTER_CUBIC, borderValue=(255, 255, 255)), M


def recortar_region(bgr, bbox, margen=0.35):
    """Recorta una región DESCUBIERTA por el OCR (nunca coordenadas fijas)."""
    h, w = bgr.shape[:2]
    x1, y1, x2, y2 = bbox
    mh = (y2 - y1) * margen + 4
    mw = (x2 - x1) * 0.05 + mh
    X1, Y1 = int(max(0, x1 - mw)), int(max(0, y1 - mh))
    X2, Y2 = int(min(w, x2 + mw)), int(min(h, y2 + mh))
    return bgr[Y1:Y2, X1:X2], (X1, Y1)


VERSIONES = {
    "original": lambda b: b,
    "ampliada_2x": lambda b: ampliar(b, 2),
    "contraste": contraste,
    "texto_claro": texto_claro_binario,
    "nitidez": nitidez,
    "gris": lambda b: cv2.cvtColor(gris(b), cv2.COLOR_GRAY2BGR),
    "sin_ruido": sin_ruido,
}
ESCALA = {"ampliada_2x": 2.0}
