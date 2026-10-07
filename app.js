let fotosSeleccionadas = [];

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("filePicker");
  const btnUpload = document.getElementById("btnUpload");
  const selectorBox = document.querySelector(".selector-box");
  const btnReplicate = document.getElementById("btnReplicateBatch");

  // Manejo de Drag and Drop en el contenedor de selección
  if (selectorBox) {
    ['dragenter', 'dragover'].forEach(eventName => {
      selectorBox.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectorBox.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      selectorBox.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectorBox.classList.remove('drag-over');
      });
    });

    selectorBox.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        procesarArchivosSeleccionados(files);
      }
    });
  }

  // Cambio en el selector de archivos nativo
  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      procesarArchivosSeleccionados(files);
      fileInput.value = ""; // Permitir volver a seleccionar los mismos archivos
    });
  }

  // Botón de subida
  if (btnUpload) {
    btnUpload.addEventListener("click", async () => {
      if (fotosSeleccionadas.length === 0) return;
      btnUpload.disabled = true;
      btnUpload.textContent = "SUBIENDO FOTOGRAFÍAS...";
      
      try {
        await Uploader.ejecutarCargaPorLotes(fotosSeleccionadas);
      } finally {
        refrescarVista();
        btnUpload.textContent = "SUBIR FOTOGRAFÍAS";
      }
    });
  }

  // Botón de aplicación masiva de Contrato y Vía a todas las fotos
  if (btnReplicate) {
    btnReplicate.addEventListener("click", () => {
      const contratoGlobal = (document.getElementById("batchContrato")?.value || "").trim();
      const viaGlobal = (document.getElementById("batchVia")?.value || "").trim();
      const municipioGlobal = (document.getElementById("batchMunicipio")?.value || "").trim();
      const frenteGlobal = (document.getElementById("batchFrente")?.value || "").trim();

      if (!contratoGlobal && !viaGlobal && !municipioGlobal && !frenteGlobal) {
        alert("Escriba al menos un dato (Contrato o Vía) en la barra de relleno rápido.");
        return;
      }

      fotosSeleccionadas.forEach(foto => {
        if (foto.estado !== "success") {
          if (contratoGlobal) foto.contrato = contratoGlobal;
          if (viaGlobal) foto.via = viaGlobal;
          if (municipioGlobal) foto.municipio = municipioGlobal;
          if (frenteGlobal) foto.frente = frenteGlobal;
        }
      });

      refrescarVista();
    });
  }

  // Advertencia si intenta salir con cargas pendientes o en curso
  window.addEventListener("beforeunload", (e) => {
    const hayEnCurso = fotosSeleccionadas.some(f => f.estado === "uploading");
    if (hayEnCurso) {
      e.preventDefault();
      e.returnValue = "Hay fotografías subiéndose actualmente. ¿Seguro que desea salir?";
    }
  });
});

/**
 * Procesa la lista de archivos seleccionados, valida y extrae metadatos EXIF
 */
async function procesarArchivosSeleccionados(files) {
  for (const file of files) {
    const val = Validation.validarArchivo(file);
    if (!val.valido) {
      alert(`${file.name}: ${val.error}`);
      continue;
    }

    const uid = "foto_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    
    // Objeto base
    const fotoItem = {
      uid: uid,
      file: file,
      previewUrl: URL.createObjectURL(file),
      contrato: "",
      via: "",
      municipio: "",
      codigoVia: "",
      frente: "",
      tipoElemento: "",
      categoria: "",
      descripcion: "",
      observacion: "",
      latitud: "",
      longitud: "",
      tieneExifGps: false,
      estado: "pending",
      mensajeEstado: "Pendiente"
    };

    // Si ya hay fotos previas, pre-heredar el Contrato y la Vía para ahorrar trabajo manual
    const ultimaFoto = fotosSeleccionadas[fotosSeleccionadas.length - 1];
    if (ultimaFoto) {
      fotoItem.contrato = ultimaFoto.contrato || "";
      fotoItem.via = ultimaFoto.via || "";
      fotoItem.municipio = ultimaFoto.municipio || "";
      fotoItem.frente = ultimaFoto.frente || "";
    }

    // Intentar extraer coordenadas GPS automáticamente del EXIF de la foto
    try {
      const exif = await Uploader.extraerExif(file);
      if (exif && exif.latitud && exif.longitud) {
        fotoItem.latitud = exif.latitud;
        fotoItem.longitud = exif.longitud;
        fotoItem.tieneExifGps = true;
      }
    } catch (e) {
      // Continuar sin EXIF si falla
    }

    fotosSeleccionadas.push(fotoItem);
  }

  refrescarVista();
}

function refrescarVista() {
  const btnUpload = document.getElementById("btnUpload");
  const countBadge = document.getElementById("selectedCount");
  const batchToolbar = document.getElementById("batchToolbar");
  
  const total = fotosSeleccionadas.length;
  const pendientes = fotosSeleccionadas.filter(f => f.estado !== "success").length;

  if (countBadge) {
    countBadge.innerText = `${total} fotos (${pendientes} pendientes)`;
  }

  if (btnUpload) {
    btnUpload.disabled = pendientes === 0;
  }

  if (batchToolbar) {
    batchToolbar.style.display = total > 0 ? "block" : "none";
  }

  UI.renderizarTarjetas(fotosSeleccionadas);
}

// Eventos globales consumidos desde UI
window.AppEvents = {
  eliminar: function(uid) {
    const item = fotosSeleccionadas.find(f => f.uid === uid);
    if (item && item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    fotosSeleccionadas = fotosSeleccionadas.filter(f => f.uid !== uid);
    refrescarVista();
  },

  actualizarDato: function(uid, campo, valor) {
    const item = fotosSeleccionadas.find(f => f.uid === uid);
    if (item) {
      item[campo] = valor;
      
      // Actualizar enlace de mapa dinámicamente si cambian coordenadas
      if (campo === 'latitud' || campo === 'longitud') {
        const linkCont = document.getElementById(`map-link-container-${uid}`);
        if (linkCont) {
          if (item.latitud && item.longitud) {
            linkCont.innerHTML = `<a href="https://www.google.com/maps?q=${item.latitud},${item.longitud}" target="_blank" rel="noopener" class="link-mapa">🗺️ Abrir mapa</a>`;
          } else {
            linkCont.innerHTML = "";
          }
        }
      }
    }
  },

  capturarGps: async function(uid) {
    const latInput = document.getElementById(`lat-${uid}`);
    const lngInput = document.getElementById(`lng-${uid}`);
    try {
      const coords = await Uploader.obtenerGpsNavegador();
      if (latInput) latInput.value = coords.lat;
      if (lngInput) lngInput.value = coords.lng;
      this.actualizarDato(uid, 'latitud', coords.lat);
      this.actualizarDato(uid, 'longitud', coords.lng);
    } catch (err) {
      alert(err.message);
    }
  },

  limpiarSubidasExitosas: function() {
    fotosSeleccionadas = fotosSeleccionadas.filter(f => f.estado !== "success");
    refrescarVista();
    const summary = document.getElementById("summarySection");
    if (summary) summary.style.display = "none";
  }
};