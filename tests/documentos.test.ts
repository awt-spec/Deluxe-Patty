import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ErrorDocumento, LIMITE_DOCUMENTO, textoDeDocumento } from "../lib/medios/documentos";

const leer = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url));

describe("textoDeDocumento", () => {
  it("lee un Word (.docx) con su párrafo y su tabla", async () => {
    const t = await textoDeDocumento(leer("oferta.docx"), "oferta.docx");
    expect(t).toContain("Precio ofrecido: $425,000");
    expect(t).toContain("Prima");
  });

  it("lee un Excel (.xlsx) hoja por hoja, con celdas separadas", async () => {
    const t = await textoDeDocumento(leer("casas.xlsx"), "casas.xlsx");
    expect(t).toContain("## Hoja: Casas");
    expect(t).toContain("DP-001 | Escazú | 450000");
    expect(t).toContain("## Hoja: Notas");
  });

  it("lee texto plano y CSV", async () => {
    expect(await textoDeDocumento(Buffer.from("a,b\n1,2\n"), "datos.csv")).toBe("a,b\n1,2");
    expect(await textoDeDocumento(Buffer.from("Hola  mundo"), "nota.TXT")).toBe("Hola mundo");
  });

  it("rechaza lo que no se puede leer, con su razón", async () => {
    await expect(textoDeDocumento(Buffer.from("x"), "viejo.doc")).rejects.toMatchObject({ razon: "formato" });
    await expect(textoDeDocumento(Buffer.from("x"), "viejo.xls")).rejects.toMatchObject({ razon: "formato" });
    await expect(textoDeDocumento(Buffer.from("no es un zip"), "roto.docx")).rejects.toMatchObject({ razon: "ilegible" });
    await expect(textoDeDocumento(Buffer.from("   \n "), "vacio.txt")).rejects.toMatchObject({ razon: "vacio" });
    await expect(textoDeDocumento(Buffer.alloc(LIMITE_DOCUMENTO + 1), "grande.txt")).rejects.toBeInstanceOf(ErrorDocumento);
  });

  it("recorta lo larguísimo para no gastar IA de más", async () => {
    const t = await textoDeDocumento(Buffer.from("palabra ".repeat(20_000)), "largo.txt");
    expect(t.length).toBeLessThan(61_000);
    expect(t).toContain("se leyeron los primeros");
  });
});
