/**
 * Configuración central del Backend
 */
const CONFIG = {
  DRIVE: {
    // Carpeta principal: FOTOS RED VIAL ANTIOQUIA
    ROOT_FOLDER_ID: "1lYCuieLv_KLFjmbpqwQd88J2rCOFafuW"
  },
  SHEETS: {
    SPREADSHEET_ID: "1_mBkLvfsB6-55j4a9pNKMCc6W8OV6_KUjaDyGGVTJQ",
    SHEET_NAME: "Fotos_Red_Vial_Antioquia_DB",
    EXPECTED_COLUMNS: [
      "ID", "Fecha", "Hora", "Latitud", "Longitud", "Municipio", 
      "Código vía", "Frente", "Tipo elemento", "Categoría", 
      "Descripción", "Archivo", "Observación", "File ID", 
      "URL", "Usuario", "Fecha registro"
    ]
  },
  SECURITY: {
    MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024 // 25 MB máximo por imagen
  }
};