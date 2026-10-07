/**
 * Fotos Red Vial Antioquia - GisData
 * Servicio de carga, caché y filtrado reactivo de capas GeoJSON y fotografías
 */

const GisData = {
  _cache: {
    subregiones: null,
    municipios: null,
    vias: null,
    fotos: null
  },

  /**
   * Carga la capa de polígonos de subregiones de Antioquia
   */
  async cargarSubregiones() {
    if (this._cache.subregiones) return this._cache.subregiones;
    try {
      const resp = await fetch(CONFIG.GIS.GEOJSON_PATHS.SUBREGIONES);
      if (!resp.ok) throw new Error("No se pudo cargar subregiones.geojson");
      this._cache.subregiones = await resp.json();
      return this._cache.subregiones;
    } catch (e) {
      console.warn("Error cargando subregiones:", e);
      return { type: "FeatureCollection", features: [] };
    }
  },

  /**
   * Carga la capa de municipios de Antioquia
   */
  async cargarMunicipios() {
    if (this._cache.municipios) return this._cache.municipios;
    try {
      const resp = await fetch(CONFIG.GIS.GEOJSON_PATHS.MUNICIPIOS);
      if (!resp.ok) throw new Error("No se pudo cargar municipios.geojson");
      this._cache.municipios = await resp.json();
      return this._cache.municipios;
    } catch (e) {
      console.warn("Error cargando municipios:", e);
      return { type: "FeatureCollection", features: [] };
    }
  },

  /**
   * Carga la capa vectorial de la Red Vial departamental
   */
  async cargarVias() {
    if (this._cache.vias) return this._cache.vias;
    try {
      const resp = await fetch(CONFIG.GIS.GEOJSON_PATHS.ROADS);
      if (!resp.ok) throw new Error("No se pudo cargar roads.geojson");
      this._cache.vias = await resp.json();
      return this._cache.vias;
    } catch (e) {
      console.warn("Error cargando vías:", e);
      return { type: "FeatureCollection", features: [] };
    }
  },

  /**
   * Carga los registros fotográficos georreferenciados (en Fase 1 desde GeoJSON base de prueba)
   */
  async cargarFotos() {
    if (this._cache.fotos) return this._cache.fotos;
    try {
      const resp = await fetch(CONFIG.GIS.GEOJSON_PATHS.SAMPLE_PHOTOS);
      if (!resp.ok) throw new Error("No se pudo cargar samplePhotos.geojson");
      const geojson = await resp.json();
      this._cache.fotos = geojson;
      return this._cache.fotos;
    } catch (e) {
      console.warn("Error cargando fotografías georreferenciadas:", e);
      return { type: "FeatureCollection", features: [] };
    }
  },

  /**
   * Filtra las fotografías en función de los criterios seleccionados
   */
  filtrarFotos(fotosFeatures, filtros = {}) {
    if (!fotosFeatures || !Array.isArray(fotosFeatures)) return [];

    return fotosFeatures.filter(feature => {
      const p = feature.properties || {};

      // 1. Filtro por Subregión
      if (filtros.subregion && filtros.subregion !== "TODAS") {
        const sub = (p.subregion || "").toString().trim().toUpperCase();
        if (sub !== filtros.subregion.toUpperCase()) return false;
      }

      // 2. Filtro por Municipio
      if (filtros.municipio && filtros.municipio !== "TODOS") {
        const mun = (p.municipio || "").toString().trim().toUpperCase();
        if (mun !== filtros.municipio.toUpperCase()) return false;
      }

      // 3. Filtro por Tipo de Vía
      if (filtros.tipoVia && filtros.tipoVia !== "TODOS") {
        const tipo = (p.tipo_via || "").toString().trim().toUpperCase();
        if (tipo !== filtros.tipoVia.toUpperCase()) return false;
      }

      // 4. Filtro por Nombre de Vía
      if (filtros.nombreVia && filtros.nombreVia !== "TODAS") {
        const nom = (p.nombre_via || "").toString().trim().toUpperCase();
        if (nom !== filtros.nombreVia.toUpperCase()) return false;
      }

      // 5. Filtro por Código de Vía
      if (filtros.codigoVia && filtros.codigoVia !== "TODOS") {
        const cod = (p.codigo_via || "").toString().trim().toUpperCase();
        if (cod !== filtros.codigoVia.toUpperCase()) return false;
      }

      // 6. Rango de Fechas
      if (filtros.fechaDesde && p.fecha) {
        if (p.fecha < filtros.fechaDesde) return false;
      }
      if (filtros.fechaHasta && p.fecha) {
        if (p.fecha > filtros.fechaHasta) return false;
      }

      // 7. Búsqueda de texto libre general
      if (filtros.busqueda && filtros.busqueda.trim() !== "") {
        const term = filtros.busqueda.trim().toLowerCase();
        const textoCompleto = [
          p.id || "",
          p.nombre_via || "",
          p.codigo_via || "",
          p.municipio || "",
          p.subregion || "",
          p.contrato || "",
          p.frente || "",
          p.observacion || ""
        ].join(" ").toLowerCase();

        if (!textoCompleto.includes(term)) return false;
      }

      return true;
    });
  },

  /**
   * Calcula indicadores cuantitativos a partir de las fotos y capas activas
   */
  calcularIndicadores(fotosFiltradas = [], viasFeatures = [], municipiosFeatures = []) {
    const totalFotos = fotosFiltradas.length;
    
    const puntosGps = fotosFiltradas.filter(f => {
      const geom = f.geometry || {};
      const coords = geom.coordinates || [];
      return coords.length === 2 && coords[0] !== 0 && coords[1] !== 0;
    }).length;

    const viasUnicas = new Set();
    fotosFiltradas.forEach(f => {
      const nom = (f.properties?.nombre_via || f.properties?.codigo_via || "").trim();
      if (nom) viasUnicas.add(nom);
    });

    const mpiosUnicos = new Set();
    fotosFiltradas.forEach(f => {
      const mun = (f.properties?.municipio || "").trim();
      if (mun) mpiosUnicos.add(mun);
    });

    return {
      totalFotos,
      puntosGps,
      totalVias: viasUnicas.size > 0 ? viasUnicas.size : viasFeatures.length,
      totalMunicipios: mpiosUnicos.size > 0 ? mpiosUnicos.size : (municipiosFeatures.length || 125)
    };
  }
};
