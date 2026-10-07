const Uploader = {
  /**
   * Extrae coordenadas GPS y fecha original del bloque EXIF de imágenes JPEG
   */
  extraerExif: function(file) {
    return new Promise((resolve) => {
      if (!file || (!file.type.includes("jpeg") && !file.type.includes("jpg"))) {
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const view = new DataView(e.target.result);
          if (view.getUint16(0, false) !== 0xFFD8) return resolve(null);

          let offset = 2;
          const length = view.byteLength;
          while (offset < length) {
            if (view.getUint8(offset) !== 0xFF) break;
            const marker = view.getUint8(offset + 1);
            if (marker === 0xE1) {
              const exifHeader = view.getUint32(offset + 4, false);
              if (exifHeader === 0x45786966) { // 'Exif'
                return resolve(this._parsearTiffExif(view, offset + 10));
              }
              break;
            } else {
              offset += 2 + view.getUint16(offset + 2, false);
            }
          }
          resolve(null);
        } catch (err) {
          resolve(null);
        }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file.slice(0, 131072)); // Analizar primeros 128 KB
    });
  },

  _parsearTiffExif: function(view, tiffStart) {
    const meta = {};
    const isLittle = (view.getUint16(tiffStart, false) === 0x4949);
    const ifdOffset = view.getUint32(tiffStart + 4, isLittle);
    if (ifdOffset < 8) return meta;

    const ifd0 = tiffStart + ifdOffset;
    const numEntries = view.getUint16(ifd0, isLittle);
    let gpsOffset = 0;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifd0 + 2 + (i * 12);
      const tag = view.getUint16(entryOffset, isLittle);
      if (tag === 0x8825) { // GPSInfo IFD
        gpsOffset = view.getUint32(entryOffset + 8, isLittle);
      }
    }

    if (gpsOffset > 0) {
      const gpsIfd = tiffStart + gpsOffset;
      const gpsEntries = view.getUint16(gpsIfd, isLittle);
      let latRef = "N", lonRef = "W";
      let rawLat = null, rawLon = null;

      for (let j = 0; j < gpsEntries; j++) {
        const entry = gpsIfd + 2 + (j * 12);
        const tag = view.getUint16(entry, isLittle);
        if (tag === 0x0001) latRef = String.fromCharCode(view.getUint8(entry + 8));
        else if (tag === 0x0002) rawLat = this._leerCoordRacional(view, tiffStart + view.getUint32(entry + 8, isLittle), isLittle);
        else if (tag === 0x0003) lonRef = String.fromCharCode(view.getUint8(entry + 8));
        else if (tag === 0x0004) rawLon = this._leerCoordRacional(view, tiffStart + view.getUint32(entry + 8, isLittle), isLittle);
      }

      if (rawLat && rawLon) {
        let lat = rawLat[0] + (rawLat[1] / 60) + (rawLat[2] / 3600);
        let lon = rawLon[0] + (rawLon[1] / 60) + (rawLon[2] / 3600);
        if (latRef === "S") lat = -lat;
        if (lonRef === "W") lon = -lon;
        meta.latitud = parseFloat(lat.toFixed(6));
        meta.longitud = parseFloat(lon.toFixed(6));
      }
    }
    return meta;
  },

  _leerCoordRacional: function(view, offset, isLittle) {
    try {
      const deg = (view.getUint32(offset, isLittle) / (view.getUint32(offset + 4, isLittle) || 1));
      const min = (view.getUint32(offset + 8, isLittle) / (view.getUint32(offset + 12, isLittle) || 1));
      const sec = (view.getUint32(offset + 16, isLittle) / (view.getUint32(offset + 20, isLittle) || 1));
      return [deg, min, sec];
    } catch (e) {
      return null;
    }
  },

  /**
   * Obtiene la posición GPS en vivo del dispositivo móvil o navegador
   */
  obtenerGpsNavegador: function() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("La geolocalización no está soportada en este navegador."));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: parseFloat(pos.coords.latitude.toFixed(6)),
          lng: parseFloat(pos.coords.longitude.toFixed(6))
        }),
        (err) => {
          let msg = "No se pudo obtener la ubicación GPS.";
          if (err.code === 1) msg = "Permiso de ubicación denegado por el usuario.";
          if (err.code === 2) msg = "Señal GPS no disponible actualmente.";
          if (err.code === 3) msg = "Tiempo de espera de GPS agotado.";
          reject(new Error(msg));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  },

  /**
   * Conversión a Base64 con optimización opcional de resolución para evitar sobrecarga de red en campo
   */
  convertirABase64: function(file) {
    return new Promise((resolve, reject) => {
      const opt = CONFIG.OPTIMIZATION || {};
      if (opt.ENABLE_CLIENT_RESIZE && file.type.startsWith("image/")) {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          let w = img.width;
          let h = img.height;
          const maxDim = opt.MAX_DIMENSION_PX || 2048;

          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);

          const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
          const quality = opt.JPEG_QUALITY || 0.85;
          const dataUrl = canvas.toDataURL(mime, quality);
          resolve(dataUrl.split(",")[1]);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          this._fallbackBase64(file).then(resolve).catch(reject);
        };
        img.src = url;
      } else {
        this._fallbackBase64(file).then(resolve).catch(reject);
      }
    });
  },

  _fallbackBase64: function(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = error => reject(error);
    });
  },

  /**
   * Ejecución de carga por lotes secuencial con reporte de estado individual
   */
  ejecutarCargaPorLotes: async function(listaFotos) {
    let subidas = 0;
    let errores = 0;
    const fallos = [];

    // Filtrar solo las que no estén ya subidas exitosamente
    const pendientes = listaFotos.filter(f => f.estado !== "success");

    if (pendientes.length === 0) {
      alert("Todas las fotografías seleccionadas ya fueron subidas exitosamente.");
      return;
    }

    for (let i = 0; i < pendientes.length; i++) {
      const item = pendientes[i];

      // 1. Validar requerimientos del formulario
      const validacion = Validation.validarDatosFoto(item);
      if (!validacion.valido) {
        errores++;
        item.estado = "error";
        item.mensajeEstado = validacion.error;
        UI.actualizarEstadoTarjeta(item.uid, "error", validacion.error);
        fallos.push({ archivo: item.file.name, motivo: validacion.error });
        continue;
      }

      // 2. Notificar inicio de subida individual
      item.estado = "uploading";
      item.mensajeEstado = "Comprimiendo y subiendo a Drive...";
      UI.actualizarEstadoTarjeta(item.uid, "uploading", "Subiendo a Drive y registrando en Sheets...");

      try {
        const base64Data = await this.convertirABase64(item.file);
        
        const payload = {
          nombreArchivo: item.file.name,
          mimeType: item.file.type || "image/jpeg",
          base64: base64Data,
          contrato: item.contrato,
          via: item.via,
          municipio: item.municipio || "",
          codigoVia: item.codigoVia || "",
          frente: item.frente || "",
          tipoElemento: item.tipoElemento || "",
          categoria: item.categoria || "",
          descripcion: item.descripcion || "",
          observacion: item.observacion || "",
          latitud: item.latitud || "",
          longitud: item.longitud || "",
          usuario: CONFIG.DEFAULT_USER || "usuario_no_autenticado",
          fechaCaptura: new Date().toISOString()
        };

        const res = await Api.subirFoto(payload);

        if (res.status === "success") {
          subidas++;
          item.estado = "success";
          item.urlDrive = res.url;
          item.mensajeEstado = `✓ Subida (${res.id || 'OK'})`;
          UI.actualizarEstadoTarjeta(item.uid, "success", `✓ Subida (${res.id || 'OK'})`, res.url);
        } else if (res.status === "partial_error") {
          errores++;
          item.estado = "error";
          item.urlDrive = res.url;
          const msg = `En Drive (${res.fileId}), pero falló Sheets.`;
          item.mensajeEstado = msg;
          UI.actualizarEstadoTarjeta(item.uid, "error", msg, res.url);
          fallos.push({ archivo: item.file.name, motivo: res.message });
        } else {
          errores++;
          item.estado = "error";
          const errDetalle = res.message || "Error desconocido devuelto por Apps Script";
          item.mensajeEstado = errDetalle;
          UI.actualizarEstadoTarjeta(item.uid, "error", errDetalle);
          fallos.push({ archivo: item.file.name, motivo: errDetalle });
        }
      } catch (err) {
        errores++;
        item.estado = "error";
        item.mensajeEstado = err.message || "Fallo en transferencia";
        UI.actualizarEstadoTarjeta(item.uid, "error", item.mensajeEstado);
        fallos.push({ archivo: item.file.name, motivo: item.mensajeEstado });
      }
    }

    UI.mostrarResumenFinal(pendientes.length, subidas, errores, fallos);
  }
};