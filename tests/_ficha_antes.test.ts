import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/panel/clientes/x", useRouter: () => ({ push() {}, refresh() {} }), redirect() {}, notFound() {} }));
vi.mock("@/app/panel/clientes/acciones", () => {
  const f = (n: string) => `/accion/${n}`;
  return {
    cambiarEtapa: f("cambiarEtapa"),
    guardarBusca: f("guardarBusca"),
    guardarCierre: f("guardarCierre"),
    guardarNotas: f("guardarNotas"),
    guardarOportunidad: f("guardarOportunidad"),
    guardarSeguimiento: f("guardarSeguimiento"),
    unirCliente: f("unirCliente"),
    anotarActividad: f("anotarActividad"),
  };
});

const DIR = "/tmp/claude-0/-home-user-Deluxe-Patty/a262ba1f-02c1-563a-ad64-3acf0f3d4c56/scratchpad/ficha";
const FASE = process.env.FASE_FICHA ?? "antes";
const ahora = new Date("2026-11-13T15:00:00Z");
const zona = "America/Costa_Rica";
const h = (horas: number) => new Date(ahora.getTime() + horas * 3_600_000).toISOString();
const foto = (url: string) => ({ url, orden: 0 }) as never;

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  nombre: null as string | null,
  telefono: "+50688001234",
  origen: "whatsapp",
  notas: null as string | null,
  etapa: "nuevo",
  etapa_at: h(-2),
  busca: {},
  seguimiento_fecha: null as string | null,
  seguimiento_nota: null as string | null,
  motivo_perdida: null as string | null,
  created_at: h(-2),
  oferta_monto: null as number | null,
  oferta_moneda: null as string | null,
  cierre_precio: null as number | null,
  cierre_comision: null as number | null,
  cierre_moneda: null as string | null,
  cierre_at: null as string | null,
};
const casaA = { id: "c1", titulo: "Casa en Escazú", operacion: "venta", tipo: "casa", precio: 450000, moneda: "USD", zona: "Escazú", canton: "Escazú", habitaciones: 3, fotos: [foto("https://x/a.jpg")] };
const casaB = { id: "c2", titulo: "Apto en Santa Ana", operacion: "venta", tipo: "apartamento", precio: null, moneda: "USD", zona: null, canton: null, habitaciones: 2, fotos: [] };
const casaC = { id: "c3", titulo: "Lote Lindora", operacion: "venta", tipo: "lote", precio: 85000000, moneda: "CRC", zona: "Lindora", canton: "Santa Ana", habitaciones: null, fotos: [] };
const todas = [
  { id: "c1", titulo: "Casa en Escazú", precio: 450000, moneda: "USD", estado: "activa", operacion: "venta" },
  { id: "c2", titulo: "Apto en Santa Ana", precio: null, moneda: "USD", estado: "activa", operacion: "venta" },
  { id: "c3", titulo: "Lote Lindora", precio: 85000000, moneda: "CRC", estado: "activa", operacion: "venta" },
  { id: "c9", titulo: "Vendida Rohrmoser", precio: 300000, moneda: "USD", estado: "vendida", operacion: "venta" },
  { id: "c8", titulo: "Alquiler Sabana", precio: 1500, moneda: "USD", estado: "activa", operacion: "alquiler" },
];
const otros = [
  { id: "o1", nombre: "Ana Mora", telefono: "+50677001111", email: "ana@x.cr" },
  { id: "o2", nombre: null, telefono: "+50677002222", email: null },
];
const comun = { aviso: undefined as string | undefined, conversacionId: null as string | null, visitas: [] as never[], casasEncajan: [] as never[], casaInteres: null, casaCierre: null, todas, otros, parecidos: [] as never[], eventos: [] as never[], diasSinMovimiento: 0, anuncio: null, vinoDelSitio: false, ahora, zona, nombreAsistente: "Patty", comisionPct: 5 };

const juegos: Record<string, object> = {
  a: { ...comun, c: { ...base } },
  b: {
    ...comun,
    aviso: "Listo",
    conversacionId: "conv-1",
    c: { ...base, nombre: "Ana Mora", etapa: "negociando", etapa_at: h(-24 * 5), created_at: h(-24 * 20), origen: "anuncio", oferta_monto: 80000000, oferta_moneda: "CRC", seguimiento_fecha: "2026-11-10", seguimiento_nota: "llamarla", notas: "Tiene dos hijos y busca colegio cerca", busca: { operacion: "venta", tipo: "casa", zonas: ["Escazú", "Santa Ana"], presupuesto_max: 90000000, moneda: "CRC", habitaciones: 3 } },
    visitas: [{ id: "v1", inicio: h(26), fin: h(27), estado: "confirmada", casa: "Lote Lindora" }, { id: "v2", inicio: h(-48), fin: h(-47), estado: "realizada", casa: "Casa en Escazú" }],
    casasEncajan: [casaA, casaC],
    casaInteres: { ...todas[2], zona: "Lindora", fotos: [] },
    parecidos: [otros[0]],
    eventos: [{ cuando: new Date(h(-3)), tipo: "llamada", texto: "Lo llamé" }, { cuando: new Date(h(-30)), tipo: "oferta", texto: "Ofreció", autor: "Patricia" }],
    diasSinMovimiento: 4,
    anuncio: { titulo: null, referencia: "E24-77" },
  },
  c: {
    ...comun,
    c: { ...base, nombre: "Luis", etapa: "cerrado", etapa_at: h(-24), created_at: h(-24 * 60), origen: "referido", cierre_precio: 420000, cierre_comision: 21000, cierre_moneda: "USD", cierre_at: h(-24), oferta_monto: 410000, oferta_moneda: "USD", notas: "Cliente feliz" },
    casaInteres: { ...todas[0], zona: "Escazú", fotos: casaA.fotos },
    casaCierre: { ...todas[0] },
    diasSinMovimiento: 1,
    vinoDelSitio: true,
  },
  d: {
    ...comun,
    c: { ...base, nombre: "Pedro", etapa: "perdido", etapa_at: h(-24 * 3), created_at: h(-24), origen: "raro", motivo_perdida: "Compró con otro", seguimiento_fecha: "2026-11-14", seguimiento_nota: "ver", busca: { operacion: "alquiler", zonas: ["Escazú"], presupuesto_max: 2000 } },
    casasEncajan: [casaA, casaB],
    diasSinMovimiento: 3,
  },
  e: {
    ...comun,
    c: { ...base, nombre: "Rosa", etapa: "cerrado", etapa_at: h(0), created_at: h(-24 * 7), seguimiento_fecha: "2026-11-13", seguimiento_nota: "firmar", busca: { operacion: "alquiler" } },
    casaInteres: { ...todas[4] },
    diasSinMovimiento: 5,
  },
  f: {
    ...comun,
    c: { ...base, nombre: "Eva", etapa: "interesado", etapa_at: h(-24), created_at: h(-24 * 2), seguimiento_fecha: "2026-11-20", busca: { tipo: "apartamento" } },
    casaInteres: { ...todas[3] },
    casasEncajan: [casaB],
    diasSinMovimiento: 2,
    eventos: Array.from({ length: 12 }, (_, i) => ({ cuando: new Date(h(-i * 10)), tipo: "nota", texto: `Nota ${i}` })),
  },
  g: { ...comun, c: { ...base, etapa: "visita", seguimiento_fecha: "2026-11-14" }, casaInteres: { ...todas[1], fotos: [] }, diasSinMovimiento: 1 },
};

describe("foto de la ficha", () => {
  it("renderiza", async () => {
    const { FichaCliente } = await import("@/app/panel/clientes/[id]/vista");
    for (const [k, d] of Object.entries(juegos)) {
      const html = renderToStaticMarkup(createElement(FichaCliente, d as never));
      writeFileSync(`${DIR}/${FASE}-${k}.html`, html.replace(/></g, ">\n<"));
    }
  });
});
