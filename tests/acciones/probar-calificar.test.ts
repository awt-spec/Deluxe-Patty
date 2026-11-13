import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, supabaseFalso } from "./entorno";

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

const { calificarRespuesta } = await import("@/app/panel/probar/calificar");

const corredor = (id: string, activo = true) => ({ id, activo, nombre: "Corredor", nombre_asistente: "Patty" });
const ORIGINAL = "La casa tiene 3 habitaciones.";
const PREGUNTA = "¿Cuántos cuartos tiene la casa de Escazú?";

function conSesion(id: string, activo = true) {
  estado.sesion = { corredor: corredor(id, activo), usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso() };
  estado.admin = supabaseFalso();
}

const escrituras = () => [...estado.admin.escrituras, ...estado.sesion!.supabase.escrituras];

beforeEach(() => {
  vi.restoreAllMocks();
  conSesion(ID.deluxe);
});

describe("Calificar una respuesta de Probar la asistente", () => {
  it("su versión queda como corrección, con el corredor de la sesión (lo que mande el navegador no cuenta)", async () => {
    const r = await calificarRespuesta({
      motivo: "tono",
      pregunta: PREGUNTA,
      original: ORIGINAL,
      texto: "¡Con gusto! Tiene 3 cuartos.",
      corredor_id: ID.otro,
    });
    expect(r).toMatchObject({ ok: true });
    const filas = estado.admin.tablas.correcciones;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ corredor_id: ID.deluxe, original: ORIGINAL, corregido: "¡Con gusto! Tiene 3 cuartos." });
    expect(filas[0].mensaje_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(estado.sesion!.supabase.escrituras).toEqual([]);
  });

  it("con la sesión de otro corredor solo escribe en lo de ese corredor", async () => {
    conSesion(ID.otro);
    await calificarRespuesta({ motivo: "dato", pregunta: PREGUNTA, original: ORIGINAL, texto: "Tiene 4.", guardarEnLoQueSabe: true });
    const todas = escrituras();
    expect(todas.length).toBeGreaterThan(0);
    for (const e of todas) expect((e.valores as { corredor_id?: string }).corredor_id ?? e.filtros.find(([c]) => c === "corredor_id")?.[1]).toBe(ID.otro);
    expect(todas.some((e) => JSON.stringify(e).includes(ID.deluxe))).toBe(false);
  });

  it("dato equivocado con el dato: corrección y lo que sabe (con la sesión, tema = pregunta del cliente)", async () => {
    await calificarRespuesta({ motivo: "dato", pregunta: PREGUNTA, original: ORIGINAL, texto: "Tiene 4 habitaciones.", guardarEnLoQueSabe: true });
    expect(estado.admin.tablas.correcciones).toHaveLength(1);
    expect(estado.sesion!.supabase.tablas.conocimiento).toEqual([
      expect.objectContaining({ corredor_id: ID.deluxe, tema: PREGUNTA, respuesta: "Tiene 4 habitaciones.", estado: "activo" }),
    ]);
  });

  it("sin texto: duda pendiente en el Cerebro y ninguna corrección", async () => {
    const r = await calificarRespuesta({ motivo: "falta", pregunta: PREGUNTA, original: ORIGINAL, texto: ORIGINAL });
    expect(r).toMatchObject({ ok: true, plan: { duda: PREGUNTA, correccion: null } });
    expect(estado.admin.tablas.correcciones ?? []).toEqual([]);
    expect(estado.admin.tablas.conocimiento).toEqual([
      expect.objectContaining({ corredor_id: ID.deluxe, tema: PREGUNTA, estado: "pendiente", origen: "duda", conversacion_id: null }),
    ]);
  });

  it("la misma duda dos veces no se repite: suma una vez más", async () => {
    await calificarRespuesta({ motivo: "falta", pregunta: PREGUNTA, original: ORIGINAL, texto: "" });
    await calificarRespuesta({ motivo: "falta", pregunta: PREGUNTA.toUpperCase(), original: ORIGINAL, texto: "" });
    expect(estado.admin.tablas.conocimiento).toHaveLength(1);
    // La segunda vez cambia la misma fila (veces + 1) en vez de crear otra.
    expect(estado.admin.escrituras.filter((e) => e.tabla === "conocimiento").map((e) => e.op)).toEqual(["insert", "update"]);
  });

  it("debió pasármelo: no escribe nada y avisa de Ajustes", async () => {
    const r = await calificarRespuesta({ motivo: "pasarmelo", pregunta: PREGUNTA, original: ORIGINAL, texto: "Eso lo ve Patricia." });
    expect(r).toMatchObject({ ok: true, plan: { irAAjustes: true } });
    expect(escrituras()).toEqual([]);
  });

  it("tocar dos veces Enseñárselo no deja dos correcciones ni dos cosas sabidas", async () => {
    const p = { motivo: "dato", pregunta: PREGUNTA, original: ORIGINAL, texto: "Tiene 4 habitaciones.", guardarEnLoQueSabe: true };
    await calificarRespuesta(p);
    await calificarRespuesta(p);
    expect(estado.admin.tablas.correcciones).toHaveLength(1);
    expect(estado.sesion!.supabase.tablas.conocimiento).toHaveLength(1);
  });

  it("un pedido inválido no escribe", async () => {
    const r = await calificarRespuesta({ motivo: "borrar", original: ORIGINAL });
    expect(r).toMatchObject({ ok: false });
    expect(escrituras()).toEqual([]);
  });

  it("en la demo escribe igual que el Cerebro (datos del corredor de demo)", async () => {
    conSesion(ID.deluxe, false);
    await calificarRespuesta({ motivo: "tono", pregunta: PREGUNTA, original: ORIGINAL, texto: "Claro, son 3." });
    expect(estado.admin.tablas.correcciones).toHaveLength(1);
  });

  it("si la base falla: mensaje para el corredor y en el registro nada del texto", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    estado.admin.errorEn.correcciones = { code: "23502", message: "null value: Tiene 4 habitaciones privadas" };
    const r = await calificarRespuesta({ motivo: "tono", pregunta: PREGUNTA, original: ORIGINAL, texto: "Tiene 4 habitaciones privadas" });
    expect(r).toMatchObject({ ok: false });
    const registrado = error.mock.calls.map((c) => String(c[0])).join("\n");
    expect(registrado).toContain("error_calificar_prueba");
    expect(registrado).not.toContain("habitaciones");
    expect(registrado).not.toContain("Escazú");
  });

  it("sin sesión manda a entrar y no escribe", async () => {
    estado.sesion = null;
    await expect(calificarRespuesta({ motivo: "tono", original: ORIGINAL, texto: "x" })).rejects.toMatchObject({ url: "/entrar" });
    expect(estado.admin.escrituras).toEqual([]);
  });
});
