import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

// H-04 (QA): «Mejorar fotos» del panel no respetaba `imagenes_activas` (solo miraba la demo y el tope).

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

const presupuesto = { gastoDia: 0, gastoMes: 0, topeDia: 10, topeMes: 150 };
vi.mock("@/lib/asistente/dependencias", () => ({
  dependenciasPara: () => ({ repo: { presupuestoIA: async () => presupuesto }, fotos: {} }),
}));
const mejorarFotos = vi.fn(async () => ({ mensajes: ["Listo"], mejoradas: [{ numero: 1, url: "https://x/1.jpg" }], fallidas: 0 }));
vi.mock("@/lib/fotos/mejorar", () => ({ mejorarFotos }));

const casas = await import("@/app/panel/propiedades/acciones");

let corredor: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(presupuesto, { gastoDia: 0, gastoMes: 0 });
  corredor = { id: ID.deluxe, activo: true, imagenes_activas: true };
  const filas = {
    propiedades: [
      { id: ID.casa, corredor_id: ID.deluxe, codigo: "DP-1", fotos: [], estado: "activa" },
      { id: ID.casaAjena, corredor_id: ID.otro, codigo: "OT-1", fotos: [], estado: "activa" },
    ],
  };
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso(filas) };
  estado.admin = supabaseFalso(structuredClone(filas));
});

const aviso = (url: string) => decodeURIComponent(url.split("aviso=")[1] ?? "");

describe("Mejorar fotos (panel)", () => {
  it("con las imágenes apagadas por el superadmin no llama a OpenAI", async () => {
    corredor.imagenes_activas = false;
    const url = await redirigeA(casas.mejorarFotosPanel(formulario({ id: ID.casa })));
    expect(mejorarFotos).not.toHaveBeenCalled();
    expect(aviso(url)).toContain("Las imágenes con IA están apagadas");
  });

  it("con el tope de gasto superado tampoco", async () => {
    presupuesto.gastoDia = 99;
    const url = await redirigeA(casas.mejorarFotosPanel(formulario({ id: ID.casa })));
    expect(mejorarFotos).not.toHaveBeenCalled();
    expect(aviso(url)).toContain("límite de gasto");
  });

  it("en la demo no, y con la casa de otro corredor no hace nada", async () => {
    corredor.activo = false;
    await redirigeA(casas.mejorarFotosPanel(formulario({ id: ID.casa })));
    corredor.activo = true;
    await redirigeA(casas.mejorarFotosPanel(formulario({ id: ID.casaAjena })));
    expect(mejorarFotos).not.toHaveBeenCalled();
  });

  it("con todo en orden, mejora", async () => {
    const url = await redirigeA(casas.mejorarFotosPanel(formulario({ id: ID.casa })));
    expect(mejorarFotos).toHaveBeenCalledTimes(1);
    expect(aviso(url)).toContain("Mejoré 1 foto");
  });
});
