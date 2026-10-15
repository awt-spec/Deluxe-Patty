import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer se carga desde node_modules tal cual (ESM con dependencias nativas de fuentes).
  serverExternalPackages: ["@react-pdf/renderer"],
  // Archivos que se leen en tiempo de ejecución: instrucciones del agente, logos de las marcas y
  // tipografías de la ficha.
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": [
      "./prompts/**/*",
      "./marcas/**/*",
      "./node_modules/@fontsource/playfair-display/files/playfair-display-latin-*.woff",
      "./node_modules/@fontsource/inter/files/inter-latin-*.woff",
    ],
  },
};

export default nextConfig;
