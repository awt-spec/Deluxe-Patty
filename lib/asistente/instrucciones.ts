import { readFileSync } from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

// Lee una instrucción versionada de prompts/. En Vercel la carpeta se incluye vía
// outputFileTracingIncludes en next.config.ts.
export function instruccion(nombre: "clasificar" | "responder" | "agendar" | "analizar" | "anuncio" | "dueno_o_corredor"): string {
  let texto = cache.get(nombre);
  if (texto === undefined) {
    texto = readFileSync(path.join(process.cwd(), "prompts", `${nombre}.md`), "utf8").trim();
    cache.set(nombre, texto);
  }
  return texto;
}
