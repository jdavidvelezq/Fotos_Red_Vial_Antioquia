/**
 * Fotos Red Vial Antioquia - DriveService
 * Servicio de gestión de almacenamiento en Google Drive y funciones utilitarias.
 */

const DriveService = {
  /**
   * Obtiene la carpeta raíz configurada en Google Drive
   */
  obtenerCarpetaRaiz: function() {
    const rootId = CONFIG.DRIVE.ROOT_FOLDER_ID;
    if (!rootId) {
      throw new Error("CONFIG.DRIVE.ROOT_FOLDER_ID no está configurado.");
    }
    return DriveApp.getFolderById(rootId);
  },

  /**
   * Busca una subcarpeta por nombre o la crea si no existe
   */
  obtenerOCrearSubcarpeta: function(carpetaPadre, nombre) {
    const carpetas = carpetaPadre.getFoldersByName(nombre);
    if (carpetas.hasNext()) {
      return carpetas.next();
    }
    return carpetaPadre.createFolder(nombre);
  },

  /**
   * Resuelve o crea la estructura jerárquica de carpetas:
   * Raíz > Contrato_[contrato] > Via_[via]
   */
  resolverCarpetaDestino: function(contrato, via) {
    const carpetaRaiz = this.obtenerCarpetaRaiz();

    // Sanitizar nombres para evitar caracteres inválidos en rutas
    const nombreContrato = `Contrato_${(contrato || "SIN_CONTRATO").toString().trim().replace(/[/\\:*?"<>|]/g, '_')}`;
    const carpetaContrato = this.obtenerOCrearSubcarpeta(carpetaRaiz, nombreContrato);

    const nombreVia = `Via_${(via || "SIN_VIA").toString().trim().replace(/[/\\:*?"<>|]/g, '_')}`;
    const carpetaVia = this.obtenerOCrearSubcarpeta(carpetaContrato, nombreVia);

    return {
      carpetaContrato: carpetaContrato,
      carpetaVia: carpetaVia
    };
  },

  /**
   * Convierte Base64 a Blob y guarda el archivo en Google Drive con sanitización de nombre
   */
  guardarArchivo: function(carpetaDestino, base64Data, nombreArchivo, mimeType, descripcion) {
    const nombreLimpio = (nombreArchivo || "foto_inspeccion.jpg").toString().replace(/[/\\:*?"<>|]/g, '_');
    const bytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(bytes, mimeType || "image/jpeg", nombreLimpio);
    const archivo = carpetaDestino.createFile(blob);

    if (descripcion) {
      archivo.setDescription(descripcion);
    }

    // Configurar acceso para visualización con enlace
    try {
      archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      // Ignorar si la organización restringe compartir fuera del dominio
    }

    return {
      fileId: archivo.getId(),
      url: archivo.getUrl(),
      nombre: archivo.getName()
    };
  }
};

/**
 * Genera un ID único correlativo para la fotografía en formato F-000001
 * Si la hoja ya tiene registros, incrementa basándose en la última fila.
 */
function generarIdFotografia(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return "F-000001";
  }
  const ultimoId = sheet.getRange(lastRow, 1).getValue().toString();
  const match = ultimoId.match(/F-(\d+)/);
  if (match) {
    const nuevoNumero = parseInt(match[1], 10) + 1;
    return "F-" + nuevoNumero.toString().padStart(6, '0');
  }
  return "F-" + (lastRow).toString().padStart(6, '0');
}

/**
 * Normaliza y valida coordenadas geográficas
 */
function validarCoordenadas(lat, lng) {
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") {
    return { valida: true, lat: "", lng: "" }; // Válido como vacío si no se suministra
  }
  const nLat = parseFloat(lat);
  const nLng = parseFloat(lng);
  if (isNaN(nLat) || isNaN(nLng)) {
    return { valida: false, error: "Coordenadas no numéricas." };
  }
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
    return { valida: false, error: "Rango de coordenadas geográficas fuera de límites (-90 a 90, -180 a 180)." };
  }
  return { valida: true, lat: nLat, lng: nLng };
}

/**
 * Obtiene timestamps formateados: AAAA-MM-DD y HH:MM:SS
 */
function obtenerTiempos(fechaIso) {
  const d = fechaIso ? new Date(fechaIso) : new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  
  const fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const fechaRegistro = `${fecha} ${hora}`;
  
  return { fecha, hora, fechaRegistro };
}

/**
 * Constructor de respuesta JSON uniforme
 */
function construirRespuestaJSON(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
