import { createHmac, timingSafeEqual } from "node:crypto";

// Meta firma cada POST del webhook con HMAC-SHA256 del cuerpo crudo usando el App Secret,
// en el encabezado X-Hub-Signature-256 ("sha256=<hex>").
export function firmaValida(cuerpoCrudo: string, encabezado: string | null, appSecret: string): boolean {
  if (!encabezado?.startsWith("sha256=")) return false;
  const recibida = Buffer.from(encabezado.slice("sha256=".length), "hex");
  const esperada = createHmac("sha256", appSecret).update(cuerpoCrudo, "utf8").digest();
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}
