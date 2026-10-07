/**
 * Fotos Red Vial Antioquia - PhotoViewer
 * Controlador del panel lateral de detalles de registros/vías y modal de galería fotográfica
 */

const PhotoViewer = {
  _listaActual: [],
  _indiceActual: 0,

  /**
   * Muestra la información técnica detallada de una fotografía en el panel derecho
   */
  mostrarDetallePunto(props, listaCompleta = []) {
    const contenedor = document.getElementById("gisDetailContent");
    if (!contenedor) return;

    this._listaActual = listaCompleta.length > 0 ? listaCompleta : [props];
    this._indiceActual = this._listaActual.findIndex(f => (f.properties?.id || f.id) === (props.properties?.id || props.id));
    if (this._indiceActual === -1) this._indiceActual = 0;

    const p = props.properties || props;
    const isDemo = p.isDemo ? `<span style="font-size:0.75rem; background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; font-weight:700; margin-left:6px;">MOCK / DEMO</span>` : '';

    const imgUrl = p.previewUrl || p.url_drive || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80";

    contenedor.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span class="record-badge-id">${p.id || 'REGISTRO'}</span>
        ${isDemo}
      </div>

      <div class="detail-photo-preview" onclick="PhotoViewer.abrirModalGaleriaActual()" title="Haga clic para ampliar fotografía">
        <img src="${imgUrl}" alt="Registro fotográfico ${p.id}" onerror="this.src='https://via.placeholder.com/600x400?text=Fotograf%C3%ADa+Red+Vial'" />
        <div class="detail-photo-overlay">🔍 Clic para ampliar fotografía</div>
      </div>

      <button type="button" class="btn-open-gallery" onclick="PhotoViewer.abrirModalGaleriaActual()">
        📷 Ver Fotografía en Galería
      </button>

      ${p.latitud && p.longitud ? `
        <a href="https://www.google.com/maps?q=${p.latitud},${p.longitud}" target="_blank" rel="noopener" class="btn-open-maps" style="margin-bottom:14px;">
          🗺️ Abrir en Google Maps
        </a>
      ` : ''}

      <table class="detail-table">
        <tbody>
          <tr><th>Vía:</th><td><strong>${p.nombre_via || 'No registrada'}</strong></td></tr>
          <tr><th>Código vía:</th><td>${p.codigo_via || 'Sin código'}</td></tr>
          <tr><th>Tipo de vía:</th><td>${p.tipo_via || 'No especificado'}</td></tr>
          <tr><th>Municipio:</th><td>${p.municipio || 'No especificado'}</td></tr>
          <tr><th>Subregión:</th><td>${p.subregion || 'No especificada'}</td></tr>
          <tr><th>Fecha:</th><td>${p.fecha || 'No registrada'} ${p.hora ? `(${p.hora})` : ''}</td></tr>
          <tr><th>Contrato:</th><td>${p.contrato || 'Sin contrato'}</td></tr>
          <tr><th>Frente / PR:</th><td>${p.frente || 'No registrado'}</td></tr>
          <tr><th>Elemento:</th><td>${p.tipo_elemento || 'General'}</td></tr>
          <tr><th>Categoría:</th><td>${p.categoria || 'Inspección'}</td></tr>
          <tr><th>Coordenadas:</th><td>${p.latitud || ''}, ${p.longitud || ''}</td></tr>
          <tr><th>Archivo:</th><td><small>${p.archivo || p.nombre_archivo || 'foto.jpg'}</small></td></tr>
        </tbody>
      </table>

      ${p.descripcion ? `
        <div style="margin-bottom:10px;">
          <strong style="font-size:0.8rem; color:#475569; text-transform:uppercase;">Descripción:</strong>
          <p style="font-size:0.85rem; color:#1e293b; background:#f8fafc; padding:8px; border-radius:6px; margin-top:4px; border:1px solid #e2e8f0;">
            ${p.descripcion}
          </p>
        </div>
      ` : ''}

      ${p.observacion ? `
        <div style="margin-bottom:12px;">
          <strong style="font-size:0.8rem; color:#475569; text-transform:uppercase;">Observación técnica:</strong>
          <p style="font-size:0.85rem; color:#1e293b; background:#f8fafc; padding:8px; border-radius:6px; margin-top:4px; border:1px solid #e2e8f0;">
            ${p.observacion}
          </p>
        </div>
      ` : ''}
    `;

    // En pantallas pequeñas, hacer visible el panel inferior
    const panel = document.getElementById("gisDetailPanel");
    if (panel && window.innerWidth <= 1024) {
      panel.classList.add("mobile-visible");
    }
  },

  /**
   * Muestra la información de un segmento vial seleccionado
   */
  mostrarDetalleVia(viaProps, fotosAsociadas = []) {
    const contenedor = document.getElementById("gisDetailContent");
    if (!contenedor) return;

    const p = viaProps || {};
    const cantFotos = fotosAsociadas.length;

    contenedor.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span class="record-badge-id" style="background:var(--accent-gold); color:#1a1a1a;">TRAMO DE RED VIAL</span>
      </div>

      <h3 style="font-size:1.1rem; color:var(--primary-dark); margin-bottom:8px;">${p.nombre_via || 'Vía sin nombre'}</h3>
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">Código: <strong>${p.codigo_via || 'N/A'}</strong></p>

      <table class="detail-table">
        <tbody>
          <tr><th>Tipo de vía:</th><td><strong>${p.tipo_via || 'Secundaria'}</strong></td></tr>
          <tr><th>Municipio:</th><td>${p.municipio || 'N/A'}</td></tr>
          <tr><th>Subregión:</th><td>${p.subregion || 'N/A'}</td></tr>
          <tr><th>Administrador:</th><td>${p.competente || 'Departamento de Antioquia'}</td></tr>
          <tr><th>Tramo:</th><td>${p.tramo_via || 'Completo'}</td></tr>
          <tr><th>Longitud:</th><td>${p.longitud_km ? `${p.longitud_km} km` : 'N/D'}</td></tr>
          <tr><th>Fotos registradas:</th><td><strong style="color:var(--primary-dark);">${cantFotos}</strong></td></tr>
        </tbody>
      </table>

      ${cantFotos > 0 ? `
        <button type="button" class="btn-open-gallery" onclick="FiltersModule.filtrarPorVia('${p.nombre_via || p.codigo_via}')">
          🔍 Filtrar y ver las ${cantFotos} fotografías
        </button>
      ` : `
        <div style="background:#f1f5f9; padding:10px; border-radius:6px; font-size:0.85rem; color:#64748b; text-align:center;">
          No hay fotografías registradas aún en este tramo vial.
        </div>
      `}
    `;

    const panel = document.getElementById("gisDetailPanel");
    if (panel && window.innerWidth <= 1024) {
      panel.classList.add("mobile-visible");
    }
  },

  /**
   * Abre el modal de galería con la foto actual
   */
  abrirModalGaleriaActual() {
    if (!this._listaActual || this._listaActual.length === 0) return;
    this.renderizarModalGaleria();
  },

  renderizarModalGaleria() {
    const modal = document.getElementById("galleryModal");
    if (!modal) return;

    const item = this._listaActual[this._indiceActual];
    if (!item) return;

    const p = item.properties || item;
    const imgUrl = p.previewUrl || p.url_drive || "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=1200&q=80";

    const modalBody = document.getElementById("galleryModalBody");
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="modal-gallery-controls">
          <button class="btn-nav-gallery" ${this._indiceActual === 0 ? 'disabled' : ''} onclick="PhotoViewer.fotoAnterior()">
            ◀ Anterior
          </button>
          <span style="font-size:0.85rem; font-weight:600; color:#475569;">
            Fotografía ${this._indiceActual + 1} de ${this._listaActual.length} (${p.id || ''})
          </span>
          <button class="btn-nav-gallery" ${this._indiceActual === this._listaActual.length - 1 ? 'disabled' : ''} onclick="PhotoViewer.fotoSiguiente()">
            Siguiente ▶
          </button>
        </div>

        <div class="modal-img-container">
          <img src="${imgUrl}" alt="Foto ${p.id}" onerror="this.src='https://via.placeholder.com/800x600?text=Fotograf%C3%ADa+Red+Vial'" />
        </div>

        <div style="width:100%; text-align:left; font-size:0.88rem; color:#334155;">
          <div style="display:flex; justify-content:space-between; flex-wrap:wrap; margin-bottom:6px;">
            <strong>${p.nombre_via || 'Vía'} (${p.codigo_via || 'Sin código'})</strong>
            <span>${p.municipio || ''} • ${p.subregion || ''}</span>
          </div>
          <div style="color:#64748b; font-size:0.82rem;">
            Fecha: ${p.fecha || ''} ${p.hora || ''} | Contrato: ${p.contrato || ''} | Frente: ${p.frente || 'N/A'} | Coords: ${p.latitud || ''}, ${p.longitud || ''}
          </div>
          ${p.observacion ? `<div style="margin-top:6px; background:#f8fafc; padding:8px; border-radius:4px;">${p.observacion}</div>` : ''}
        </div>
      `;
    }

    modal.style.display = "flex";
  },

  fotoAnterior() {
    if (this._indiceActual > 0) {
      this._indiceActual--;
      this.renderizarModalGaleria();
    }
  },

  fotoSiguiente() {
    if (this._indiceActual < this._listaActual.length - 1) {
      this._indiceActual++;
      this.renderizarModalGaleria();
    }
  },

  cerrarModalGaleria() {
    const modal = document.getElementById("galleryModal");
    if (modal) modal.style.display = "none";
  }
};
