import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { crearRepositorioSupabase } from "../lib/datos/repositorio";
import { supabaseFalso } from "./acciones/entorno";

const T = "a".repeat(64);

describe("calendarioPorToken", () => {
  const db = supabaseFalso({
    corredores: [{ id: "c-demo", nombre: "Demo", token_calendario: T, activo: false }],
    citas: [
      { id: "x1", corredor_id: "c-demo", inicio: "2026-11-20T16:00:00Z", fin: "2026-11-20T17:00:00Z", estado: "confirmada", notas: null, updated_at: "2026-11-13T00:00:00Z", contactos: { nombre: "Ana", telefono: "+506" }, propiedades: null },
      { id: "x2", corredor_id: "otro", inicio: "2026-11-20T16:00:00Z", fin: "2026-11-20T17:00:00Z", estado: "confirmada", notas: null, updated_at: "2026-11-13T00:00:00Z", contactos: null, propiedades: null },
    ],
  });
  const repo = crearRepositorioSupabase(db as unknown as SupabaseClient);

  it("un corredor inactivo (la demo) entrega solo sus citas", async () => {
    const r = await repo.calendarioPorToken(T, new Date("2026-10-01"));
    expect(r?.citas.map((c) => c.id)).toEqual(["x1"]);
  });

  it("un token que no existe da null", async () => {
    expect(await repo.calendarioPorToken("b".repeat(64), new Date())).toBeNull();
  });
});
