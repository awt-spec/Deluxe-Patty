import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { clasificarFalla, codigoDeFalla, esRedireccionAEntrar, mensajeDeFalla } from "@/lib/panel/fallas";
import { inicialDe } from "@/lib/panel/inicial";
import { colorEInicial } from "@/app/panel/avatar";
import { MAX_BASE64_PATTY, MAX_BYTES_PATTY, TEXTO_MAX_PATTY } from "@/lib/panel/adjuntos-limites";

const redireccion = (destino: string) => Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${destino};307;` });

describe("clasificarFalla: un mensaje por causa (H-23)", () => {
  it("sesión cerrada: la acción redirigió a /entrar", () => {
    expect(esRedireccionAEntrar(redireccion("/entrar?aviso=sesion&volver=%2Fpanel"))).toBe(true);
    expect(esRedireccionAEntrar(redireccion("/panel/agenda"))).toBe(false);
    expect(clasificarFalla(redireccion("/entrar"), { enLinea: true })).toBe("sesion");
  });
  it("sin conexión: el navegador lo dice o el fetch no salió (Chrome, Firefox, Safari)", () => {
    expect(clasificarFalla(new Error("x"), { enLinea: false })).toBe("sin-conexion");
    expect(clasificarFalla(new TypeError("Failed to fetch"), { enLinea: true })).toBe("sin-conexion");
    expect(clasificarFalla(new TypeError("NetworkError when attempting to fetch resource."))).toBe("sin-conexion");
    expect(clasificarFalla(new TypeError("Load failed"))).toBe("sin-conexion");
  });
  it("archivos muy pesados solo si se mandaron archivos", () => {
    expect(clasificarFalla(new Error("An unexpected response was received from the server."), { conArchivos: true })).toBe("grande");
    expect(clasificarFalla(new Error("Body exceeded 5mb limit"), { conArchivos: true })).toBe("grande");
    // Sin archivos, la respuesta inesperada era la sesión vencida (el proxy devolvía la página de /entrar).
    expect(clasificarFalla(new Error("An unexpected response was received from the server."), { conArchivos: false })).toBe("sesion");
  });
  it("lo demás es genérico, y ningún mensaje habla de archivos si no hay", () => {
    expect(clasificarFalla(new Error("boom"))).toBe("generica");
    expect(mensajeDeFalla("generica")).not.toMatch(/archiv/);
    expect(mensajeDeFalla("sesion")).toBe("Tu sesión se cerró. Entra de nuevo y sigues donde estabas.");
    expect(mensajeDeFalla("sin-conexion", "guardar")).toMatch(/no hay conexión.*guardar/);
  });
  it("el código para soporte nunca trae el mensaje crudo", () => {
    const c = codigoDeFalla(new TypeError("Failed to fetch https://x/y?tel=88887777"));
    expect(c).toMatch(/^N-Type-[0-9A-Z]{1,6}$/);
    expect(c).not.toMatch(/fetch|8888/);
    expect(codigoDeFalla(Object.assign(new Error("x"), { digest: "1234567890123" }))).toBe("S-1234567890");
    expect(codigoDeFalla(new Error("a"))).toBe(codigoDeFalla(new Error("a")));
  });
});

describe("inicial del avatar e hidratación (H-14, error #418 en /panel/clientes)", () => {
  it("reproduce la causa: media letra (sustituto suelto) sale distinta en el HTML y en los datos de React", () => {
    const vieja = "🏠🏠 Ñandú".trim().charAt(0).toUpperCase();
    expect(vieja.isWellFormed()).toBe(false);
    // El HTML del servidor viaja en UTF-8: el sustituto suelto no se puede codificar y llega como U+FFFD…
    const html = new TextDecoder().decode(new TextEncoder().encode(renderToString(createElement("span", null, vieja))));
    expect(html).toBe("<span>�</span>");
    // …mientras que la carga de React (JSON) lo conserva escapado: al hidratar, "�" ≠ "\ud83c" → #418.
    expect(JSON.parse(JSON.stringify(vieja))).toBe(vieja);
    expect(JSON.stringify(vieja)).toBe('"\\ud83c"');
  });
  it("ahora la inicial es una letra completa, igual en servidor y navegador", () => {
    for (const nombre of ["🏠🏠 Ñandú", "👩‍👩‍👧 Familia", "ñandú", "  ana", "Élodie"]) {
      const i = inicialDe(nombre);
      expect(i.isWellFormed()).toBe(true);
      const html = new TextDecoder().decode(new TextEncoder().encode(renderToString(createElement("span", null, i))));
      expect(html).toBe(`<span>${i}</span>`);
    }
    expect(inicialDe("🏠🏠 Ñandú")).toBe("🏠");
    expect(inicialDe("👩‍👩‍👧 Familia")).toBe("👩‍👩‍👧");
    expect(inicialDe("ñandú")).toBe("Ñ");
    expect(inicialDe("   ")).toBe("#");
    expect(inicialDe(null, "P")).toBe("P");
    expect(colorEInicial("🏠🏠 Ñandú", "88880002").inicial).toBe("🏠");
  });
});

describe("límite de adjuntos de Patty (un solo número)", () => {
  it("2,8 MB de archivos, que en base64 caben bajo los 4 MiB del servidor y los 4,5 MB de Vercel", () => {
    expect(TEXTO_MAX_PATTY).toBe("2,8 MB");
    expect(MAX_BYTES_PATTY).toBe(2_800_000);
    expect(MAX_BASE64_PATTY).toBeGreaterThanOrEqual((MAX_BYTES_PATTY * 4) / 3);
    expect(MAX_BASE64_PATTY).toBeLessThan(4 * 1024 * 1024);
  });
});
