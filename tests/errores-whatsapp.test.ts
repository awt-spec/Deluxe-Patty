import { describe, expect, it } from "vitest";
import { ErrorWhatsApp, explicarErrorWhatsApp } from "../lib/whatsapp/enviar";

describe("explicarErrorWhatsApp", () => {
  it("explica los códigos de Meta que se ven al conectar un número", () => {
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, 133010))).toMatch(/no está registrado/);
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, 131030))).toMatch(/lista de destinatarios de prueba/);
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(401, 190))).toMatch(/venció/);
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, 131042))).toMatch(/método de pago/);
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(404, 132001))).toMatch(/plantilla/);
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(400, 100))).toMatch(/Phone number ID/);
  });

  it("sin llave configurada (estado 0) lo dice, y un código desconocido da la guía general", () => {
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(0, undefined))).toMatch(/llave de acceso/);
    expect(explicarErrorWhatsApp(new ErrorWhatsApp(500, 999999))).toMatch(/lista de prueba/);
  });

  it("un error que no es de WhatsApp no rompe y no expone su mensaje", () => {
    const texto = explicarErrorWhatsApp(new Error("fallo con +50688880001"));
    expect(texto).not.toContain("50688880001");
  });
});
