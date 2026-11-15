import { describe, expect, it } from "vitest";
import {
  anclaDinero,
  antiguedad,
  casasDeFicha,
  cifraDinero,
  contarVisitas,
  cuandoLlego,
  datosBusca,
  desdeCuando,
  enJuego,
  entradaQueSigue,
  estadoPaso,
  estaActivo,
  fechasFicha,
  hace,
  juegoAbierto,
  modoJuego,
  nombreCliente,
  numeroLlego,
  pastillaRecordatorio,
  resumenCasas,
  resumenJuego,
  resumenNotas,
  sabeQueBusca,
  textoHechas,
  textoLlego,
  textoOrigen,
  textoProximas,
  textoSinMovimiento,
  venceRecordatorio,
} from "@/app/panel/clientes/[id]/ficha/reglas";
import type { CasaCorta, CasaFicha, ClienteFicha, DatosFicha } from "@/app/panel/clientes/[id]/ficha/tipos";

// Viernes 13 de noviembre de 2026, 9:00 a. m. en Costa Rica (UTC-6).
const ahora = new Date("2026-11-13T15:00:00Z");
const zona = "America/Costa_Rica";
const h = (horas: number) => new Date(ahora.getTime() + horas * 3_600_000).toISOString();

const cliente = (cambios: Partial<ClienteFicha> = {}): ClienteFicha => ({
  id: "c1",
  nombre: null,
  telefono: "+50688001234",
  origen: "whatsapp",
  notas: null,
  etapa: "interesado",
  etapa_at: h(-24),
  busca: {},
  seguimiento_fecha: null,
  seguimiento_nota: null,
  motivo_perdida: null,
  created_at: h(-24 * 5),
  oferta_monto: null,
  oferta_moneda: null,
  cierre_precio: null,
  cierre_comision: null,
  cierre_moneda: null,
  cierre_at: null,
  ...cambios,
});
const casaCorta = (cambios: Partial<CasaCorta> = {}): CasaCorta => ({ id: "p1", titulo: "Casa Escazú", precio: 400000, moneda: "USD", estado: "activa", operacion: "venta", ...cambios });
const casaFicha = (id: string): CasaFicha => ({ id, titulo: `Casa ${id}`, operacion: "venta", tipo: "casa", precio: 100, moneda: "USD", zona: null, canton: null, habitaciones: 2, fotos: [] });

describe("textos de la cabecera", () => {
  it("origen conocido o tal cual", () => {
    expect(textoOrigen("anuncio")).toBe("un anuncio de Encuentra24");
    expect(textoOrigen("feria")).toBe("feria");
  });
  it("cuándo llegó y hace cuánto", () => {
    expect(cuandoLlego("hoy")).toBe("hoy");
    expect(cuandoLlego("ayer")).toBe("ayer");
    expect(cuandoLlego("lunes 2 de noviembre")).toBe("el lunes 2 de noviembre");
    expect(antiguedad(0)).toBe("");
    expect(antiguedad(1)).toBe("");
    expect(antiguedad(20)).toBe(" (hace 20 días)");
    expect([hace(0), hace(1), hace(4)]).toEqual(["hoy", "ayer", "hace 4 días"]);
  });
  it("nombre o teléfono bonito", () => {
    expect(nombreCliente({ nombre: "Ana", telefono: "+50688001234" })).toBe("Ana");
    expect(nombreCliente({ nombre: null, telefono: "+50688001234" })).not.toBe("+50688001234");
  });
  it("activo solo si no cerró ni se perdió", () => {
    expect(estaActivo("negociando")).toBe(true);
    expect(estaActivo("cerrado")).toBe(false);
    expect(estaActivo("perdido")).toBe(false);
  });
});

describe("fechas", () => {
  it("hoy, mañana y días en la zona del corredor", () => {
    const f = fechasFicha(cliente(), ahora, zona);
    expect(f).toMatchObject({ hoy: "2026-11-13", manana: "2026-11-14", diasEnEtapa: 1, diasCliente: 5 });
    expect(typeof f.llego).toBe("string");
  });
  it("recordatorio: vence hoy o antes; la pastilla dice Atrasado, Hoy, Mañana o el día", () => {
    expect(venceRecordatorio(null, "2026-11-13")).toBe(false);
    expect(venceRecordatorio("2026-11-13", "2026-11-13")).toBe(true);
    expect(venceRecordatorio("2026-11-14", "2026-11-13")).toBe(false);
    expect(pastillaRecordatorio("2026-11-10", "2026-11-13", "2026-11-14")).toBe("Atrasado");
    expect(pastillaRecordatorio("2026-11-13", "2026-11-13", "2026-11-14")).toBe("Hoy");
    expect(pastillaRecordatorio("2026-11-14", "2026-11-13", "2026-11-14")).toBe("Mañana");
    expect(pastillaRecordatorio("2026-11-20", "2026-11-13", "2026-11-14")).toMatch(/20 de noviembre/);
  });
  it("desde cuándo está en la etapa", () => {
    expect(desdeCuando(0)).toBe("desde hoy");
    expect(desdeCuando(1)).toBe("hace 1 día");
    expect(desdeCuando(6)).toBe("hace 6 días");
  });
});

describe("lo que está en juego", () => {
  it("la oferta manda, con su moneda", () => {
    const j = enJuego(cliente({ oferta_monto: 80_000_000, oferta_moneda: "CRC" }), casaCorta(), 5);
    expect(j).toEqual({ valor: 80_000_000, moneda: "CRC", operacion: "venta", alquiler: false, comision: 4_000_000 });
  });
  it("sin oferta vale la casa que le interesa", () => {
    const j = enJuego(cliente(), casaCorta({ precio: 200000 }), 5);
    expect(j.valor).toBe(200000);
    expect(j.moneda).toBe("USD");
  });
  it("sin casa, la operación sale de lo que busca; sin valor no hay comisión", () => {
    const j = enJuego(cliente({ busca: { operacion: "alquiler" } }), null, 5);
    expect(j).toEqual({ valor: 0, moneda: "USD", operacion: "alquiler", alquiler: true, comision: 0 });
    expect(enJuego(cliente(), null, 5).operacion).toBeNull();
  });
  it("modo según la etapa", () => {
    expect(modoJuego("cerrado", 1000)).toBe("cerro");
    expect(modoJuego("cerrado", null)).toBe("anotar-cierre");
    expect(modoJuego("negociando", 1000)).toBe("en-juego");
  });
  it("se abre sola en el teléfono con negociación, cierre u oferta", () => {
    expect(juegoAbierto("negociando", null)).toBe(true);
    expect(juegoAbierto("cerrado", null)).toBe(true);
    expect(juegoAbierto("interesado", 500)).toBe(true);
    expect(juegoAbierto("interesado", null)).toBe(false);
  });
  it("resumen plegado", () => {
    expect(resumenJuego(null, { valor: 0, moneda: "USD" }, null)).toBe("En juego: sin casa ni oferta anotada");
    expect(resumenJuego(casaCorta(), { valor: 400000, moneda: "USD" }, null)).toBe("En juego: Casa Escazú · vale $400.000");
    expect(resumenJuego(null, { valor: 5000, moneda: "CRC" }, 5000)).toBe("En juego: ofreció ₡5.000");
  });
});

describe("la cifra de dinero", () => {
  it("cierre, oferta, presupuesto o casa, en ese orden", () => {
    const cerrado = cliente({ etapa: "cerrado", cierre_precio: 300, cierre_moneda: "CRC", oferta_monto: 200 });
    expect(cifraDinero(cerrado, null, false)).toEqual({ monto: 300, moneda: "CRC", que: "cerró en" });
    expect(cifraDinero(cliente({ cierre_precio: 300, oferta_monto: 200 }), null, false)).toEqual({ monto: 200, moneda: "USD", que: "ofreció" });
    expect(cifraDinero(cliente({ oferta_monto: 900 }), null, true)?.que).toBe("ofreció al mes");
    expect(cifraDinero(cliente({ busca: { presupuesto_max: 1500, moneda: "CRC" } }), null, false)).toEqual({ monto: 1500, moneda: "CRC", que: "presupuesto" });
    expect(cifraDinero(cliente({ busca: { presupuesto_max: 1500 } }), null, true)?.que).toBe("presupuesto al mes");
    expect(cifraDinero(cliente(), casaCorta(), false)).toEqual({ monto: 400000, moneda: "USD", que: "la casa que le interesa" });
    expect(cifraDinero(cliente(), casaCorta({ precio: null }), false)).toBeNull();
  });
  it("el ancla: presupuesto a Qué busca; lo demás y el cierre a lo que está en juego", () => {
    expect(anclaDinero("interesado", "presupuesto al mes")).toBe("#busca");
    expect(anclaDinero("interesado", "ofreció")).toBe("#juego");
    expect(anclaDinero("cerrado", "presupuesto")).toBe("#juego");
  });
});

describe("qué busca", () => {
  it("sabe qué busca con cualquier dato", () => {
    expect(sabeQueBusca({})).toBe(false);
    expect(sabeQueBusca({ zonas: [] })).toBe(false);
    expect(sabeQueBusca({ habitaciones: 2 })).toBe(true);
  });
  it("los datos en orden, con el presupuesto en su moneda", () => {
    expect(datosBusca({ operacion: "alquiler", tipo: "casa", zonas: ["Escazú", "Santa Ana"], presupuesto_max: 2000, habitaciones: 3 })).toEqual([
      { k: "Para", v: "Alquilar" },
      { k: "Tipo", v: "casa" },
      { k: "Zonas", v: "Escazú, Santa Ana" },
      { k: "Hasta", v: "$2.000 al mes" },
      { k: "Cuartos", v: "3" },
    ]);
    expect(datosBusca({ operacion: "venta", presupuesto_max: 9_000_000, moneda: "CRC" })).toEqual([
      { k: "Para", v: "Comprar" },
      { k: "Hasta", v: "₡9.000.000" },
    ]);
    expect(datosBusca({})).toEqual([]);
  });
});

describe("casas y visitas", () => {
  it("primero la que le interesa si está activa, sin repetirla", () => {
    const casas = casasDeFicha(casaCorta({ id: "a" }), [casaFicha("a"), casaFicha("b")]);
    expect(casas.map((p) => [p.id, p.interes, p.estado])).toEqual([
      ["a", true, "activa"],
      ["b", false, "activa"],
    ]);
    expect(casasDeFicha(casaCorta({ id: "a", estado: "vendida" }), [casaFicha("a"), casaFicha("b")]).map((p) => p.id)).toEqual(["b"]);
    expect(resumenCasas(casas)).toBe("Casas que le encajan: 2 · una le interesa");
    expect(resumenCasas([{ interes: false }])).toBe("Casas que le encajan: 1");
    expect(resumenCasas([])).toBe("Casas que le encajan: ninguna todavía");
  });
  it("visitas hechas y próximas (solo agendadas o confirmadas en el futuro)", () => {
    const v = (estado: string, horas: number) => ({ id: `${estado}${horas}`, inicio: h(horas), fin: null, estado, casa: null });
    expect(contarVisitas([v("realizada", -48), v("confirmada", 24), v("agendada", 2), v("agendada", -2), v("cancelada", 24)], ahora)).toEqual({ hechas: 1, proximas: 2 });
  });
  it("textos de las cifras", () => {
    expect([numeroLlego(0), numeroLlego(3)]).toEqual(["Hoy", 3]);
    expect([textoLlego(0), textoLlego(1), textoLlego(2)]).toEqual(["llegó", "día desde que llegó", "días desde que llegó"]);
    expect([textoSinMovimiento(1), textoSinMovimiento(0)]).toEqual(["día sin movimiento", "días sin movimiento"]);
    expect([textoHechas(1), textoHechas(0)]).toEqual(["visita hecha", "visitas hechas"]);
    expect([textoProximas(0), textoProximas(1), textoProximas(2)]).toEqual(["", " · 1 próxima", " · 2 próximas"]);
  });
});

describe("el camino", () => {
  it("pasos hechos, actual y que faltan; perdido: todos faltan", () => {
    expect(estadoPaso("nuevo", 0, "visita")).toBe("hecho");
    expect(estadoPaso("visita", 2, "visita")).toBe("actual");
    expect(estadoPaso("cerrado", 4, "visita")).toBe("falta");
    expect(estadoPaso("nuevo", 0, "perdido")).toBe("falta");
  });
  it("notas plegadas", () => {
    expect(resumenNotas(null)).toBe("Notas: sin notas todavía");
    expect(resumenNotas("Tiene dos hijos")).toBe("Notas: Tiene dos hijos");
  });
});

describe("entrada de Qué sigue", () => {
  it("pasa los datos de la ficha y cuenta las casas sin la que le interesa", () => {
    const d = {
      c: cliente({ oferta_monto: 500, oferta_moneda: "CRC", cierre_precio: 10 }),
      visitas: [],
      casasEncajan: [casaFicha("p1"), casaFicha("p2")],
      casaInteres: casaCorta({ id: "p1" }),
      diasSinMovimiento: 4,
      ahora,
      zona,
    } as unknown as DatosFicha;
    expect(entradaQueSigue(d, true)).toMatchObject({ ofertaMonto: 500, ofertaMoneda: "CRC", cierreAnotado: true, casasQueEncajan: 1, tieneCasaInteres: true, sabeQueBusca: true, diasSinMovimiento: 4 });
    expect(entradaQueSigue({ ...d, c: cliente(), casaInteres: null }, false)).toMatchObject({ ofertaMonto: null, cierreAnotado: false, casasQueEncajan: 2, tieneCasaInteres: false });
  });
});
