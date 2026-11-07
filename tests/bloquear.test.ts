import { describe, expect, it, vi } from "vitest";
import { describirBloqueo, entenderBloqueo, pideBloqueo } from "../lib/agenda/bloquear";

vi.mock("server-only", () => ({}));

const CR = "America/Costa_Rica";
// Viernes 6 de noviembre de 2026, 9:00 a. m. en Costa Rica.
const AHORA = new Date("2026-11-06T15:00:00Z");
const hora = (d: Date) => d.toISOString().slice(0, 16);

describe("bloquear desde un mensaje", () => {
  it("reconoce el pedido", () => {
    expect(pideBloqueo("Bloquea mañana en la tarde")).toBe(true);
    expect(pideBloqueo("bloquéame el viernes")).toBe(true);
    expect(pideBloqueo("¿Qué tengo hoy?")).toBe(false);
  });

  it("mañana en la tarde", () => {
    const p = entenderBloqueo("bloquear mañana en la tarde", AHORA, CR)!;
    expect(hora(p.inicio)).toBe("2026-11-07T18:00");
    expect(hora(p.fin)).toBe("2026-11-08T00:00");
    expect(describirBloqueo(p)).toBe("el sábado 7 de noviembre en la tarde");
  });

  it("un día de la semana con horas y motivo", () => {
    const p = entenderBloqueo("Bloquear el martes de 2 a 4 por una cita médica", AHORA, CR)!;
    expect(hora(p.inicio)).toBe("2026-11-10T20:00");
    expect(hora(p.fin)).toBe("2026-11-10T22:00");
    expect(p.motivo).toBe("una cita médica");
  });

  it("hoy todo el día, mañana en la mañana, el 15 y lo que no se entiende", () => {
    expect(hora(entenderBloqueo("bloquea hoy", AHORA, CR)!.inicio)).toBe("2026-11-06T06:00");
    const mm = entenderBloqueo("bloquea mañana en la mañana", AHORA, CR)!;
    expect(hora(mm.inicio)).toBe("2026-11-07T13:00");
    expect(mm.parte).toBe("manana");
    expect(entenderBloqueo("bloquear el 15", AHORA, CR)!.dia.dia).toBe(15);
    expect(entenderBloqueo("bloquear algún día", AHORA, CR)).toBeNull();
  });
});

describe("apartar en la agenda", () => {
  it("guarda el bloqueo y avisa si ya había una visita", async () => {
    const { apartar } = await import("../lib/agenda/apartar");
    const bloqueos: { inicio: Date; fin: Date }[] = [];
    const visita = { inicio: new Date("2026-11-07T19:00:00Z"), fin: new Date("2026-11-07T20:00:00Z") };
    const repo = {
      crearBloqueo: async (_c: string, inicio: Date, fin: Date) => void bloqueos.push({ inicio, fin }),
      datosAgenda: async () => ({ horarios: [], bloqueos, citas: [visita] }),
    };
    const r = await apartar(repo, "c1", entenderBloqueo("bloquear mañana en la tarde", AHORA, CR)!, AHORA);
    expect(r.ok).toBe(true);
    expect(bloqueos).toHaveLength(1);
    expect(r.texto).toContain("ya tenías 1 visita");
    const pasado = await apartar(repo, "c1", entenderBloqueo("bloquear hoy en la mañana", AHORA, CR)!, new Date("2026-11-06T19:00:00Z"));
    expect(pasado.ok).toBe(false);
  });
});

describe("el corredor bloquea por WhatsApp", () => {
  it("«bloquear mañana en la tarde» aparta la tarde y se lo confirma", async () => {
    const { procesarMensaje } = await import("../lib/asistente/procesar");
    const { PATRICIA, corredorBase, entrante, repoEnMemoria } = await import("./dobles");
    const db = repoEnMemoria(corredorBase());
    const enviados: string[] = [];
    const deps = {
      repo: db.repo,
      cerebro: {} as never,
      whatsapp: { texto: async (_p: string, _a: string, t: string) => (enviados.push(t), "wamid.x"), plantilla: async () => "wamid.p" } as never,
      plantillaAviso: "aviso",
      plantillaRecordatorio: "rec",
      registrar: () => {},
      ahora: () => AHORA,
    };
    const r = await procesarMensaje(deps, entrante("bloquear mañana en la tarde", { telefono: PATRICIA, timestamp: AHORA }));
    expect(r).toEqual({ tipo: "corredor", accion: "bloqueo" });
    expect(db.bloqueos).toHaveLength(1);
    expect(enviados.at(-1)).toContain("bloqueé el sábado 7 de noviembre en la tarde");
  });
});

describe("Patty bloquea desde el chat del panel", () => {
  it("«bloquear mañana en la tarde» lo guarda el código, sin llamar al modelo", async () => {
    const { hablarConPatty } = await import("../lib/panel/patty");
    const { corredorBase, repoEnMemoria } = await import("./dobles");
    const corredor = corredorBase();
    const db = repoEnMemoria(corredor);
    let llamadas = 0;
    const deps = {
      repo: db.repo,
      cerebro: { conversarConCorredor: async () => (llamadas++, { texto: "", consumo: { tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 } }) } as never,
      whatsapp: {} as never,
      plantillaAviso: "aviso",
      plantillaRecordatorio: "rec",
      registrar: () => {},
    };
    const r = await hablarConPatty(deps as never, {} as never, corredor, [], "Bloquear mañana en la tarde por el dentista");
    expect(r.ok).toBe(true);
    expect(r.ok && r.texto).toContain("bloqueé");
    expect(r.ok && r.cambio).toBe(true);
    expect(db.bloqueos).toHaveLength(1);
    expect(llamadas).toBe(0);

    const raro = await hablarConPatty(deps as never, {} as never, corredor, [], "bloquear cuando pueda");
    expect(raro.ok && raro.texto).toContain("No entendí qué día");
    expect(db.bloqueos).toHaveLength(1);
  });
});

describe("cómo se lee un bloqueo", () => {
  it("día entero, varios días y unas horas", async () => {
    const { rangoBloqueo } = await import("../lib/agenda/formato");
    expect(rangoBloqueo({ inicio: "2026-11-07T06:00:00Z", fin: "2026-11-08T06:00:00Z" }, CR)).toMatch(/sábado.*7.*noviembre, todo el día/);
    expect(rangoBloqueo({ inicio: "2026-11-07T06:00:00Z", fin: "2026-11-10T06:00:00Z" }, CR)).toMatch(/sábado.*al lunes/);
    expect(rangoBloqueo({ inicio: "2026-11-07T20:00:00Z", fin: "2026-11-07T22:00:00Z" }, CR)).toMatch(/sábado.*, de .*2.* a .*4/);
  });
});

describe("QA: frases reales que antes se entendían mal", () => {
  // Sábado 7 de noviembre de 2026, 9:00 a. m.
  const SAB = new Date("2026-11-07T15:00:00Z");
  const leer = (t: string) => {
    const p = entenderBloqueo(t, SAB, CR);
    return p ? describirBloqueo(p) : null;
  };
  it.each([
    ["bloquear mañana por la mañana", "el domingo 8 de noviembre en la mañana"],
    ["bloquear mañana por la tarde", "el domingo 8 de noviembre en la tarde"],
    ["bloquear para mañana en la tarde", "el domingo 8 de noviembre en la tarde"],
    ["bloquear el 7 de diciembre", "el lunes 7 de diciembre todo el día"],
    ["bloquear el 15 de diciembre en la tarde", "el martes 15 de diciembre en la tarde"],
    ["bloquear mañana de 5 a 7", "el domingo 8 de noviembre, de 5 p. m. a 7 p. m."],
    ["bloquear mañana a las 3", "el domingo 8 de noviembre, de 3 p. m. a 4 p. m."],
    ["bloquear de 2 a 4", "el sábado 7 de noviembre, de 2 p. m. a 4 p. m."],
    ["bloquear del 20 al 25 por vacaciones", "del viernes 20 al miércoles 25 de noviembre, días enteros"],
  ])("%s", (texto, esperado) => {
    expect(leer(texto)).toBe(esperado);
  });

  it("«por la tarde» no es un motivo, «por vacaciones» sí", () => {
    expect(entenderBloqueo("bloquear mañana por la tarde", SAB, CR)!.motivo).toBeNull();
    expect(entenderBloqueo("bloquear del 20 al 25 por vacaciones", SAB, CR)!.motivo).toBe("vacaciones");
  });

  it("varios días cubren de la medianoche del primero a la del día siguiente al último", () => {
    const p = entenderBloqueo("bloquear del 20 al 25", SAB, CR)!;
    expect(hora(p.inicio)).toBe("2026-11-20T06:00");
    expect(hora(p.fin)).toBe("2026-11-26T06:00");
  });

  it("horas que no cuadran se preguntan en vez de bloquear el día entero", () => {
    expect(entenderBloqueo("bloquear mañana de 9 a 8 am", SAB, CR)).toBeNull();
  });

  it("«bloquea a Juan» no es un pedido de agenda", () => {
    expect(pideBloqueo("bloquea a Juan el martes")).toBe(false);
    expect(pideBloqueo("bloquear al cliente")).toBe(false);
    expect(pideBloqueo("bloquear a las 3")).toBe(true);
  });
});
