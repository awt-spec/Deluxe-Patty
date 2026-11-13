import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("next/server", () => import("./mocks/servidor-next"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => import("./mocks/dependencias"));

const casas = await import("@/app/panel/propiedades/acciones");

const corredor = { id: ID.deluxe, activo: true, zona_horaria: "America/Costa_Rica" };
const TEMA = "Ubicación DP-LHD6L0: ¿dónde queda «Casa La Escondida»? El sitio dice «Santa Ana Centro». Opciones: Lindora | Santa Ana";

beforeEach(() => {
  const filas = {
    propiedades: [
      { id: ID.casa, corredor_id: ID.deluxe, codigo: "DP-LHD6L0", titulo: "Casa La Escondida", canton: "Santa Ana", distrito: "Santa Ana Centro", zona: "Lindora", estado: "activa", fotos: [] },
      { id: ID.casaAjena, corredor_id: ID.otro, codigo: "DP-OTRA01", titulo: "Ajena", canton: "Escazú", distrito: null, zona: "Escazú", estado: "activa", fotos: [] },
    ],
    conocimiento: [
      { id: "k1", corredor_id: ID.deluxe, tema: TEMA, respuesta: null, estado: "pendiente" },
      { id: "k2", corredor_id: ID.otro, tema: "Ubicación DP-OTRA01: ¿dónde queda «Ajena»? El sitio dice «Escazú».", respuesta: null, estado: "pendiente" },
    ],
  };
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso(filas) };
  estado.admin = supabaseFalso(structuredClone(filas));
});

const escrituras = () => [...estado.sesion!.supabase.escrituras, ...estado.admin.escrituras];

describe("¿Dónde queda esta casa?", () => {
  it("con una casa de otro corredor no hace nada", async () => {
    const url = await redirigeA(casas.confirmarUbicacion(formulario({ id: ID.casaAjena, zona: "Lindora" })));
    expect(url).toMatch(/No%20encontr/);
    expect(escrituras()).toEqual([]);
  });

  it("sin zona o con un id inventado no escribe", async () => {
    await redirigeA(casas.confirmarUbicacion(formulario({ id: ID.casa, zona: "  " })));
    await redirigeA(casas.confirmarUbicacion(formulario({ id: "1 or 1=1", zona: "Lindora" })));
    expect(escrituras()).toEqual([]);
  });

  it("guarda la zona en la casa y la respuesta en el cerebro (la importación la respeta)", async () => {
    const url = await redirigeA(casas.confirmarUbicacion(formulario({ id: ID.casa, zona: "santa ana", volver_a: "ficha" })));
    expect(url).toMatch(new RegExp(`^/panel/propiedades/${ID.casa}\\?aviso=Listo`));
    const db = estado.sesion!.supabase;
    expect(db.tablas.propiedades.find((p) => p.id === ID.casa)!.zona).toBe("Santa Ana");
    expect(db.tablas.conocimiento.find((k) => k.id === "k1")).toMatchObject({ estado: "activo", respuesta: "Santa Ana" });
    // La del otro corredor sigue igual, y toda escritura va filtrada por el corredor.
    expect(db.tablas.conocimiento.find((k) => k.id === "k2")).toMatchObject({ estado: "pendiente", respuesta: null });
    expect(db.escrituras.every((e) => e.filtros.some(([c, v]) => c === "corredor_id" && v === ID.deluxe))).toBe(true);
    expect(estado.admin.escrituras).toEqual([]);
  });

  it("si no había pregunta, la crea ya contestada", async () => {
    estado.sesion!.supabase.tablas.conocimiento = [];
    await redirigeA(casas.confirmarUbicacion(formulario({ id: ID.casa, zona: "Lindora" })));
    const [k] = estado.sesion!.supabase.tablas.conocimiento;
    expect(k).toMatchObject({ corredor_id: ID.deluxe, estado: "activo", respuesta: "Lindora" });
    expect(String(k.tema)).toMatch(/^Ubicación DP-LHD6L0: /);
  });

  it("«Volver a ofrecerla» desde Mis casas vuelve a la lista; con una casa ajena no hace nada", async () => {
    estado.sesion!.supabase.tablas.propiedades[0].estado = "inactiva";
    expect(await redirigeA(casas.cambiarEstado(formulario({ id: ID.casa, estado: "activa", volver_a: "lista" })))).toMatch(/^\/panel\/propiedades\?aviso=Listo/);
    expect(estado.sesion!.supabase.tablas.propiedades[0].estado).toBe("activa");
    const antes = escrituras().length;
    await redirigeA(casas.cambiarEstado(formulario({ id: ID.casaAjena, estado: "activa", volver_a: "lista" })));
    expect(escrituras().length).toBe(antes);
  });
});
