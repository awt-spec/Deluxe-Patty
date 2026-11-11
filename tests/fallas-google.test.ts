import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ocupadoEnGoogle } from "../lib/google/calendario";
import type { ConexionGoogle } from "../lib/google/conexion";
import { alAvisarFallas, reportarFalla } from "../lib/monitoreo/fallas";

// Antes, si Google fallaba la agenda seguía como si no hubiera nada ocupado y nadie se enteraba: podía ofrecerle a
// un cliente una hora en la que el corredor ya tenía un compromiso. Ahora sigue igual, pero no en silencio.

const conexionQueFalla = (error: Error): ConexionGoogle => ({
  corredorId: "c1",
  correo: "patricia@ejemplo.com",
  calendario: "primary",
  correoLeidoHasta: null,
  acceso: async () => {
    throw error;
  },
});

/** Doble de Supabase que guarda lo que se anota en google_conexiones. */
function dbQueAnota() {
  const anotado: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      update: (cambios: Record<string, unknown>) => ({
        eq: async () => {
          anotado.push(cambios);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, anotado };
}

describe("fallas de Google Calendar", () => {
  afterEach(() => {
    alAvisarFallas(null);
    vi.restoreAllMocks();
  });

  it("la agenda sigue (sin horas ocupadas de Google), pero se registra, se avisa y queda anotado", async () => {
    const avisos: [string, string][] = [];
    alAvisarFallas((clave, texto) => avisos.push([clave, texto]));
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, anotado } = dbQueAnota();

    const r = await ocupadoEnGoogle(conexionQueFalla(new TypeError("token vencido")), new Date(), new Date(), db);

    expect(r).toEqual([]);
    expect(JSON.parse(registro.mock.calls[0][0] as string)).toMatchObject({ evento: "error_google_ocupado", corredorId: "c1" });
    expect(avisos).toEqual([["error_google_ocupado:c1", expect.stringContaining("error_google_ocupado (corredor c1)")]]);
    expect(String(anotado[0].ultimo_error)).toContain("No se pudo leer lo ocupado en Google Calendar");
  });

  it("lo registrado y avisado solo lleva tipo y código, nunca el mensaje (puede traer datos de clientes)", async () => {
    const avisos: string[] = [];
    alAvisarFallas((_c, texto) => avisos.push(texto));
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    await ocupadoEnGoogle(conexionQueFalla(new Error("fallo con +50688880001 y ana@correo.com")), new Date(), new Date());
    const todo = JSON.stringify(registro.mock.calls) + avisos.join(" ");
    expect(todo).not.toContain("50688880001");
    expect(todo).not.toContain("ana@correo.com");
  });

  it("sin avisador (pruebas, scripts) solo registra, y un avisador que falla no corta nada", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportarFalla("error_x", { error: "Error" })).not.toThrow();
    alAvisarFallas(() => {
      throw new Error("sin red");
    });
    expect(() => reportarFalla("error_x", { corredorId: "c1", error: "Error" })).not.toThrow();
  });
});
