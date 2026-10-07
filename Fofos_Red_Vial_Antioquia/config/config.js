const CONFIG = {
  // Endpoint de Google Apps Script (Versión 3 activa)
  API_URL: "https://script.google.com/macros/s/AKfycbylMwsVSXI3V_dtPysPnV9VxnB4ajhwlh64GTAfwptdsxvcYAGEeWnBkq2lfT0KrjvNYA/exec",
  
  LIMITS: {
    MAX_FILE_SIZE_MB: 20,
    ALLOWED_MIME_TYPES: ["image/jpeg", "image/png", "image/webp"]
  },
  
  DEFAULT_USER: "usuario_no_autenticado",

  // Opciones de optimización y compresión en cliente para campo
  OPTIMIZATION: {
    ENABLE_CLIENT_RESIZE: true, // Optimiza imágenes gigantes de smartphones para carga ultrarrápida
    MAX_DIMENSION_PX: 2048,      // Mantiene nitidez total para ingeniería e inspección
    JPEG_QUALITY: 0.85
  },

  // Configuración del Módulo GIS y Visor Geográfico
  GIS: {
    DEFAULT_CENTER: [6.55, -75.50], // Coordenadas centrales de Antioquia
    DEFAULT_ZOOM: 8,
    MIN_ZOOM: 6,
    MAX_ZOOM: 19,
    GEOJSON_PATHS: {
      ROADS: "data/roads.geojson",
      MUNICIPIOS: "data/municipios.geojson",
      SUBREGIONES: "data/subregiones.geojson",
      SAMPLE_PHOTOS: "data/samplePhotos.geojson"
    },
    COLORS: {
      PRIMARY_ROAD: "#d97706",    // Rojo dorado / ámbar institucional
      SECONDARY_ROAD: "#0a4a2b",  // Verde oscuro institucional Gobernación
      TERTIARY_ROAD: "#167a47",   // Verde esmeralda
      SUBREGION_BORDER: "#0a4a2b",
      PHOTO_PIN: "#0a4a2b"
    }
  }
};