const Api = {
  subirFoto: async function(payload) {
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // Evita preflight CORS estricto en GAS
        body: JSON.stringify(payload),
        redirect: "follow"
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        // Manejo de páginas de redirección o error de Google (autorización pendiente, cuota, login)
        if (responseText.includes("accounts.google.com") || responseText.includes("Sign in")) {
          return {
            status: "error",
            message: "Acceso bloqueado: la Web App requiere que el propietario autorice los permisos en Apps Script una vez."
          };
        }
        return {
          status: "error",
          message: "Respuesta inesperada del servidor: " + responseText.slice(0, 180)
        };
      }

      return data;
    } catch (err) {
      return {
        status: "error",
        message: "No fue posible conectar con el servidor: " + (err.message || err.toString())
      };
    }
  }
};