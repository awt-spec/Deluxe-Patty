import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

// Hallazgos del QA del panel (17-18 nov 2026) en la ficha del cliente: el cierre (reabrir y volver a cerrar, avisos
// que no borran lo escrito, doble toque), el recordatorio (fecha vacía, nota larga, Enter) y la oferta ambigua.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("next/server", () => import("./mocks/servidor-next"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => import("./mocks/dependencias"));

const clientes = await import("@/app/panel/clientes/acciones");

const corredor = { id: ID.deluxe, activo: true, zona_horaria: "America/Costa_Rica", comision_pct: 5 };
const CERRADO_EN_SEPTIEMBRE = {
  etapa: "cerrado",
  etapa_at: "2026-09-10T15:00:00Z",
  cierre_at: "2026-09-10T15:00:00Z",
  cierre_precio: 300_000,
  cierre_comision: 15_000,
  cierre_moneda: "USD",
  cierre_propiedad_id: null,
  busca: { operacion: "venta" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T04:30:00Z")); // martes 17 de noviembre, 22:30 en Costa Rica
  const filas = {
    contactos: [
      { id: ID.cliente, corredor_id: ID.deluxe, etapa: "interesado", cierre_at: null, cierre_precio: null, seguimiento_fecha: "2026-11-24", seguimiento_nota: "Llamarla" },
      { id: ID.clienteAjeno, corredor_id: ID.otro, etapa: "cerrado", cierre_at: "2026-09-10T15:00:00Z", cierre_precio: 400_000, cierre_moneda: "USD" },
    ],
    propiedades: [
      { id: ID.casa, corredor_id: ID.deluxe, titulo: "Apartamento", precio: 2_800, moneda: "USD", operacion: "alquiler" },
      { id: ID.casaAjena, corredor_id: ID.otro, titulo: "Otra", precio: 100_000, moneda: "USD", operacion: "venta" },
    ],
  };
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso(filas) };
  estado.admin = supabaseFalso(structuredClone(filas));
});
afterEach(() => vi.useRealTimers());

const cliente = () => estado.admin.tablas.contactos[0];
const historia = () => (estado.admin.tablas.actividades ?? []).map((a) => String(a.texto));
const escrituras = () => [...estado.sesion!.supabase.escrituras, ...estado.admin.escrituras];
const aviso = (url: string) => new URL(url, "https://x").searchParams.get("aviso");

describe("Cierre: reabrir y volver a cerrar es un cierre nuevo, con la fecha de hoy", () => {
  it("desde la ficha: al sacarlo de Cerró se anula el cierre; al volver, el nuevo cuenta en noviembre", async () => {
    Object.assign(cliente(), CERRADO_EN_SEPTIEMBRE);
    await redirigeA(clientes.cambiarEtapa(formulario({ id: ID.cliente, etapa: "negociando" })));
    expect(cliente()).toMatchObject({ etapa: "negociando", cierre_precio: null, cierre_comision: null, cierre_moneda: null, cierre_at: null });
    expect(historia()).toContain("Cierre anulado: era $300.000,00".replace(/ /g, " "));

    await redirigeA(clientes.cambiarEtapa(formulario({ id: ID.cliente, etapa: "cerrado" })));
    expect(cliente()).toMatchObject({ etapa: "cerrado", cierre_at: "2026-11-18T04:30:00.000Z", etapa_at: "2026-11-18T04:30:00.000Z", cierre_precio: null });

    const r = await clientes.anotarCierre(formulario({ id: ID.cliente, precio: "450000", comision: "", moneda: "USD" }));
    expect(r).toEqual({ ok: true, aviso: "¡Felicidades! Cierre guardado." });
    expect(cliente()).toMatchObject({ cierre_precio: 450_000, cierre_at: "2026-11-18T04:30:00.000Z" });
    expect(historia().at(-1)).not.toMatch(/corregido/);
  });

  it("desde el tablero igual: sacarlo de Cerró limpia el cierre (lo escribe el backend, filtrando por corredor)", async () => {
    Object.assign(cliente(), CERRADO_EN_SEPTIEMBRE);
    expect(await clientes.moverEtapa(ID.cliente, "negociando")).toBe(true);
    expect(cliente()).toMatchObject({ etapa: "negociando", cierre_precio: null, cierre_at: null });
    const cambio = estado.admin.escrituras.find((e) => e.tabla === "contactos" && e.op === "update")!;
    expect(cambio.filtros).toEqual([["corredor_id", ID.deluxe], ["id", ID.cliente]]);
    expect(await clientes.cerrarDesdeTablero(ID.cliente, { precio: "450000", moneda: "USD", comision: "" })).toEqual({ ok: true });
    expect(cliente()).toMatchObject({ cierre_precio: 450_000, cierre_at: "2026-11-18T04:30:00.000Z" });
  });

  it("«Cambiar el cierre» de uno ya cerrado sigue sin volver a fecharlo", async () => {
    Object.assign(cliente(), CERRADO_EN_SEPTIEMBRE);
    expect(await clientes.anotarCierre(formulario({ id: ID.cliente, precio: "290000", comision: "", moneda: "USD" }))).toEqual({ ok: true, aviso: "Listo, cierre corregido." });
    expect(cliente()).toMatchObject({ cierre_precio: 290_000, cierre_at: "2026-09-10T15:00:00Z", etapa_at: "2026-09-10T15:00:00Z" });
  });

  it("con un cliente de otro corredor no hace nada", async () => {
    expect(await clientes.moverEtapa(ID.clienteAjeno, "negociando")).toBe(false);
    await redirigeA(clientes.cambiarEtapa(formulario({ id: ID.clienteAjeno, etapa: "negociando" })));
    expect(await clientes.anotarCierre(formulario({ id: ID.clienteAjeno, precio: "450000", comision: "", moneda: "USD" }))).toEqual({ ok: false, motivo: "No se encontró el cliente." });
    expect(escrituras()).toEqual([]);
    expect(estado.admin.tablas.contactos[1]).toMatchObject({ etapa: "cerrado", cierre_precio: 400_000 });
  });
});

describe("Cierre: un aviso no borra lo escrito y un doble toque no duplica", () => {
  it("con un precio ambiguo devuelve el motivo sin redirigir ni escribir (el formulario se queda con «1,180»)", async () => {
    Object.assign(cliente(), { etapa: "cerrado" });
    const r = await clientes.anotarCierre(formulario({ id: ID.cliente, precio: "1,180", comision: "", moneda: "USD" }));
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/«1,180» puede ser/) });
    expect(escrituras()).toEqual([]);
  });

  it("guardar el mismo cierre dos veces escribe una vez y no anota un «Cierre corregido» que no corrigió nada", async () => {
    Object.assign(cliente(), { etapa: "cerrado", busca: { operacion: "venta" } });
    const datos = { id: ID.cliente, precio: "450000", comision: "5", moneda: "USD" };
    expect(await clientes.anotarCierre(formulario(datos))).toEqual({ ok: true, aviso: "¡Felicidades! Cierre guardado." });
    expect(await clientes.anotarCierre(formulario(datos))).toEqual({ ok: true, aviso: "Listo, el cierre ya estaba así." });
    expect(estado.admin.escrituras.filter((e) => e.tabla === "contactos")).toHaveLength(1);
    expect(historia().filter((t) => /Cierre corregido/.test(t))).toEqual([]);
  });

  it("guardarCierre (sin JavaScript) sigue volviendo con el aviso", async () => {
    Object.assign(cliente(), { etapa: "cerrado" });
    expect(aviso(await redirigeA(clientes.guardarCierre(formulario({ id: ID.cliente, precio: "", comision: "", moneda: "USD" }))))).toBe("Escribe el precio final.");
  });
});

describe("Recordatorio", () => {
  it("«Otro día» con la fecha vacía no borra el recordatorio: pide el día", async () => {
    const url = await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.cliente, nota: "Llamarla", fecha: "" })));
    expect(aviso(url)).toBe("Elige el día del recordatorio.");
    expect(cliente()).toMatchObject({ seguimiento_fecha: "2026-11-24", seguimiento_nota: "Llamarla" });
    expect(escrituras()).toEqual([]);
  });

  it("una fecha que no existe tampoco toca nada", async () => {
    await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.cliente, nota: "x", fecha: "2026-02-31" })));
    expect(escrituras()).toEqual([]);
  });

  it("Enter en el texto (sin botón de días) guarda el texto con la fecha que ya tenía, no «Mañana»", async () => {
    await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.cliente, nota: "Llamarla para la segunda visita", fecha: "2026-11-24" })));
    expect(estado.sesion!.supabase.tablas.contactos[0]).toMatchObject({ seguimiento_fecha: "2026-11-24", seguimiento_nota: "Llamarla para la segunda visita" });
  });

  it("«Mañana» es el día siguiente en la zona del corredor (de noche, el 18)", async () => {
    await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.cliente, nota: "Llamarla", dias: "1", fecha: "2026-11-24" })));
    expect(estado.sesion!.supabase.tablas.contactos[0]).toMatchObject({ seguimiento_fecha: "2026-11-18" });
  });

  it("una nota de más de 500 letras no se corta a escondidas: se avisa y no se guarda", async () => {
    const url = await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.cliente, nota: "a".repeat(600), fecha: "2026-11-24" })));
    expect(aviso(url)).toMatch(/hasta 500/);
    expect(escrituras()).toEqual([]);
  });

  it("«Ya lo hice» lo quita; con un cliente de otro corredor no toca nada", async () => {
    await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.clienteAjeno, quitar: "1" })));
    await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.clienteAjeno, nota: "x", fecha: "2026-11-24" })));
    expect(estado.sesion!.supabase.escrituras.every((e) => e.filtros.some(([c, v]) => c === "corredor_id" && v === ID.deluxe))).toBe(true);
    expect(estado.sesion!.supabase.tablas.contactos[1].seguimiento_fecha).toBeUndefined();
    await redirigeA(clientes.guardarSeguimiento(formulario({ id: ID.cliente, quitar: "1" })));
    expect(estado.sesion!.supabase.tablas.contactos[0]).toMatchObject({ seguimiento_fecha: null, seguimiento_nota: null });
  });
});

describe("Oferta con el mismo criterio que el cierre", () => {
  it("«1,180» se pregunta y no pasa al cliente a Negociando", async () => {
    const url = await redirigeA(clientes.guardarOportunidad(formulario({ id: ID.cliente, casa: ID.casa, oferta: "1,180", oferta_moneda: "USD" })));
    expect(aviso(url)).toMatch(/Revisa la oferta: «1,180» puede ser 1,18 o 1\.180/);
    expect(cliente()).toMatchObject({ etapa: "interesado" });
    expect(escrituras()).toEqual([]);
  });

  it("una oferta de menos del 20 % de la lista se explica y no se guarda", async () => {
    const url = await redirigeA(clientes.guardarOportunidad(formulario({ id: ID.cliente, casa: ID.casa, oferta: "500", oferta_moneda: "USD" })));
    expect(aviso(url)).toMatch(/Revisa la oferta\. Entendí \$500,00 y la casa está en \$2\.800,00/);
    expect(escrituras()).toEqual([]);
  });

  it("una oferta creíble se guarda y lo pasa a Negociando", async () => {
    const url = await redirigeA(clientes.guardarOportunidad(formulario({ id: ID.cliente, casa: ID.casa, oferta: "2.500", oferta_moneda: "USD" })));
    expect(aviso(url)).toBe("Guardado. Lo pasé a Negociando.");
    expect(cliente()).toMatchObject({ etapa: "negociando", oferta_monto: 2_500 });
  });
});
