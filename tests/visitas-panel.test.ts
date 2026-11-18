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

describe("visitas del panel: un doble toque no le escribe dos veces al cliente", () => {
  const conCita = (estado: string, inicio = "2026-12-01T16:00:00Z") =>
    supabaseFalso({
      citas: [{ id: ID.cita, corredor_id: ID.deluxe, contacto_id: ID.cliente, estado, inicio, fin: "2026-12-01T17:00:00Z" }],
      conversaciones: [{ id: ID.conversacion, corredor_id: ID.deluxe, contacto_id: ID.cliente }],
    });

  it("confirmar una visita ya confirmada (el segundo toque) dice que ya estaba y no manda otro WhatsApp", async () => {
    const texto = vi.fn(async () => "wamid");
    // El repositorio real filtra .neq("estado", estado): confirmar una confirmada no cambia nada y devuelve false.
    const d = { repo: { cambiarEstadoCita: vi.fn(async () => false), conversacionConContacto: vi.fn() }, whatsapp: { texto } } as never;
    const db = conCita("confirmada");
    expect(await cambiarVisita(d, db as never, corredor, ID.cita, "confirmada", true)).toEqual({ ok: true, aviso: "Visita confirmada. Ya le habías avisado." });
    expect(texto).not.toHaveBeenCalled();
    expect(db.escrituras).toEqual([]);
  });

  it("si cambió a otro estado mientras tanto, lo dice como antes", async () => {
    const d = { repo: { cambiarEstadoCita: vi.fn(async () => false) } } as never;
    expect(await cambiarVisita(d, conCita("agendada") as never, corredor, ID.cita, "confirmada", true)).toEqual({ ok: false, motivo: "La visita ya cambió." });
  });

  it("moverla a la hora que ya tiene no la toca ni avisa", async () => {
    const db = conCita("agendada");
    const d = { repo: {}, whatsapp: { texto: vi.fn() } } as never;
    expect(await moverVisita(d, db as never, corredor, ID.cita, new Date("2026-12-01T16:00:00Z"), true)).toEqual({ ok: true, aviso: "La visita ya está a esa hora." });
    expect(db.escrituras).toEqual([]);
  });
});
