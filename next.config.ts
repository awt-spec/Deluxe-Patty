import type { NextConfig } from "next";

const ARCHIVOS_ASISTENTE = [
  "./prompts/**/*",
  "./marcas/**/*",
  "./node_modules/@fontsource/playfair-display/files/playfair-display-latin-*.woff",
  "./node_modules/@fontsource/inter/files/inter-latin-*.woff",
];

// Nadie puede mostrar la app dentro de otra página (para que un toque en "Enviar así" no se pueda
// engañar desde un iframe), y el navegador no adivina tipos de archivo.
const CABECERAS_SEGURIDAD = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS_SEGURIDAD }];
  },
  // @react-pdf/renderer se carga desde node_modules tal cual (ESM con dependencias nativas de fuentes).
  serverExternalPackages: ["@react-pdf/renderer"],
  // Archivos que se leen en tiempo de ejecución: instrucciones del agente, logos de las marcas y
  // tipografías de la ficha. La asistente también corre desde el panel: ficha y anuncio en
  // la página de la propiedad, y "Probar la asistente".
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": ARCHIVOS_ASISTENTE,
    "/panel/propiedades/[id]": ARCHIVOS_ASISTENTE,
    "/panel/probar": ARCHIVOS_ASISTENTE,
    "/panel/propiedades/nueva": ARCHIVOS_ASISTENTE,
  },
};

export default nextConfig;
