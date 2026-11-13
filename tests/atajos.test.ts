import { describe, expect, it } from "vitest";
import { ESPERA_G_MS, atajoDe, esCampo } from "../lib/panel/atajos";

const t = (key: string, extra: Partial<Parameters<typeof atajoDe>[0]> = {}) => ({ key, enCampo: false, ...extra });

describe("atajoDe", () => {
  it("g y luego i/c/a/m van a cada sección", () => {
    expect(atajoDe(t("g"), null, 0)).toEqual({ tipo: "esperar-g" });
    expect(atajoDe(t("i"), 0, 300)).toEqual({ tipo: "ir", ruta: "/panel" });
    expect(atajoDe(t("c"), 0, 300)).toEqual({ tipo: "ir", ruta: "/panel/clientes" });
    expect(atajoDe(t("A"), 0, 300)).toEqual({ tipo: "ir", ruta: "/panel/agenda" });
    expect(atajoDe(t("m"), 0, 300)).toEqual({ tipo: "ir", ruta: "/panel/propiedades" });
  });

  it("la segunda letra sola, o tarde, no hace nada", () => {
    expect(atajoDe(t("c"), null, 0)).toBeNull();
    expect(atajoDe(t("c"), 0, ESPERA_G_MS + 1)).toBeNull();
  });

  it("/ y Ctrl/⌘+K abren la asistente", () => {
    expect(atajoDe(t("/"), null, 0)).toEqual({ tipo: "asistente" });
    expect(atajoDe(t("k", { ctrlKey: true }), null, 0)).toEqual({ tipo: "asistente" });
    expect(atajoDe(t("K", { metaKey: true }), null, 0)).toEqual({ tipo: "asistente" });
    expect(atajoDe(t("c", { ctrlKey: true }), 0, 10)).toBeNull();
  });

  it("al escribir en un campo no se activa nada", () => {
    expect(atajoDe(t("/", { enCampo: true }), null, 0)).toBeNull();
    expect(atajoDe(t("k", { enCampo: true, metaKey: true }), null, 0)).toBeNull();
    expect(atajoDe(t("i", { enCampo: true }), 0, 10)).toBeNull();
  });
});

describe("esCampo", () => {
  it("reconoce campos por su etiqueta", () => {
    expect(esCampo({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(esCampo({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(esCampo({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(esCampo({ tagName: "A" } as unknown as EventTarget)).toBe(false);
    expect(esCampo(null)).toBe(false);
  });
});
