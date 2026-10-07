const UI = {
  renderizarTarjetas: function(listaFotos) {
    const contenedor = document.getElementById("photoGrid");
    contenedor.innerHTML = "";

    if (listaFotos.length === 0) {
      contenedor.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-muted); background: white; border-radius: 8px; border: 1px dashed var(--border-color);">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">📷</div>
          <h3>No hay fotografías seleccionadas</h3>
          <p>Haga clic en <strong>Examinar Archivos</strong> o arrastre fotos al recuadro superior.</p>
        </div>
      `;
      return;
    }

    listaFotos.forEach((item) => {
      const card = document.createElement("div");
      card.className = `photo-card ${item.estado === 'success' ? 'card-success' : ''}`;
      card.id = `card-${item.uid}`;

      const pesoKB = (item.file.size / 1024).toFixed(1);
      const isSuccess = item.estado === "success";

      const badgeExif = item.tieneExifGps 
        ? `<div class="badge-exif" title="Coordenadas GPS extraídas automáticamente de los metadatos de la fotografía">📍 GPS EXIF</div>` 
        : '';

      const linkMapa = (item.latitud && item.longitud)
        ? `<a href="https://www.google.com/maps?q=${item.latitud},${item.longitud}" target="_blank" rel="noopener" class="link-mapa" title="Ver en Google Maps">🗺️ Abrir mapa</a>`
        : '';

      card.innerHTML = `
        <div class="photo-preview-pane">
          <img src="${item.previewUrl}" alt="Preview" />
          <div class="file-info">
            <strong>${item.file.name}</strong><br/>
            ${pesoKB} KB
            ${badgeExif}
          </div>
        </div>

        <div class="photo-form-pane">
          <div class="form-group">
            <label>* Contrato:</label>
            <input type="text" placeholder="Ej: 4600018621" value="${item.contrato || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'contrato', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'contrato', this.value)" />
          </div>

          <div class="form-group">
            <label>* Vía:</label>
            <input type="text" placeholder="Ej: Vía Camilo C - Fredonia" value="${item.via || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'via', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'via', this.value)" />
          </div>

          <div class="form-group">
            <label>Municipio:</label>
            <input type="text" placeholder="Ej: Amagá, Jericó, Andes" value="${item.municipio || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'municipio', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'municipio', this.value)" />
          </div>

          <div class="form-group">
            <label>Código Vía:</label>
            <input type="text" placeholder="Ej: 25AN01, 6004" value="${item.codigoVia || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'codigoVia', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'codigoVia', this.value)" />
          </div>

          <div class="form-group">
            <label>Frente:</label>
            <input type="text" placeholder="Ej: Frente 1, Km 12+500" value="${item.frente || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'frente', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'frente', this.value)" />
          </div>

          <div class="form-group">
            <label>Tipo Elemento:</label>
            <input type="text" placeholder="Ej: Calzada, Pavimento, Cuneta" value="${item.tipoElemento || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'tipoElemento', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'tipoElemento', this.value)" />
          </div>

          <div class="form-group">
            <label>Categoría:</label>
            <input type="text" placeholder="Ej: Mantenimiento, Inspección" value="${item.categoria || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'categoria', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'categoria', this.value)" />
          </div>

          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <label style="margin:0;">Latitud:</label>
              ${!isSuccess ? `<button type="button" class="btn-mini-gps" onclick="window.AppEvents.capturarGps('${item.uid}')" title="Capturar coordenadas GPS desde el dispositivo">📍 Mi GPS</button>` : ''}
            </div>
            <input type="number" step="any" placeholder="Ej: 6.25000" id="lat-${item.uid}" value="${item.latitud || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'latitud', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'latitud', this.value)" />
          </div>

          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <label style="margin:0;">Longitud:</label>
              <span id="map-link-container-${item.uid}">${linkMapa}</span>
            </div>
            <input type="number" step="any" placeholder="Ej: -75.56000" id="lng-${item.uid}" value="${item.longitud || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'longitud', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'longitud', this.value)" />
          </div>

          <div class="form-group full-width">
            <label>Descripción:</label>
            <input type="text" placeholder="Descripción del estado, obra o elemento vial..." value="${item.descripcion || ''}" 
                   ${isSuccess ? 'disabled' : ''}
                   oninput="window.AppEvents.actualizarDato('${item.uid}', 'descripcion', this.value)"
                   onchange="window.AppEvents.actualizarDato('${item.uid}', 'descripcion', this.value)" />
          </div>

          <div class="form-group full-width">
            <label>Observación:</label>
            <textarea rows="2" placeholder="Observaciones técnicas adicionales..." 
                      ${isSuccess ? 'disabled' : ''}
                      oninput="window.AppEvents.actualizarDato('${item.uid}', 'observacion', this.value)"
                      onchange="window.AppEvents.actualizarDato('${item.uid}', 'observacion', this.value)">${item.observacion || ''}</textarea>
          </div>

          <div class="card-footer">
            <span class="status-badge ${this.obtenerClaseEstado(item.estado)}" id="status-${item.uid}">
              ${item.mensajeEstado || 'Pendiente de validación'}
            </span>
            <div style="display:flex; gap:8px;">
              ${!isSuccess ? `<button class="btn-delete" onclick="window.AppEvents.eliminar('${item.uid}')">Eliminar</button>` : `<span style="font-size:0.8rem;color:var(--success-color);font-weight:600;">✓ Guardado</span>`}
            </div>
          </div>
        </div>
      `;
      contenedor.appendChild(card);
    });
  },

  obtenerClaseEstado: function(estado) {
    switch (estado) {
      case "uploading": return "status-uploading";
      case "success": return "status-success";
      case "error": return "status-error";
      default: return "status-pending";
    }
  },

  actualizarEstadoTarjeta: function(uid, estado, mensaje, detalleUrl) {
    const badge = document.getElementById(`status-${uid}`);
    const card = document.getElementById(`card-${uid}`);
    if (!badge) return;

    badge.className = `status-badge ${this.obtenerClaseEstado(estado)}`;
    
    if (estado === "success") {
      if (card) card.classList.add("card-success");
      if (detalleUrl) {
        badge.innerHTML = `${mensaje} - <a href="${detalleUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;font-weight:bold;">Ver en Drive ↗</a>`;
      } else {
        badge.innerText = mensaje;
      }
    } else {
      badge.innerText = mensaje;
    }
  },

  mostrarResumenFinal: function(total, subidas, errores, fallos) {
    const contenedor = document.getElementById("summarySection");
    contenedor.style.display = "block";
    
    let htmlErrores = "";
    if (fallos.length > 0) {
      htmlErrores = `<h4 style="margin-top:14px;color:var(--error-color);">Detalle de errores detectados:</h4><ul style="margin-top:6px;padding-left:20px;font-size:0.9rem;">`;
      fallos.forEach(f => {
        htmlErrores += `<li style="margin-bottom:4px;"><strong>${f.archivo}:</strong> ${f.motivo}</li>`;
      });
      htmlErrores += `</ul>`;
    }

    contenedor.innerHTML = `
      <div class="summary-box">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <h3>📊 Resumen de Subida a Google Apps Script</h3>
          <button class="btn-clear-completed" onclick="window.AppEvents.limpiarSubidasExitosas()">Limpiar fotos ya subidas</button>
        </div>
        <div style="display:flex; gap:20px; margin-top:12px; flex-wrap:wrap;">
          <div>Total procesadas: <strong>${total}</strong></div>
          <div style="color:var(--success-color);">Subidas con éxito: <strong>${subidas}</strong></div>
          <div style="color:var(--error-color);">Con inconveniente: <strong>${errores}</strong></div>
        </div>
        ${htmlErrores}
      </div>
    `;

    // Desplazar suavemente hacia el resumen
    contenedor.scrollIntoView({ behavior: 'smooth' });
  }
};