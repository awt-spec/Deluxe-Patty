import { describe, expect, it, vi } from "vitest";
import { cambiarVisita, moverVisita } from "@/lib/panel/visitas";
import { ID, supabaseFalso } from "./acciones/entorno";

// lib/panel/visitas.ts con la base en memoria: una visita que ya terminó dice por qué, no "No encontré la visita".
const corredor = { id: ID.deluxe, zona_horaria: "America/Costa_Rica", nombre_contacto: "Patricia" } as never;
const deps = { repo: { cambiarEstadoCita: vi.fn(async () => true) } } as never;
const base = (estado: string, corredorId: string = ID.deluxe) =>
  supabaseFalso({ citas: [{ id: ID.cita, corredor_id: corredorId, contacto_id: ID.cliente, estado, inicio: "2026-12-01T16:00:00Z", fin: "2026-12-01T17:00:00Z" }] });

describe("visitas del panel: mensajes de una visita que ya cambió", () => {
  it("cancelar una visita ya cancelada dice que ya estaba cancelada (dos pestañas)", async () => {
    const db = base("cancelada");
    expect(await cambiarVisita(deps, db as never, corredor, ID.cita, "cancelada", false)).toEqual({ ok: false, motivo: "Esa visita ya estaba cancelada." });
    expect(await moverVisita(deps, db as never, corredor, ID.cita, new Date("2026-12-02T16:00:00Z"), false)).toEqual({ ok: false, motivo: "Esa visita está cancelada: agenda una nueva." });
    expect(db.escrituras).toEqual([]);
  });

  it("una hecha o a la que no llegó lo dice; una que no existe o es de otro corredor, 'No encontré la visita.'", async () => {
    expect(await cambiarVisita(deps, base("realizada") as never, corredor, ID.cita, "cancelada", false)).toMatchObject({ motivo: "Esa visita ya quedó como hecha." });
    expect(await cambiarVisita(deps, base("no_asistio") as never, corredor, ID.cita, "confirmada", false)).toMatchObject({ motivo: expect.stringMatching(/no llegó/) });
    const ajena = base("cancelada", ID.otro);
    expect(await cambiarVisita(deps, ajena as never, corredor, ID.cita, "cancelada", false)).toEqual({ ok: false, motivo: "No encontré la visita." });
    expect(ajena.escrituras).toEqual([]);
  });
});
