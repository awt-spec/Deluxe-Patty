import { describe, expect, it } from "vitest";
import {
  DURACION_VOLVER_S,
  destinoTrasEnlace,
  opcionesCookieVolver,
  valorCookieVolver,
} from "@/lib/panel/volver-enlace";

const AHORA = Date.UTC(2026, 10, 15, 15, 0, 0);
const cookieHecha = (dato: unknown) => Buffer.from(JSON.stringify(dato)).toString("base64url");

describe("cookie de vuelta del enlace mágico", () => {
  it("es corta, httpOnly, lax y segura", () => {
    expect(opcionesCookieVolver).toMatchObject({ httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
    expect(DURACION_VOLVER_S).toBe(600);
  });

  it("cookie válida: vuelve a la pantalla guardada, con su consulta", () => {
    const valor = valorCookieVolver("/panel/clientes/abc?tipo=compras", AHORA)!;
    expect(destinoTrasEnlace(valor, AHORA + 60_000)).toBe("/panel/clientes/abc?tipo=compras");
  });

  it("ausente o vacía: al Inicio", () => {
    expect(destinoTrasEnlace(undefined, AHORA)).toBe("/panel");
    expect(destinoTrasEnlace(null, AHORA)).toBe("/panel");
    expect(destinoTrasEnlace("", AHORA)).toBe("/panel");
  });

  it("vencida: al Inicio", () => {
    const valor = valorCookieVolver("/panel/agenda", AHORA)!;
    expect(destinoTrasEnlace(valor, AHORA + DURACION_VOLVER_S * 1000)).toBe("/panel");
    expect(destinoTrasEnlace(valor, AHORA + DURACION_VOLVER_S * 1000 + 1)).toBe("/panel");
    expect(destinoTrasEnlace(valor, AHORA + DURACION_VOLVER_S * 1000 - 1)).toBe("/panel/agenda");
  });

  it("inválida (otro sitio, mal formada o hecha a mano): al Inicio", () => {
    for (const r of ["//malo.com", "https://malo.com/panel", "/panel/../admin", "/\\malo.com", "/admin", "/panel%2f%2fmalo.com"]) {
      expect(destinoTrasEnlace(cookieHecha({ r, e: AHORA + 60_000 }), AHORA)).toBe("/panel");
    }
    expect(destinoTrasEnlace("no-es-base64-json", AHORA)).toBe("/panel");
    expect(destinoTrasEnlace(cookieHecha(["/panel/agenda"]), AHORA)).toBe("/panel");
    expect(destinoTrasEnlace(cookieHecha({ r: "/panel/agenda" }), AHORA)).toBe("/panel");
    expect(destinoTrasEnlace(cookieHecha({ r: "/panel/agenda", e: "mañana" }), AHORA)).toBe("/panel");
    // Un vencimiento más lejos de lo que dura la cookie no lo pudo poner /entrar.
    expect(destinoTrasEnlace(cookieHecha({ r: "/panel/agenda", e: AHORA + 86_400_000 }), AHORA)).toBe("/panel");
    expect(destinoTrasEnlace("x".repeat(3000), AHORA)).toBe("/panel");
  });

  it("solo se guarda una ruta del panel distinta del Inicio", () => {
    expect(valorCookieVolver("/panel", AHORA)).toBeNull();
    expect(valorCookieVolver("//malo.com", AHORA)).toBeNull();
    expect(valorCookieVolver("", AHORA)).toBeNull();
    expect(valorCookieVolver(undefined, AHORA)).toBeNull();
    expect(valorCookieVolver("/panel/propiedades/1", AHORA)).not.toBeNull();
  });
});
