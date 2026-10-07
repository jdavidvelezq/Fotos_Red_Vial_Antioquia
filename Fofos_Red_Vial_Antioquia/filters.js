/**
 * Fotos Red Vial Antioquia - FiltersModule
 * Gestión de filtros dependientes en cascada, buscador general y actualización de indicadores KPI
 */

const FiltersModule = {
  _municipiosData: [],
  _viasData: [],
  _todasLasFotos: [],
  _debounceTimer: null,

  /**
   * Inicializa los filtros con los datos cargados de GeoJSON
   */
  inicializar(municipiosGeoJson, viasGeoJson, fotosGeoJson) {
    this._municipiosData = municipiosGeoJson.features || [];
    this._viasData = viasGeoJson.features || [];
    this._todasLasFotos = fotosGeoJson.features || [];

    this.poblarSubregiones();
    this.poblarMunicipios();
    this.poblarVias();
    this.asociarEventos();
    this.actualizarIndicadores(this._todasLasFotos);
  },

  /**
   * Llena el selector de subregiones
   */
  poblarSubregiones() {
    const sel = document.getElementById("filterSubregion");
    if (!sel) return;

    const subregiones = [
      "BAJO CAUCA",
      "MAGDALENA MEDIO",
      "NORDESTE",
      "NORTE",
      "OCCIDENTE",
      "ORIENTE",
      "SUROESTE",
      "URABA",
      "VALLE DE ABURRA"
    ];

    sel.innerHTML = `<option value="TODAS">Todas las Subregiones</option>`;
    subregiones.forEach(sub => {
      sel.innerHTML += `<option value="${sub}">${sub}</option>`;
    });
  },

  /**
   * Actualiza el selector de municipios en función de la subregión seleccionada
   */
  poblarMunicipios(subregionFiltro = "TODAS") {
    const sel = document.getElementById("filterMunicipio");
    if (!sel) return;

    let mpios = this._municipiosData.map(f => f.properties || {});
    
    if (subregionFiltro !== "TODAS") {
      mpios = mpios.filter(m => (m.subregion || "").toUpperCase() === subregionFiltro.toUpperCase());
    }

    // Ordenar alfabéticamente por nombre
    const nombresUnicos = [...new Set(mpios.map(m => m.municipio).filter(Boolean))].sort();

    sel.innerHTML = `<option value="TODOS">Todos los Municipios</option>`;
    nombresUnicos.forEach(nom => {
      sel.innerHTML += `<option value="${nom}">${nom}</option>`;
    });
  },

  /**
   * Llena los selectores de Nombre de Vía y Código de Vía
   */
  poblarVias(subregionFiltro = "TODAS", municipioFiltro = "TODOS") {
    const selNombre = document.getElementById("filterNombreVia");
    const selCodigo = document.getElementById("filterCodigoVia");
    if (!selNombre || !selCodigo) return;

    let vias = this._viasData.map(f => f.properties || {});

    if (subregionFiltro !== "TODAS") {
      vias = vias.filter(v => (v.subregion || "").toUpperCase() === subregionFiltro.toUpperCase());
    }

    if (municipioFiltro !== "TODOS") {
      vias = vias.filter(v => (v.municipio || "").toLowerCase().includes(municipioFiltro.toLowerCase()));
    }

    const nombres = [...new Set(vias.map(v => v.nombre_via).filter(Boolean))].sort();
    const codigos = [...new Set(vias.map(v => v.codigo_via).filter(Boolean))].sort();

    selNombre.innerHTML = `<option value="TODAS">Todas las Vías</option>`;
    nombres.forEach(n => {
      selNombre.innerHTML += `<option value="${n}">${n}</option>`;
    });

    selCodigo.innerHTML = `<option value="TODOS">Todos los Códigos</option>`;
    codigos.forEach(c => {
      selCodigo.innerHTML += `<option value="${c}">${c}</option>`;
    });
  },

  /**
   * Enlaza los listeners de cambio en los filtros para comportamiento en cascada
   */
  asociarEventos() {
    const selSub = document.getElementById("filterSubregion");
    const selMun = document.getElementById("filterMunicipio");
    const btnAplicar = document.getElementById("btnAplicarFiltros");
    const btnLimpiar = document.getElementById("btnLimpiarFiltros");
    const inputBuscar = document.getElementById("gisSearchInput");

    // Cascada: Subregión cambia Municipio y Vías
    if (selSub) {
      selSub.addEventListener("change", (e) => {
        const sub = e.target.value;
        this.poblarMunicipios(sub);
        this.poblarVias(sub, selMun?.value || "TODOS");
        this.aplicarFiltros();
      });
    }

    // Cascada: Municipio cambia Vías
    if (selMun) {
      selMun.addEventListener("change", (e) => {
        const mun = e.target.value;
        this.poblarVias(selSub?.value || "TODAS", mun);
        this.aplicarFiltros();
      });
    }

    // Botón manual aplicar
    if (btnAplicar) {
      btnAplicar.addEventListener("click", () => this.aplicarFiltros());
    }

    // Botón limpiar
    if (btnLimpiar) {
      btnLimpiar.addEventListener("click", () => this.limpiarFiltros());
    }

    // Buscador general rápido con debounce
    if (inputBuscar) {
      inputBuscar.addEventListener("input", (e) => {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this.aplicarFiltros();
        }, 300);
      });
    }

    // Botón flotante móvil para filtros
    const btnMobile = document.getElementById("btnToggleMobileFilters");
    const panelFiltros = document.getElementById("gisFiltersPanel");
    if (btnMobile && panelFiltros) {
      btnMobile.addEventListener("click", () => {
        panelFiltros.classList.toggle("mobile-drawer-open");
      });
    }
  },

  /**
   * Obtiene los criterios activos y filtra las fotografías y el mapa
   */
  aplicarFiltros() {
    const criterios = {
      subregion: document.getElementById("filterSubregion")?.value || "TODAS",
      municipio: document.getElementById("filterMunicipio")?.value || "TODOS",
      tipoVia: document.getElementById("filterTipoVia")?.value || "TODOS",
      nombreVia: document.getElementById("filterNombreVia")?.value || "TODAS",
      codigoVia: document.getElementById("filterCodigoVia")?.value || "TODOS",
      fechaDesde: document.getElementById("filterFechaDesde")?.value || "",
      fechaHasta: document.getElementById("filterFechaHasta")?.value || "",
      busqueda: (document.getElementById("gisSearchInput")?.value || "").trim()
    };

    const fotosFiltradas = GisData.filtrarFotos(this._todasLasFotos, criterios);

    // Actualizar marcadores en el mapa Leaflet
    MapModule.actualizarMarcadoresFotos(fotosFiltradas);

    // Actualizar indicadores KPI
    this.actualizarIndicadores(fotosFiltradas);

    // Si hay pocas fotos filtradas, ajustar el zoom para enfocarlas
    if (fotosFiltradas.length > 0 && fotosFiltradas.length <= 10) {
      const coords = fotosFiltradas.map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
      const bounds = L.latLngBounds(coords);
      MapModule.ajustarALimites(bounds);
    }

    // Cerrar drawer en móvil si estaba abierto
    const panelFiltros = document.getElementById("gisFiltersPanel");
    if (panelFiltros && window.innerWidth <= 768) {
      panelFiltros.classList.remove("mobile-drawer-open");
    }
  },

  /**
   * Restablece todos los filtros
   */
  limpiarFiltros() {
    const selSub = document.getElementById("filterSubregion");
    const selMun = document.getElementById("filterMunicipio");
    const selTipo = document.getElementById("filterTipoVia");
    const selNom = document.getElementById("filterNombreVia");
    const selCod = document.getElementById("filterCodigoVia");
    const fDesde = document.getElementById("filterFechaDesde");
    const fHasta = document.getElementById("filterFechaHasta");
    const busq = document.getElementById("gisSearchInput");

    if (selSub) selSub.value = "TODAS";
    this.poblarMunicipios("TODAS");
    this.poblarVias("TODAS", "TODOS");
    if (selTipo) selTipo.value = "TODOS";
    if (selNom) selNom.value = "TODAS";
    if (selCod) selCod.value = "TODOS";
    if (fDesde) fDesde.value = "";
    if (fHasta) fHasta.value = "";
    if (busq) busq.value = "";

    MapModule.actualizarMarcadoresFotos(this._todasLasFotos);
    this.actualizarIndicadores(this._todasLasFotos);
    MapModule.restablecerVista();
  },

  /**
   * Aplica filtro directo sobre una vía específica
   */
  filtrarPorVia(nombreVia) {
    this.limpiarFiltros();
    const selNom = document.getElementById("filterNombreVia");
    if (selNom) {
      // Buscar coincidencia aproximada
      for (let i = 0; i < selNom.options.length; i++) {
        if (selNom.options[i].value.toLowerCase().includes(nombreVia.toLowerCase())) {
          selNom.selectedIndex = i;
          break;
        }
      }
    }
    this.aplicarFiltros();
  },

  /**
   * Actualiza los 4 contadores KPI en la barra superior del visor
   */
  actualizarIndicadores(fotosFiltradas) {
    const ind = GisData.calcularIndicadores(fotosFiltradas, this._viasData, this._municipiosData);

    const elFotos = document.getElementById("kpiTotalFotos");
    const elPuntos = document.getElementById("kpiPuntosGps");
    const elVias = document.getElementById("kpiTotalVias");
    const elMpios = document.getElementById("kpiTotalMpios");

    if (elFotos) elFotos.innerText = ind.totalFotos.toLocaleString();
    if (elPuntos) elPuntos.innerText = ind.puntosGps.toLocaleString();
    if (elVias) elVias.innerText = ind.totalVias.toLocaleString();
    if (elMpios) elMpios.innerText = ind.totalMunicipios.toLocaleString();
  }
};
