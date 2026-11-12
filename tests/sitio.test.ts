import { describe, expect, it, vi } from "vitest";
import { agruparPorDia, enlaceWhatsApp, leerPedido, normalizarTelefono, pedirVisita } from "@/lib/sitio/publico";
import { ID, supabaseFalso } from "./acciones/entorno";

vi.mock("@/lib/panel/visitas", () => ({ crearVisita: vi.fn(async () => ({ ok: true, aviso: "Visita agendada." })) }));

const valido = { acepta: true, nombre: "Ana Pérez", telefono: "8888-0001", correo: "ana@ejemplo.com", inicio: "2026-11-20T16:00:00.000Z", casa: "" };

describe("Sitio web: pedido de visita", () => {
  it("normaliza el teléfono (8 dígitos = Costa Rica) y rechaza números cortos", () => {
    expect(normalizarTelefono("8888-0001")).toBe("+50688880001");
    expect(normalizarTelefono("+1 (305) 555-0100")).toBe("+13055550100");
    expect(normalizarTelefono("123")).toBeNull();
  });

  it("pide aceptar la privacidad, nombre, WhatsApp, correo válido y hora", () => {
    expect(leerPedido(valido)).toMatchObject({ ok: true, pedido: { telefono: "+50688880001", casa: null, correo: "ana@ejemplo.com" } });
    expect(leerPedido({ ...valido, acepta: false })).toMatchObject({ ok: false, motivo: expect.stringMatching(/privacidad/) });
    expect(leerPedido({ ...valido, nombre: "A" })).toMatchObject({ ok: false });
    expect(leerPedido({ ...valido, telefono: "12" })).toMatchObject({ ok: false });
    expect(leerPedido({ ...valido, correo: "no-es-correo" })).toMatchObject({ ok: false });
    expect(leerPedido({ ...valido, inicio: "mañana" })).toMatchObject({ ok: false });
    expect(leerPedido({ ...valido, casa: "1 or 1=1" })).toMatchObject({ ok: false });
    expect(leerPedido(null)).toMatchObject({ ok: false });
  });

  it("el campo trampa lleno se trata como robot", () => {
    expect(leerPedido({ ...valido, empresa: "Spam SA" })).toMatchObject({ ok: false, robot: true });
  });

  it("el enlace de WhatsApp lleva la referencia de la casa; sin número no hay enlace", () => {
    const url = enlaceWhatsApp("+506 7000 0000", { codigo: "DP-01", titulo: "Casa en Escazú" })!;
    expect(url.startsWith("https://wa.me/50670000000?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("DP-01");
    expect(enlaceWhatsApp(null, { codigo: "DP-01", titulo: "x" })).toBeNull();
  });

  it("agrupa las horas libres por día en la zona del corredor", () => {
    const dias = agruparPorDia(
      [
        { inicio: new Date("2026-11-20T15:00:00Z"), fin: new Date("2026-11-20T16:00:00Z") },
        { inicio: new Date("2026-11-20T17:00:00Z"), fin: new Date("2026-11-20T18:00:00Z") },
        { inicio: new Date("2026-11-21T15:00:00Z"), fin: new Date("2026-11-21T16:00:00Z") },
      ],
      "America/Costa_Rica",
    );
    expect(dias.map((d) => [d.fecha, d.horas.length])).toEqual([
      ["2026-11-20", 2],
      ["2026-11-21", 1],
    ]);
    expect(dias[0].horas[0].hora).toMatch(/9:00/);
  });

  it("si la hora ya no está libre no crea nada y responde 409", async () => {
    const db = supabaseFalso();
    const contacto = vi.fn();
    const deps = { repo: { datosAgenda: async () => ({ horarios: [], bloqueos: [], citas: [] }), contacto } } as never;
    const corredor = { id: ID.deluxe, zona_horaria: "America/Costa_Rica", horizonte_agenda_dias: 14, duracion_visita_min: 60, margen_visitas_min: 30, anticipacion_min_horas: 2 } as never;
    const r = await pedirVisita(deps, db as never, corredor, { casa: null, inicio: new Date("2026-11-20T16:00:00Z"), nombre: "Ana", telefono: "+50688880001", correo: null, notas: null });
    expect(r).toMatchObject({ ok: false, estado: 409 });
    expect(contacto).not.toHaveBeenCalled();
    expect(db.escrituras).toEqual([]);
  });

  it("con la hora libre crea el cliente y la visita, y anota que vino del sitio (todo del mismo corredor)", async () => {
    const db = supabaseFalso();
    const contacto = vi.fn(async () => ({ id: ID.cliente }));
    const deps = {
      repo: { datosAgenda: async () => ({ horarios: [{ dia_semana: 5, hora_inicio: "08:00", hora_fin: "17:00" }], bloqueos: [], citas: [] }), contacto },
      whatsapp: { plantilla: vi.fn() },
    } as never;
    const corredor = { id: ID.deluxe, zona_horaria: "America/Costa_Rica", horizonte_agenda_dias: 30, duracion_visita_min: 60, margen_visitas_min: 30, anticipacion_min_horas: 2, whatsapp_corredor: null } as never;
    const r = await pedirVisita(deps, db as never, corredor, { casa: null, inicio: new Date("2026-11-20T16:00:00Z"), nombre: "Ana", telefono: "+50688880001", correo: null, notas: "Voy con mi esposo" });
    expect(r).toMatchObject({ ok: true });
    expect(contacto).toHaveBeenCalledWith(ID.deluxe, "+50688880001", "Ana");
    const { crearVisita } = await import("@/lib/panel/visitas");
    expect(crearVisita).toHaveBeenCalledWith(deps, db, corredor, expect.objectContaining({ contactoId: ID.cliente, avisarCliente: false }));
    expect(db.escrituras).toEqual([expect.objectContaining({ tabla: "actividades", valores: expect.objectContaining({ corredor_id: ID.deluxe, texto: expect.stringMatching(/sitio web/) }) })]);
  });
});
