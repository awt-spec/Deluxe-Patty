import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, supabaseFalso } from "./entorno";

// Cargar una casa desde el chat de Patty usa las mismas acciones de "Agregar casa": conversarCasa arma la ficha
// (nunca guarda) y guardarCasaConversada la guarda solo cuando el corredor toca "Sí, guardarla".

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

const presupuesto = { gastoDia: 0, gastoMes: 0, topeDia: 10, topeMes: 150 };
const registrarUso = vi.fn(async () => {});
const FICHA_LISTA = {
  titulo: "Casa con piscina en Escazú",
  tipo: "casa",
  operacion: "venta",
  precio: 450000,
  moneda: "USD",
  provincia: "San José",
  canton: "Escazú",
  distrito: null,
  zona: "Escazú",
  habitaciones: 3,
  banos: 2,
  m2_construccion: null,
  m2_terreno: null,
  descripcion: null,
  amenidades: ["Piscina"],
};
const fichaConversada = vi.fn(async () => ({ ficha: FICHA_LISTA, pregunta: null, consumo: { tokensEntrada: 10, tokensSalida: 5, costoUsd: 0.01 } }));
vi.mock("@/lib/asistente/dependencias", () => ({
  dependenciasPara: () => ({ repo: { presupuestoIA: async () => presupuesto, registrarUso }, cerebro: { fichaConversada }, whatsapp: {}, db: estado.admin }),
}));

const casas = await import("@/app/panel/propiedades/acciones");

const corredor = { id: ID.deluxe, activo: true, nombre: "Deluxe", nombre_contacto: "Patricia", zona_horaria: "America/Costa_Rica" };

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(presupuesto, { gastoDia: 0, gastoMes: 0 });
  const filas = {
    propiedades: [
      { id: ID.casa, corredor_id: ID.deluxe, codigo: "P-001", fotos: [], estado: "activa" },
      { id: ID.casaAjena, corredor_id: ID.otro, codigo: "P-007", fotos: [], estado: "activa" },
    ],
  };
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso(filas) };
  estado.admin = supabaseFalso(structuredClone(filas));
});

const escrituras = () => [...estado.sesion!.supabase.escrituras, ...estado.admin.escrituras];

describe("Casa desde el chat de Patty: sin confirmación no se guarda", () => {
  it("armar la ficha, aunque ya esté lista, no escribe ninguna propiedad", async () => {
    const r = await casas.conversarCasa([{ autor: "corredor", texto: "agrega esta casa: Escazú, venta, 450 mil, 3 cuartos" }], null);
    expect(r).toMatchObject({ lista: true, mensaje: "Así quedó. ¿Está bien?" });
    expect("resumen" in r && r.resumen[0]).toBe("Casa con piscina en Escazú");
    expect(escrituras()).toEqual([]);
    expect(registrarUso).toHaveBeenCalledOnce();
  });

  it("si falta lo esencial, pregunta y no guarda", async () => {
    fichaConversada.mockResolvedValueOnce({ ficha: { ...FICHA_LISTA, operacion: null } as never, pregunta: null, consumo: { tokensEntrada: 1, tokensSalida: 1, costoUsd: 0 } });
    const r = await casas.conversarCasa([{ autor: "corredor", texto: "agrega esta casa en Escazú" }], null);
    expect(r).toMatchObject({ lista: false, mensaje: "¿Es para venta o para alquiler?" });
    expect(escrituras()).toEqual([]);
  });

  it("con el tope de gasto alcanzado no llama a la IA", async () => {
    presupuesto.gastoDia = 10;
    const r = await casas.conversarCasa([{ autor: "corredor", texto: "agrega esta casa: Escazú" }], null);
    expect(r).toHaveProperty("error");
    expect(fichaConversada).not.toHaveBeenCalled();
  });

  it("guardar una ficha incompleta no escribe nada", async () => {
    const r = await casas.guardarCasaConversada({ ...FICHA_LISTA, precio: null });
    expect(r).toHaveProperty("error");
    expect(escrituras()).toEqual([]);
  });

  it("al confirmar guarda con el corredor de la sesión y el siguiente código, aunque la ficha diga otro corredor", async () => {
    const r = await casas.guardarCasaConversada({ ...FICHA_LISTA, corredor_id: ID.otro, codigo: "P-007", id: ID.casaAjena });
    expect(r).toEqual({ id: expect.any(String), codigo: "P-002", titulo: "Casa con piscina en Escazú" });
    const [insercion, ...otras] = escrituras();
    expect(otras).toEqual([]);
    expect(insercion).toMatchObject({ tabla: "propiedades", op: "insert", valores: { corredor_id: ID.deluxe, codigo: "P-002" } });
    expect(insercion.valores).not.toHaveProperty("id");
  });

  it("sin sesión no arma ni guarda", async () => {
    estado.sesion = null;
    await expect(casas.guardarCasaConversada(FICHA_LISTA)).rejects.toMatchObject({ url: "/entrar" });
    await expect(casas.conversarCasa([{ autor: "corredor", texto: "agrega esta casa" }], null)).rejects.toMatchObject({ url: "/entrar" });
    expect(fichaConversada).not.toHaveBeenCalled();
  });
});
