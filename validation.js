const Validation = {
  validarArchivo: function(file) {
    if (!file) {
      return { valido: false, error: "Archivo no seleccionado." };
    }
    if (!CONFIG.LIMITS.ALLOWED_MIME_TYPES.includes(file.type)) {
      return { valido: false, error: "Formato no permitido. Solo se aceptan JPEG, PNG o WebP." };
    }
    const maxBytes = CONFIG.LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return { valido: false, error: `El archivo supera el límite de ${CONFIG.LIMITS.MAX_FILE_SIZE_MB} MB.` };
    }
    return { valido: true };
  },

  validarCoordenadas: function(lat, lng) {
    const latVacia = (lat === "" || lat === undefined || lat === null);
    const lngVacia = (lng === "" || lng === undefined || lng === null);

    // Ambas vacías es válido (campo opcional)
    if (latVacia && lngVacia) {
      return { valido: true };
    }

    // Una llena y la otra vacía es inválido
    if (latVacia !== lngVacia) {
      return { valido: false, error: "Debe ingresar ambas coordenadas (latitud y longitud) o dejar ambas vacías." };
    }

    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    if (isNaN(nLat) || isNaN(nLng)) {
      return { valido: false, error: "Las coordenadas deben ser números decimales válidos." };
    }
    if (nLat < -90 || nLat > 90) {
      return { valido: false, error: "La latitud debe estar en el rango [-90, 90]." };
    }
    if (nLng < -180 || nLng > 180) {
      return { valido: false, error: "La longitud debe estar en el rango [-180, 180]." };
    }

    return { valido: true };
  },

  validarDatosFoto: function(fotoItem) {
    if (!fotoItem.contrato || !fotoItem.contrato.toString().trim()) {
      return { valido: false, error: "El campo 'Contrato' es obligatorio." };
    }
    if (!fotoItem.via || !fotoItem.via.toString().trim()) {
      return { valido: false, error: "El campo 'Vía' es obligatorio." };
    }
    const coordVal = this.validarCoordenadas(fotoItem.latitud, fotoItem.longitud);
    if (!coordVal.valido) return coordVal;

    return { valido: true };
  }
};