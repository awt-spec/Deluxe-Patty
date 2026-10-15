import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { firmaValida } from "../lib/whatsapp/firma";

const secreto = "secreto-de-prueba";
const cuerpo = '{"object":"whatsapp_business_account"}';
const firma = `sha256=${createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;

describe("firmaValida", () => {
  it("acepta la firma correcta", () => {
    expect(firmaValida(cuerpo, firma, secreto)).toBe(true);
  });
  it("rechaza un cuerpo alterado", () => {
    expect(firmaValida(cuerpo + " ", firma, secreto)).toBe(false);
  });
  it("rechaza otro secreto, encabezado ausente o malformado", () => {
    expect(firmaValida(cuerpo, firma, "otro")).toBe(false);
    expect(firmaValida(cuerpo, null, secreto)).toBe(false);
    expect(firmaValida(cuerpo, "sha1=abc", secreto)).toBe(false);
    expect(firmaValida(cuerpo, "sha256=zz", secreto)).toBe(false);
  });
});
