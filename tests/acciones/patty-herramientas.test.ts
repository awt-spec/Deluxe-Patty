import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, conAlertasReales, estado, supabaseFalso } from "./entorno";

// Herramientas del chat de Patty: solo casas del propio corredor, solo fotos originales del Storage propio.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => ({ dependenciasPara: () => ({}) }));
const ficha = vi.fn(async (..._a: unknown[]) => ({ tipo: "pdf" as const, url: "https://x/ficha.pdf", nombreArchivo: "Ficha.pdf", leyenda: "" }));
vi.mock("@/lib/fichas/comando", () => ({ fichaDePropiedad: (...a: unknown[]) => ficha(...a) }));

const acciones = await import("@/app/panel/patty-herramientas-acciones");

const BASE = "https://portal.supabase.co/storage/v1/object/public/fotos";
const propia = (n: number) => `${BASE}/${ID.deluxe}/${ID.casa}/originales/${n}.jpg`;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://portal.supabase.co";
  process.env.SUPABASE_URL = "https://portal.supabase.co";
  const filas = () => ({
    propiedades: [
      {
        id: ID.casa,
        corredor_id: ID.deluxe,
        codigo: "P-001",
        titulo: "Casa en Escazú",
        zona: "Escazú",
        estado: "activa",
        created_at: "2026-11-01",
        fotos: [
          { url: propia(2), orden: 2, mejorada_url: `${BASE}/${ID.deluxe}/${ID.casa}/mejoradas/2.jpg` },
          { url: propia(1), orden: 1 },
          { url: "https://otro-sitio.com/robada.jpg", orden: 3 },
        ],
      },
      { id: ID.casaAjena, corredor_id: ID.otro, codigo: "X-1", titulo: "Ajena", zona: null, estado: "activa", created_at: "2026-11-01", fotos: [] },
    ],
    corredores: [{ id: ID.deluxe, slug: "deluxe-properties" }],
    leads_duenos: [
      { id: "l1", corredor_id: ID.deluxe, es_dueno: true, titulo: "Casa en Santa Ana", zona: "Santa Ana", precio: 300000, moneda: "USD", url: "https://www.encuentra24.com/x", foto_url: "https://img.encuentra24.com/1.jpg", estado_contacto: "nuevo", created_at: new Date().toISOString() },
      { id: "l2", corredor_id: ID.deluxe, es_dueno: true, titulo: "Lote", zona: null, precio: null, moneda: null, url: "https://malo.com/x", foto_url: null, estado_contacto: "contactado", created_at: "2026-01-01T00:00:00Z" },
      { id: "l3", corredor_id: ID.otro, es_dueno: true, titulo: "Ajeno", zona: null, precio: null, moneda: null, url: null, foto_url: null, estado_contacto: "nuevo", created_at: new Date().toISOString() },
    ],
  });
  estado.sesion = {
    corredor: { id: ID.deluxe, activo: true, nombre: "Deluxe" },
    usuario: { id: ID.usuario, email: "patricia@ejemplo.com" },
    supabase: conAlertasReales(supabaseFalso(filas())),
  };
  estado.admin = conAlertasReales(supabaseFalso(filas()));
});

describe("herramientas del chat de Patty", () => {
  it("lista solo las casas del corredor, con su portada", async () => {
    const r = await acciones.casasParaPatty();
    expect(r.ok && r.casas.map((c) => c.id)).toEqual([ID.casa]);
  });

  it("las fotos son las originales propias, en su orden (sin mejoradas ni ajenas)", async () => {
    const r = await acciones.fotosDeCasaPatty(ID.casa);
    expect(r).toMatchObject({ ok: true, fotos: [propia(1), propia(2)] });
  });

  it("con una casa de otro corredor no da nada", async () => {
    expect((await acciones.fotosDeCasaPatty(ID.casaAjena)).ok).toBe(false);
    expect((await acciones.fichaDeCasaPatty(ID.casaAjena)).ok).toBe(false);
    expect((await acciones.fotosDeCasaPatty("no-es-un-id")).ok).toBe(false);
    expect(ficha).not.toHaveBeenCalled();
  });

  it("la ficha sale con el código de la casa propia", async () => {
    const r = await acciones.fichaDeCasaPatty(ID.casa);
    expect(r).toEqual({ ok: true, url: "https://x/ficha.pdf", nombre: "Ficha.pdf" });
    expect(ficha.mock.calls[0][2]).toBe("P-001");
  });
});

describe("revisar casas y dueños", () => {
  it("revisa solo las casas propias", async () => {
    const r = await acciones.revisarCasasPatty();
    expect(r.ok && r.pendientes.map((p) => p.casa.id)).toEqual([ID.casa]);
  });

  it("los dueños son solo los propios, sin escribirles primero, y enlaces solo de Encuentra24", async () => {
    const r = await acciones.duenosPatty();
    expect(r).toMatchObject({ ok: true, sinEscribir: 1, ultimaSemana: 1 });
    expect(r.ok && r.recientes.map((d) => d.id)).toEqual(["l1"]);
    expect(r.ok && r.recientes[0].url).toBe("https://www.encuentra24.com/x");
  });
});
