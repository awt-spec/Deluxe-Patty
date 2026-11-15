import type { MetadataRoute } from "next";

// El panel, la administración, la API y la entrada no son para buscadores (antes /robots.txt daba 404). Lo público
// del corredor está en su propio sitio web; aquí solo /privacidad y la portada.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/panel", "/admin", "/api", "/entrar", "/auth"] }],
  };
}
