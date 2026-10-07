const SheetService = {
  obtenerHoja: function() {
    const ss = SpreadsheetApp.openById(CONFIG.SHEETS.SPREADSHEET_ID);
    let sheet = ss.getSheetByName(CONFIG.SHEETS.SHEET_NAME);
    if (!sheet) {
      sheet = ss.getSheets()[0]; // Fallback a la primera hoja si el nombre difiere
    }

    // Inicializar encabezados si la hoja está completamente vacía
    if (sheet.getLastRow() === 0 && CONFIG.SHEETS.EXPECTED_COLUMNS) {
      sheet.appendRow(CONFIG.SHEETS.EXPECTED_COLUMNS);
      sheet.getRange(1, 1, 1, CONFIG.SHEETS.EXPECTED_COLUMNS.length).setFontWeight("bold");
    }

    return sheet;
  },

  /**
   * Inserta una fila respetando estrictamente el orden de las 17 columnas
   * Protegido con LockService atómico para prevenir duplicidad de IDs en accesos concurrentes
   */
  registrarFotografia: function(datosFila) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000); // Esperar hasta 20 segundos para asegurar atomicidad

    try {
      const sheet = this.obtenerHoja();
      const idGenerado = generarIdFotografia(sheet);

      // Mapeo exacto de las 17 columnas:
      // [ID, Fecha, Hora, Latitud, Longitud, Municipio, Código vía, Frente, 
      //  Tipo elemento, Categoría, Descripción, Archivo, Observación, File ID, URL, Usuario, Fecha registro]
      const fila = [
        idGenerado,
        datosFila.fecha || "",
        datosFila.hora || "",
        datosFila.latitud !== "" && datosFila.latitud !== undefined ? datosFila.latitud : "",
        datosFila.longitud !== "" && datosFila.longitud !== undefined ? datosFila.longitud : "",
        datosFila.municipio || "",
        datosFila.codigoVia || "",
        datosFila.frente || "",
        datosFila.tipoElemento || "",
        datosFila.categoria || "",
        datosFila.descripcion || "",
        datosFila.archivo || "",
        datosFila.observacion || "",
        datosFila.fileId || "",
        datosFila.url || "",
        datosFila.usuario || "usuario_no_autenticado",
        datosFila.fechaRegistro || ""
      ];

      sheet.appendRow(fila);
      SpreadsheetApp.flush(); // Forzar escritura inmediata en Google Sheets
      return idGenerado;
    } finally {
      lock.releaseLock();
    }
  }
};