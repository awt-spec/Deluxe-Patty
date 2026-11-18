import { describe, expect, it } from "vitest";
import { textoEco, textoLimpio } from "@/lib/agenda/apartar-ia";
import { cambiosDeEtapa, validarOfertaCon } from "@/lib/crm/cierre";
import { textoPromedioDias } from "@/lib/crm/textos-negocio";
import { diaEn, fechaCortaEn } from "@/lib/formato";
import { sinAviso } from "@/lib/panel/aviso-url";
import { textoDiaVacio } from "@/lib/panel/movil";
import { claveEnvio, leerEnvio, reclamarEnvio } from "@/lib/panel/una-vez";
import { supabaseFalso } from "./acciones/entorno";

// Reglas puras de los arreglos del QA del panel (17-18 nov 2026).

const ENVIO = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const f = (campos: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(campos)) d.set(k, v);
  return d;
};

describe("un toque, un envío (lib/panel/una-vez.ts)", () => {
  it("solo acepta un código con forma de UUID", () => {
    expect(leerEnvio(f({ envio: ENVIO }))).toBe(ENVIO);
    expect(leerEnvio(f({ envio: ENVIO.toUpperCase() }))).toBe(ENVIO);
    expect(leerEnvio(f({ envio: "1 or 1=1" }))).toBeNull();
    expect(leerEnvio(f({}))).toBeNull();
  });

  it("la clave lleva una huella corta de lo pedido, nunca el texto", () => {
    const a = claveEnvio("escribir", "c1", ENVIO, "Hola, mi cédula es 1-1111-1111");
    expect(a).toMatch(/^envio:escribir:c1:[0-9a-f-]{36}:[0-9a-f]{16}$/);
    expect(a).not.toMatch(/cédula|1111/);
    expect(claveEnvio("escribir", "c1", ENVIO, "otro texto")).not.toBe(a);
  });

  it("si la base falla o no hay código, deja pasar (nunca frena un envío legítimo)", async () => {
    const db = supabaseFalso();
    db.rpc = async () => ({ data: null, error: { message: "caída" } }) as never;
    expect((await reclamarEnvio(db as never, "escribir", "c1", ENVIO)).primero).toBe(true);
    expect((await reclamarEnvio(supabaseFalso() as never, "escribir", "c1", null)).primero).toBe(true);
    db.rpc = async () => {
      throw new Error("red");
    };
    expect((await reclamarEnvio(db as never, "escribir", "c1", ENVIO)).primero).toBe(true);
  });

  it("false de reclamar_alerta = ya se mandó", async () => {
    const db = supabaseFalso();
    db.respuestasRpc.reclamar_alerta = false;
    expect((await reclamarEnvio(db as never, "agendar", "c1", ENVIO, "x")).primero).toBe(false);
    expect(db.rpcs[0]).toMatchObject({ nombre: "reclamar_alerta", args: { p_minutos: 10 } });
  });
});

describe("cierre: entrar o salir de Cerró (cambiosDeEtapa)", () => {
  const ahora = "2026-11-18T04:30:00.000Z";
  it("entrar a Cerró empieza un cierre nuevo con la fecha de hoy, aunque quedara uno viejo", () => {
    const r = cambiosDeEtapa({ etapa: "negociando", cierre_precio: 300_000 }, "cerrado", ahora);
    expect(r).toEqual({
      cambios: { etapa: "cerrado", etapa_at: ahora, cierre_precio: null, cierre_comision: null, cierre_moneda: null, cierre_propiedad_id: null, cierre_at: ahora },
      anulado: false,
    });
  });
  it("salir de Cerró lo anula (y avisa si había precio)", () => {
    expect(cambiosDeEtapa({ etapa: "cerrado", cierre_precio: 300_000 }, "perdido", ahora)).toMatchObject({ cambios: { cierre_precio: null, cierre_at: null }, anulado: true });
    expect(cambiosDeEtapa({ etapa: "cerrado", cierre_precio: null }, "perdido", ahora).anulado).toBe(false);
  });
  it("entre otras etapas no toca el cierre", () => {
    expect(cambiosDeEtapa({ etapa: "visita" }, "negociando", ahora)).toEqual({ cambios: { etapa: "negociando", etapa_at: ahora }, anulado: false });
  });
});

describe("oferta con el criterio del cierre (validarOfertaCon)", () => {
  const casa = { operacion: "alquiler", lista: { precio: 2_800, moneda: "USD" } };
  it("«1,180» es ambigua", () => {
    expect(validarOfertaCon("1,180", "USD", casa)).toMatchObject({ ok: false, motivo: expect.stringMatching(/^Revisa la oferta: «1,180» puede ser 1,18 o 1\.180/) });
  });
  it("menos del 20 % de la lista (misma moneda) no se cree; en colones contra una casa en dólares no se compara", () => {
    expect(validarOfertaCon("500", "USD", casa)).toMatchObject({ ok: false, motivo: expect.stringMatching(/^Revisa la oferta\. Entendí/) });
    expect(validarOfertaCon("1.400.000", "CRC", casa)).toEqual({ ok: true, valor: 1_400_000 });
  });
  it("vacía la quita; una creíble pasa; lo que no se entiende, como antes", () => {
    expect(validarOfertaCon("", "USD", casa)).toEqual({ ok: true, valor: null });
    expect(validarOfertaCon("2.600", "USD", casa)).toEqual({ ok: true, valor: 2_600 });
    expect(validarOfertaCon("12 millones", "USD", casa).ok).toBe(false);
    // Sin casa, en venta: menos de $1.000 no es una oferta por una casa.
    expect(validarOfertaCon("850", "USD", { operacion: "venta" }).ok).toBe(false);
  });
});

describe("fechas en la zona del corredor", () => {
  it("de noche en Costa Rica no sale el día siguiente (antes se cortaba el ISO en UTC)", () => {
    expect(fechaCortaEn("2026-11-18T04:40:00Z", "America/Costa_Rica")).toBe("17 de noviembre");
    expect(fechaCortaEn("2026-11-18T06:10:00Z", "America/Costa_Rica")).toBe("18 de noviembre");
  });
  it("hoy y en una semana como AAAA-MM-DD en su zona", () => {
    const noche = new Date("2026-11-18T04:40:00Z");
    expect(diaEn("America/Costa_Rica", 0, noche)).toBe("2026-11-17");
    expect(diaEn("America/Costa_Rica", 7, noche)).toBe("2026-11-24");
  });
});

describe("textos", () => {
  it("«1 día en promedio», «12 días en promedio»", () => {
    expect(textoPromedioDias(1)).toBe("día en promedio hasta cerrar");
    expect(textoPromedioDias(12)).toBe("días en promedio hasta cerrar");
    expect(textoPromedioDias(null)).toMatch(/sin cierres/);
  });
  it("«Tu día» vacío dice por qué", () => {
    expect(textoDiaVacio({ tieneHorario: false, esHoy: true, yaPaso: false })).toBe("No tienes visitas ni horario de visitas este día.");
    expect(textoDiaVacio({ tieneHorario: true, esHoy: true, yaPaso: false })).toBe("Por hoy ya no quedan horas libres.");
    expect(textoDiaVacio({ tieneHorario: true, esHoy: false, yaPaso: true })).toBe("Ese día no tuviste visitas.");
    expect(textoDiaVacio({ tieneHorario: true, esHoy: false, yaPaso: false })).toBe("Ese día ya no quedan horas libres.");
  });
  it("«Esto entendí» repite «<b>urgente</b>» tal cual; al modelo va limpio", () => {
    expect(textoEco("dentista <b>urgente</b>\u0007", 500)).toBe("dentista <b>urgente</b>");
    expect(textoLimpio("dentista <b>urgente</b>", 500)).toBe("dentista burgente/b");
  });
});

describe("el aviso se quita de la dirección después de mostrarlo", () => {
  it("quita solo `aviso` y conserva lo demás", () => {
    expect(sinAviso("https://x/panel/clientes/1?aviso=Guardado.&ver=ficha#cierre")).toBe("/panel/clientes/1?ver=ficha#cierre");
    expect(sinAviso("https://x/panel/clientes/1?aviso=Guardado.")).toBe("/panel/clientes/1");
    expect(sinAviso("https://x/panel/clientes/1?ver=ficha")).toBeNull();
  });
});
