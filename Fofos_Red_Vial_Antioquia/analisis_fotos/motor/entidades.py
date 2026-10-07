"""Extracción de entidades desde texto OCR: municipios, vías, PR/km, contratos,
instituciones, empresas y placas. El texto se extrae exactamente como aparece; la
forma normalizada se guarda aparte."""
import difflib
import re

from .textos import sin_tildes

MUNICIPIOS_ANTIOQUIA = [
    "Abejorral", "Abriaquí", "Alejandría", "Amagá", "Amalfi", "Andes", "Angelópolis", "Angostura", "Anorí", "Anzá",
    "Apartadó", "Arboletes", "Argelia", "Armenia", "Barbosa", "Bello", "Belmira", "Betania", "Betulia", "Briceño",
    "Buriticá", "Cáceres", "Caicedo", "Caldas", "Campamento", "Cañasgordas", "Caracolí", "Caramanta", "Carepa",
    "El Carmen de Viboral", "Carolina del Príncipe", "Caucasia", "Chigorodó", "Cisneros", "Ciudad Bolívar", "Cocorná",
    "Concepción", "Concordia", "Copacabana", "Dabeiba", "Donmatías", "Ebéjico", "El Bagre", "El Peñol", "El Retiro",
    "El Santuario", "Entrerríos", "Envigado", "Fredonia", "Frontino", "Giraldo", "Girardota", "Gómez Plata", "Granada",
    "Guadalupe", "Guarne", "Guatapé", "Heliconia", "Hispania", "Itagüí", "Ituango", "Jardín", "Jericó", "La Ceja",
    "La Estrella", "La Pintada", "La Unión", "Liborina", "Maceo", "Marinilla", "Medellín", "Montebello", "Murindó",
    "Mutatá", "Nariño", "Nechí", "Necoclí", "Olaya", "Peque", "Pueblorrico", "Puerto Berrío", "Puerto Nare",
    "Puerto Triunfo", "Remedios", "Rionegro", "Sabanalarga", "Sabaneta", "Salgar", "San Andrés de Cuerquia",
    "San Carlos", "San Francisco", "San Jerónimo", "San José de la Montaña", "San Juan de Urabá", "San Luis",
    "San Pedro de los Milagros", "San Pedro de Urabá", "San Rafael", "San Roque", "San Vicente Ferrer",
    "Santa Bárbara", "Santa Fe de Antioquia", "Santa Rosa de Osos", "Santo Domingo", "Segovia", "Sonsón", "Sopetrán",
    "Támesis", "Tarazá", "Tarso", "Titiribí", "Toledo", "Turbo", "Uramita", "Urrao", "Valdivia", "Valparaíso",
    "Vegachí", "Venecia", "Vigía del Fuerte", "Yalí", "Yarumal", "Yolombó", "Yondó", "Zaragoza",
]
ALIAS = {"Peñol": "El Peñol", "Retiro": "El Retiro", "Santuario": "El Santuario", "Carmen de Viboral": "El Carmen de Viboral",
         "Santafé de Antioquia": "Santa Fe de Antioquia", "Don Matías": "Donmatías", "San Vicente": "San Vicente Ferrer",
         "Entrerrios": "Entrerríos", "Bagre": "El Bagre"}
# Nombres que existen también en otros departamentos: menor confianza
AMBIGUOS = {"Andes", "Armenia", "Caldas", "Granada", "Nariño", "Barbosa", "Betania", "Concordia", "Toledo", "Venecia",
            "Argelia", "La Unión", "San Luis", "San Carlos", "San Francisco", "Guadalupe", "Olaya", "Giraldo",
            "Salgar", "La Estrella", "Turbo", "Bello", "Hispania", "Maceo", "Montebello", "Remedios", "Segovia"}

_NOMBRES = {sin_tildes(m).lower(): m for m in MUNICIPIOS_ANTIOQUIA}
_NOMBRES.update({sin_tildes(a).lower(): m for a, m in ALIAS.items()})

INSTITUCIONES = {
    "Gobernación de Antioquia": [r"gobernaci[oó]n\s+de\s+antioquia", r"gobernacion\s*de\s*antioquia"],
    "Secretaría de Infraestructura Física": [r"secretar[ií]a\s+de\s+infraestructura(\s+f[ií]sica)?"],
    "Rentan (Empresa de Vivienda/Rentas de Antioquia)": [r"\brentan\b"],
    "Atención de Emergencias Viales": [r"atenci[oó]n\s+de\s+emergencias?(\s+viales)?"],
    "INVÍAS": [r"\binv[ií]as\b"], "ANI": [r"\bagencia\s+nacional\s+de\s+infraestructura\b"],
    "DAPARD": [r"\bdapard\b"], "Alcaldía": [r"\balcald[ií]a\s+de\s+[a-záéíóúñ ]+"],
    "IDEA": [r"\binstituto\s+para\s+el\s+desarrollo\s+de\s+antioquia\b"],
}
RX_EMPRESA = re.compile(r"\b((?:consorcio|uni[oó]n\s+temporal|u\.?\s?t\.?)\s+[A-Za-zÁÉÍÓÚÑáéíóúñ0-9&.\- ]{2,40}|"
                        r"[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ&.\- ]{2,40}\s(?:S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|LTDA\.?))", re.I)
RX_INTERVENTORIA = re.compile(r"interventor[ií]a\s*[:\-]?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ0-9&.\- ]{3,50})", re.I)
RX_CONTRATO = re.compile(r"(?:contrato|cto\.?|convenio)\s*(?:de\s+obra\s*)?(?:n[oº°.]*|#|num\.?|número)?\s*[:\-]?\s*([0-9]{4,12}(?:[-/][0-9]{2,4})?)", re.I)
RX_PROYECTO = re.compile(r"(?:proyecto|programa|obra)\s*[:\-]\s*([^\n|]{4,80})", re.I)
RX_COD_VIA = re.compile(r"\b(\d{2}\s?[A-Z]{2}\s?\d{2}(?:-\d)?)\b")  # p. ej. 60AN08, 25AN17
RX_PR = re.compile(r"\bPR\s*(\d{1,4})\s*\+\s*(\d{1,4})\b", re.I)
RX_KM = re.compile(r"\b(?:K|KM)\s*(\d{1,4})\s*\+\s*(\d{1,4})\b|\bkm\.?\s*(\d{1,4}(?:[.,]\d+)?)\b", re.I)
RX_VIA = re.compile(r"\b(?:v[ií]a|carretera|ruta|tramo)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .\-]{3,60}?)(?=$|[,;|\n]|\s{2,}|\s(?:pr|km|k)\s?\d)", re.I)
RX_VEREDA = re.compile(r"\bvereda\s+([A-ZÁÉÍÓÚÑa-záéíóúñ .]{3,40})", re.I)
RX_SECTOR = re.compile(r"\bsector\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9 .]{3,40})", re.I)
RX_PLACA = re.compile(r"\b([A-Z]{3}[\s\-]?\d{3}|[A-Z]{3}[\s\-]?\d{2}[A-Z])\b")


def detectar_municipios(texto):
    """Coincidencias exactas (palabra completa) y difusas tolerantes a errores OCR."""
    res = {}
    tn = sin_tildes(texto).lower()
    palabras = re.findall(r"[a-zñ]+", tn)
    for clave, nombre in _NOMBRES.items():
        if re.search(rf"(?<![a-z]){re.escape(clave)}(?![a-z])", tn):
            res[nombre] = max(res.get(nombre, 0), 0.65 if nombre in AMBIGUOS else 0.85)
    # Difuso por n-gramas de 1-4 palabras (solo nombres largos para evitar falsos positivos)
    for n in (1, 2, 3, 4):
        for i in range(len(palabras) - n + 1):
            gram = " ".join(palabras[i:i + n])
            if len(gram) < 6:
                continue
            m = difflib.get_close_matches(gram, _NOMBRES.keys(), n=1, cutoff=0.88)
            if m:
                nombre = _NOMBRES[m[0]]
                if nombre not in res:
                    res[nombre] = 0.55
    return [{"valor": k, "confianza": v, "fuente": "OCR"} for k, v in sorted(res.items(), key=lambda x: -x[1])]


def extraer(texto):
    t = texto or ""
    tn = sin_tildes(t)
    inst = []
    for nombre, pats in INSTITUCIONES.items():
        for p in pats:
            m = re.search(p, tn, re.I)
            if m:
                inst.append({"valor": nombre, "texto_original": t[m.start():m.end()], "confianza": 0.9, "fuente": "OCR"})
                break
    empresas = [{"valor": m.group(1).strip(), "confianza": 0.75, "fuente": "OCR"} for m in RX_EMPRESA.finditer(t)]
    empresas += [{"valor": m.group(1).strip(), "rol": "INTERVENTORIA", "confianza": 0.75, "fuente": "OCR"}
                 for m in RX_INTERVENTORIA.finditer(t)]
    km = []
    for m in RX_KM.finditer(t):
        km.append({"valor": f"K{m.group(1)}+{m.group(2)}" if m.group(1) else f"km {m.group(3)}", "texto_original": m.group(0)})
    return {
        "municipios": detectar_municipios(t),
        "instituciones": inst,
        "empresas": empresas,
        "contratos": [{"valor": m.group(1), "texto_original": m.group(0), "confianza": 0.85, "fuente": "OCR"} for m in RX_CONTRATO.finditer(t)],
        "proyectos": [{"valor": m.group(1).strip(), "confianza": 0.7, "fuente": "OCR"} for m in RX_PROYECTO.finditer(t)],
        "codigos_via": [{"valor": re.sub(r"\s", "", m.group(1)), "confianza": 0.7, "fuente": "OCR"} for m in RX_COD_VIA.finditer(t)],
        "pr": [{"valor": f"PR{m.group(1)}+{m.group(2)}", "texto_original": m.group(0), "fuente": "OCR"} for m in RX_PR.finditer(t)],
        "km": km,
        "vias": [{"valor": m.group(1).strip(), "texto_original": m.group(0).strip(), "fuente": "OCR"} for m in RX_VIA.finditer(t)],
        "veredas": [{"valor": m.group(1).strip(), "fuente": "OCR"} for m in RX_VEREDA.finditer(t)],
        "sectores": [{"valor": m.group(1).strip(), "fuente": "OCR"} for m in RX_SECTOR.finditer(t)],
        "placas": [{"valor": re.sub(r"[\s\-]", "", m.group(1)), "fuente": "OCR"} for m in RX_PLACA.finditer(t)],
    }
