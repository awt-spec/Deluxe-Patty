import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// El permiso de Google (refresh token) se guarda cifrado con AES-256-GCM. La llave vive en
// GOOGLE_TOKEN_KEY (32 bytes en base64), nunca en la base ni en el repositorio.

function llave(): Buffer {
  const k = Buffer.from(process.env.GOOGLE_TOKEN_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("GOOGLE_TOKEN_KEY debe tener 32 bytes en base64");
  return k;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", llave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), datos].map((b) => b.toString("base64")).join(".");
}

export function descifrar(guardado: string): string {
  const [iv, tag, datos] = guardado.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", llave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(datos), d.final()]).toString("utf8");
}
