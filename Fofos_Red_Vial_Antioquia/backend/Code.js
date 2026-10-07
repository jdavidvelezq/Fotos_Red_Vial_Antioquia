function doGet(e) {
  return construirRespuestaJSON({
    status: "online",
    service: "Fotos Red Vial Antioquia API",
    version: "1.0.0"
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return construirRespuestaJSON({ status: "error", message: "Cuerpo de solicitud vacío." });
    }
    const payload = JSON.parse(e.postData.contents);
    const resultado = UploadService.procesarFotografia(payload);
    return construirRespuestaJSON(resultado);
  } catch (error) {
    return construirRespuestaJSON({
      status: "error",
      message: error.toString()
    });
  }
}