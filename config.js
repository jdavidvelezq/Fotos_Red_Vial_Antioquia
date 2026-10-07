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
  }
};