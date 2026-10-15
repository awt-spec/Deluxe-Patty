import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las instrucciones del agente se leen de prompts/ en tiempo de ejecución.
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": ["./prompts/**/*"],
  },
};

export default nextConfig;
