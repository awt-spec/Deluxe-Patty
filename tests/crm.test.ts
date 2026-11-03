import { describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import { avanzarEtapa, encaja, fusionarBusca, resumenBusca } from "../lib/crm/perfil";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { corredorBase, entrante, repoEnMemoria } from "./dobles";

describe("perfil del cliente", () => {
  it("la etapa solo avanza y no toca a un cliente cerrado o perdido", () => {
    expect(avanzarEtapa("nuevo", "interesado")).toBe("interesado");
    expect(avanzarEtapa("visita", "interesado")).toBeNull();
    expect(avanzarEtapa("interesado", "interesado")).toBeNull();
    expect(avanzarEtapa("cerrado", "visita")).toBeNull();
    expect(avanzarEtapa("perdido", "interesado")).toBeNull();
    // La asistente nunca da por cerrado ni por perdido a un cliente.
    expect(avanzarEtapa("negociando", "cerrado")).toBeNull();
    expect(avanzarEtapa("nuevo", null)).toBeNull();
  });

  it("junta lo que el cliente va diciendo sin perder lo anterior", () => {
    const a = fusionarBusca({}, { operacion: "venta", zonas: ["Escazú"] });
    const b = fusionarBusca(a, { zonas: ["escazú", "Santa Ana"], presupuesto_max: 500000, habitaciones: 3 });
    expect(b).toEqual({ operacion: "venta", zonas: ["Escazú", "Santa Ana"], presupuesto_max: 500000, moneda: "USD", habitaciones: 3 });
    expect(resumenBusca(b)).toBe("Compra · Escazú, Santa Ana · hasta $500.000 · 3 cuartos");
  });

  it("una casa encaja si cumple lo que el cliente dijo; lo que no dijo no descarta", () => {
    const casa = { operacion: "venta", tipo: "casa", precio: 520000, moneda: "USD", zona: "Escazú", habitaciones: 4 };
    expect(encaja({ operacion: "venta", zonas: ["Escazú"], presupuesto_max: 500000 }, casa)).toBe(true); // 10 % de margen
    expect(encaja({ operacion: "alquiler" }, casa)).toBe(false);
    expect(encaja({ zonas: ["Belén"] }, casa)).toBe(false);
    expect(encaja({ presupuesto_max: 400000 }, casa)).toBe(false);
    expect(encaja({ habitaciones: 5 }, casa)).toBe(false);
    expect(encaja({}, casa)).toBe(false);
  });
});

describe("la asistente llena el CRM", () => {
  function preparar(clasificacion: object) {
    const corredor = corredorBase();
    const db = repoEnMemoria(corredor);
    const cerebro = {
      clasificar: vi.fn(async (): Promise<object> => ({ consumo: SIN_CONSUMO, ...clasificacion })),
      responder: vi.fn(async () => ({ texto: "Con gusto.", avisarCorredor: null, consumo: SIN_CONSUMO })),
    };
    const deps: Dependencias = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: { texto: vi.fn(async () => "wamid.out"), plantilla: vi.fn(async () => "wamid.aviso") } as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
    };
    return { db, deps, cerebro };
  }

  it("lo que el cliente busca queda en su ficha y pasa a interesado", async () => {
    const { db, deps, cerebro } = preparar({
      intencion: "consulta_propiedad",
      tema: "casa en Escazú",
      busca: { operacion: "venta", zonas: ["Escazú"], presupuesto_max: 600000, moneda: "USD" },
    });
    await procesarMensaje(deps, entrante("Busco casa en Escazú para comprar, hasta 600 mil"));
    expect(db.contactos[0]).toMatchObject({
      etapa: "interesado",
      busca: { operacion: "venta", zonas: ["Escazú"], presupuesto_max: 600000, moneda: "USD" },
    });

    // El siguiente mensaje suma, no borra.
    cerebro.clasificar.mockResolvedValueOnce({ intencion: "consulta_propiedad", tema: "cuartos", busca: { habitaciones: 3 }, consumo: SIN_CONSUMO });
    await procesarMensaje(deps, entrante("Que tenga 3 cuartos", { waMessageId: "wamid.2" }));
    expect(db.contactos[0].busca).toMatchObject({ zonas: ["Escazú"], habitaciones: 3 });
  });

  it("un saludo no cambia la etapa", async () => {
    const { db, deps } = preparar({ intencion: "otro", tema: "saludo", busca: {} });
    await procesarMensaje(deps, entrante("Hola, buenas"));
    expect(db.contactos[0].etapa ?? "nuevo").toBe("nuevo");
  });

  it("un cliente que el corredor dio por cerrado no vuelve atrás", async () => {
    const { db, deps } = preparar({ intencion: "consulta_propiedad", tema: "otra casa", busca: { zonas: ["Belén"] } });
    await procesarMensaje(deps, entrante("Hola"));
    db.contactos[0].etapa = "cerrado";
    await procesarMensaje(deps, entrante("¿Tienen algo en Belén?", { waMessageId: "wamid.3" }));
    expect(db.contactos[0].etapa).toBe("cerrado");
    expect(db.contactos[0].busca?.zonas).toEqual(["Belén"]);
  });
});
