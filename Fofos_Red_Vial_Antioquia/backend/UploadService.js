const UploadService = {
  procesarFotografia: function(payload) {
    // 1. Validaciones iniciales de entrada
    if (!payload.base64) throw new Error("No se recibieron datos binarios de la imagen.");
    if (!payload.nombreArchivo) throw new Error("Nombre de archivo no especificado.");
    if (!payload.contrato || !payload.contrato.toString().trim()) throw new Error("El contrato es obligatorio.");
    if (!payload.via || !payload.via.toString().trim()) throw new Error("La vía es obligatoria.");

    const coords = validarCoordenadas(payload.latitud, payload.longitud);
    if (!coords.valida) throw new Error(coords.error);

    // 2. Resolver carpetas dinámicamente en Drive
    const carpetas = DriveService.resolverCarpetaDestino(payload.contrato, payload.via);

    // 3. Guardar archivo en la carpeta de la vía
    const metadataDesc = `Contrato: ${payload.contrato} | Vía: ${payload.via} | Lat: ${coords.lat} | Lng: ${coords.lng}`;
    const infoArchivo = DriveService.guardarArchivo(
      carpetas.carpetaVia, 
      payload.base64, 
      payload.nombreArchivo, 
      payload.mimeType || "image/jpeg",
      metadataDesc
    );

    // 4. Registrar en Google Sheets con captura de fallo parcial
    const tiempos = obtenerTiempos(payload.fechaCaptura);
    let idGenerado = null;
    
    try {
      idGenerado = SheetService.registrarFotografia({
        fecha: tiempos.fecha,
        hora: tiempos.hora,
        latitud: coords.lat,
        longitud: coords.lng,
        municipio: payload.municipio || "",
        codigoVia: payload.codigoVia || "",
        frente: payload.frente || "",
        tipoElemento: payload.tipoElemento || "",
        categoria: payload.categoria || "",
        descripcion: payload.descripcion || "",
        archivo: infoArchivo.nombre,
        observacion: payload.observacion || "",
        fileId: infoArchivo.fileId,
        url: infoArchivo.url,
        usuario: payload.usuario || "usuario_no_autenticado",
        fechaRegistro: tiempos.fechaRegistro
      });
    } catch (dbError) {
      // Inconsistencia controlada: el archivo quedó en Drive pero falló la BD
      return {
        status: "partial_error",
        errorType: "SHEET_WRITE_FAILED",
        message: "La fotografía se guardó en Drive pero falló el registro en Sheets: " + dbError.message,
        fileId: infoArchivo.fileId,
        url: infoArchivo.url,
        nombreArchivo: infoArchivo.nombre,
        contrato: payload.contrato,
        via: payload.via
      };
    }

    return {
      status: "success",
      id: idGenerado,
      fileId: infoArchivo.fileId,
      url: infoArchivo.url,
      nombreArchivo: infoArchivo.nombre,
      contrato: payload.contrato,
      via: payload.via,
      carpetaContratoId: carpetas.carpetaContrato.getId(),
      carpetaViaId: carpetas.carpetaVia.getId()
    };
  }
};