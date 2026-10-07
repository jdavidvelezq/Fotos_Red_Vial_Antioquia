/**
 * Fotos Red Vial Antioquia - MapModule
 * Inicializador y controlador del mapa geográfico Leaflet, capas vectoriales y marcadores
 */

const MapModule = {
  map: null,
  layers: {
    calles: null,
    satelite: null,
    subregiones: null,
    municipios: null,
    vias: null,
    clusterFotos: null
  },
  _fotosData: [],
  _viasData: [],

  /**
   * Inicializa el mapa Leaflet en el contenedor indicado
   */
  inicializar(contenedorId = "gisMap") {
    if (this.map) return;

    const center = CONFIG.GIS.DEFAULT_CENTER || [6.55, -75.50];
    const zoom = CONFIG.GIS.DEFAULT_ZOOM || 8;

    this.map = L.map(contenedorId, {
      center: center,
      zoom: zoom,
      minZoom: CONFIG.GIS.MIN_ZOOM || 6,
      maxZoom: CONFIG.GIS.MAX_ZOOM || 19,
      zoomControl: false // Lo reubicamos o usamos herramientas personalizadas
    });

    // Control de zoom en la esquina superior derecha
    L.control.zoom({ position: "topright" }).addTo(this.map);

    // Escala métrica en la esquina inferior izquierda
    L.control.scale({ imperial: false, metric: true, position: "bottomleft" }).addTo(this.map);

    // Capas base de mosaicos (Tiles)
    this.layers.calles = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
      maxZoom: 19
    });

    this.layers.satelite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Earthstar Geographics',
      maxZoom: 19
    });

    // Activar calles por defecto
    this.layers.calles.addTo(this.map);

    // Inicializar grupo de clusters para fotografías
    this.layers.clusterFotos = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: 'marker-cluster marker-cluster-medium',
          iconSize: L.point(40, 40)
        });
      }
    });
    this.map.addLayer(this.layers.clusterFotos);
  },

  /**
   * Ajusta el tamaño del mapa al alternar pestañas
   */
  invalidateSize() {
    if (this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 200);
    }
  },

  /**
   * Alterna entre mapa base de calles y satélite
   */
  cambiarMapaBase(tipo) {
    if (!this.map) return;
    if (tipo === "satelite") {
      this.map.removeLayer(this.layers.calles);
      this.layers.satelite.addTo(this.map);
    } else {
      this.map.removeLayer(this.layers.satelite);
      this.layers.calles.addTo(this.map);
    }
  },

  /**
   * Carga y dibuja las capas vectoriales en el mapa
   */
  async cargarCapas(subregionesGeoJson, municipiosGeoJson, viasGeoJson, fotosGeoJson) {
    this._viasData = viasGeoJson.features || [];
    this._fotosData = fotosGeoJson.features || [];

    // 1. Capa de Subregiones (Polígonos)
    if (subregionesGeoJson && subregionesGeoJson.features) {
      this.layers.subregiones = L.geoJSON(subregionesGeoJson, {
        style: {
          color: CONFIG.GIS.COLORS.SUBREGION_BORDER || "#0a4a2b",
          weight: 1.5,
          opacity: 0.6,
          dashArray: "4, 4",
          fillColor: "#0a4a2b",
          fillOpacity: 0.03
        },
        onEachFeature: (feature, layer) => {
          const sub = feature.properties?.subregion || "Subregión";
          layer.bindTooltip(`<strong>Subregión: ${sub}</strong>`, { sticky: true });
        }
      }).addTo(this.map);
    }

    // 2. Capa de Red Vial (Líneas vectoriales)
    if (viasGeoJson && viasGeoJson.features) {
      this.layers.vias = L.geoJSON(viasGeoJson, {
        style: (feature) => {
          const tipo = (feature.properties?.tipo_via || "").toUpperCase();
          let color = CONFIG.GIS.COLORS.SECONDARY_ROAD || "#0a4a2b";
          let weight = 3;

          if (tipo.includes("PRIMARIA")) {
            color = CONFIG.GIS.COLORS.PRIMARY_ROAD || "#d97706";
            weight = 4.5;
          } else if (tipo.includes("TERCIARIA")) {
            color = CONFIG.GIS.COLORS.TERTIARY_ROAD || "#167a47";
            weight = 2.5;
          }

          return {
            color: color,
            weight: weight,
            opacity: 0.85
          };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties || {};
          const nom = p.nombre_via || "Vía departamental";
          const cod = p.codigo_via ? `(${p.codigo_via})` : "";
          
          layer.bindTooltip(`🛣️ <strong>${nom}</strong> ${cod}<br/><small>${p.tipo_via || ''} • ${p.subregion || ''}</small>`, {
            sticky: true
          });

          // Evento de clic en la vía
          layer.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            
            // Buscar fotos asociadas a esta vía
            const fotosAsociadas = this._fotosData.filter(f => {
              const fVia = (f.properties?.nombre_via || "").toLowerCase();
              const fCod = (f.properties?.codigo_via || "").toLowerCase();
              return (fVia && fVia === nom.toLowerCase()) || (fCod && p.codigo_via && fCod === p.codigo_via.toLowerCase());
            });

            PhotoViewer.mostrarDetalleVia(p, fotosAsociadas);
          });
        }
      }).addTo(this.map);
    }

    // 3. Renderizar marcadores de fotos
    this.actualizarMarcadoresFotos(this._fotosData);
  },

  /**
   * Actualiza los marcadores fotográficos según los filtros activos
   */
  actualizarMarcadoresFotos(fotosFeatures) {
    if (!this.layers.clusterFotos) return;

    this.layers.clusterFotos.clearLayers();

    const photoIcon = L.divIcon({
      className: "custom-photo-pin",
      html: "📷",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });

    fotosFeatures.forEach(f => {
      const p = f.properties || {};
      const geom = f.geometry || {};
      const coords = geom.coordinates || [];

      if (coords.length === 2 && coords[0] !== 0 && coords[1] !== 0) {
        const marker = L.marker([coords[1], coords[0]], { icon: photoIcon });

        // Popup interactivo
        const popupContent = `
          <div class="popup-title">📷 Registro ${p.id || 'Fotográfico'}</div>
          <div class="popup-field"><strong>Vía:</strong> ${p.nombre_via || 'N/A'}</div>
          <div class="popup-field"><strong>Código:</strong> ${p.codigo_via || 'N/A'}</div>
          <div class="popup-field"><strong>Municipio:</strong> ${p.municipio || 'N/A'}</div>
          <div class="popup-field"><strong>Fecha:</strong> ${p.fecha || ''}</div>
          <div class="popup-field"><small>Coords: ${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}</small></div>
          <button class="popup-btn" onclick="PhotoViewer.mostrarDetallePunto(${JSON.stringify(f).replace(/"/g, '&quot;')}, MapModule._fotosData)">
            Ver Información Completa
          </button>
        `;

        marker.bindPopup(popupContent);

        // Al hacer clic, abre detalle inmediatamente
        marker.on("click", () => {
          PhotoViewer.mostrarDetallePunto(f, fotosFeatures);
        });

        this.layers.clusterFotos.addLayer(marker);
      }
    });
  },

  /**
   * Centra el mapa en una ubicación o límites geográficos
   */
  centrarEn(lat, lng, zoom = 14) {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom, { animate: true });
  },

  ajustarALimites(bounds) {
    if (!this.map || !bounds) return;
    this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  },

  /**
   * Restablece la vista general al departamento de Antioquia
   */
  restablecerVista() {
    if (!this.map) return;
    const center = CONFIG.GIS.DEFAULT_CENTER || [6.55, -75.50];
    const zoom = CONFIG.GIS.DEFAULT_ZOOM || 8;
    this.map.setView(center, zoom, { animate: true });
  },

  /**
   * Geolocalización del usuario en vivo
   */
  miUbicacion() {
    if (!navigator.geolocation) {
      alert("Su navegador no soporta geolocalización.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.centrarEn(lat, lng, 15);

        const userPin = L.circleMarker([lat, lng], {
          radius: 9,
          fillColor: "#0284c7",
          color: "white",
          weight: 3,
          opacity: 1,
          fillOpacity: 0.9
        }).addTo(this.map);

        userPin.bindPopup("<strong>📍 Su ubicación actual</strong>").openPopup();
      },
      (err) => {
        alert("No se pudo obtener su ubicación: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  },

  /**
   * Pantalla completa para el mapa
   */
  alternarPantallaCompleta() {
    const contenedor = document.getElementById("gisMap");
    if (!contenedor) return;

    if (!document.fullscreenElement) {
      contenedor.requestFullscreen?.().catch(err => {
        alert("Error al entrar a pantalla completa: " + err.message);
      });
    } else {
      document.exitFullscreen?.();
    }
  }
};
