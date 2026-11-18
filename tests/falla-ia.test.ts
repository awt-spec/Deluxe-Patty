import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { crearCerebroClaude, type Cerebro } from "../lib/asistente/cerebro";
import { MARCA_MUESTRA, cerebroDemo, respuestaPattyDemo } from "../lib/asistente/cerebro-demo";
import { causaFallaIA, esFallaDeConfiguracion, mensajeFallaIA } from "../lib/asistente/falla-ia";
import { motivoSinPresupuesto } from "../lib/asistente/limites";
import type { Corredor } from "../lib/datos/tipos";
import { hablarConPatty } from "../lib/panel/patty";
import { ESTADO_INICIAL, simularTurno } from "../lib/simulador/simulador";
import { corredorBase, repoEnMemoria } from "./dobles";

// SEV-1 del QA: en la demo, Patty y "Probar la asistente" siempre decían "No pude contestar ahora". La llamada a
// Claude fallaba en producción (también en "Agregar casa", que no lee nada de la base) y el panel tapaba la causa.

const AHORA = new Date("2026-10-19T14:00:00Z");

/** Cliente de Claude real cuyo servidor contesta siempre lo mismo (sin red). */
function clienteQueResponde(estado: number, cuerpo: unknown): Anthropic {
  return new Anthropic({
    apiKey: "sk-prueba",
    maxRetries: 0,
    fetch: (async () => new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } })) as typeof fetch,
  });
}
const llaveInvalida = () => clienteQueResponde(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });

/** Supabase de mentira para el contexto de Patty: toda consulta devuelve una lista vacía. */
const dbVacia: unknown = new Proxy(
  {},
  {
    get: (_t, k) => (k === "then" ? (listo: (v: unknown) => void) => listo({ data: [], error: null }) : () => dbVacia),
  },
);

function depsCon(corredor: Corredor, cerebro: Cerebro) {
  const db = repoEnMemoria(corredor);
  const registrar = vi.fn();
  return { db, registrar, deps: { repo: db.repo, cerebro, whatsapp: {} as never, plantillaAviso: "aviso", plantillaRecordatorio: "rec", registrar } };
}

async function errorDe(cliente: Anthropic): Promise<unknown> {
  return cliente.messages.create({ model: "claude-haiku-5-5", max_tokens: 10, messages: [{ role: "user", content: "hola" }] }).catch((e) => e);
}

describe("Causa de una falla de la IA", () => {
  it("distingue llave inválida, sin saldo, modelo, saturación y red", async () => {
    expect(causaFallaIA(await errorDe(llaveInvalida()))).toBe("llave_invalida");
    expect(
      causaFallaIA(await errorDe(clienteQueResponde(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }))),
    ).toBe("sin_saldo");
    expect(causaFallaIA(await errorDe(clienteQueResponde(400, { type: "error", error: { type: "invalid_request_error", message: "max_tokens: bad" } })))).toBe("otra");
    expect(causaFallaIA(await errorDe(clienteQueResponde(404, { type: "error", error: { type: "not_found_error", message: "model: x" } })))).toBe("modelo");
    expect(causaFallaIA(await errorDe(clienteQueResponde(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } })))).toBe("ocupada");
    expect(causaFallaIA(await errorDe(clienteQueResponde(500, { type: "error", error: { type: "api_error", message: "x" } })))).toBe("pasajera");
    expect(causaFallaIA(new Error('Could not resolve authentication method. Expected one of apiKey, authToken…'))).toBe("sin_llave");
    expect(causaFallaIA(new Error("otra cosa"))).toBe("otra");
  });

  it("al corredor le habla en palabras simples", () => {
    expect(mensajeFallaIA("llave_invalida", "Patty")).toBe("Falta configurar la IA de Patty: avisa a soporte. Ya les dejé el aviso.");
    expect(mensajeFallaIA("ocupada", "Ana")).toContain("Ana está muy ocupada");
    expect(mensajeFallaIA("pasajera")).toBe("No pude contestar ahora. Inténtalo de nuevo en un momento.");
    expect(esFallaDeConfiguracion("sin_saldo")).toBe(true);
    expect(esFallaDeConfiguracion("pasajera")).toBe(false);
  });

  it("sin energía: el tope del mes (o tope 0) dice que se quedó sin energía; el del día, que vuelve mañana", () => {
    expect(motivoSinPresupuesto({ gastoDia: 1, gastoMes: 150, topeDia: 10, topeMes: 150 }, "Patty")).toBe(
      "Patty se quedó sin energía este mes: los chats quedan para ti. Habla con soporte.",
    );
    expect(motivoSinPresupuesto({ gastoDia: 0, gastoMes: 0, topeDia: 0, topeMes: 0 }, "Patty")).toContain("se quedó sin energía este mes");
    expect(motivoSinPresupuesto({ gastoDia: 10, gastoMes: 20, topeDia: 10, topeMes: 150 }, "Patty")).toContain("ya usó la energía de hoy");
  });
});

describe("Chat de Patty cuando la IA falla", () => {
  it("con la llave rechazada dice que falta configurar la IA y alerta a soporte (antes: 'No pude contestar ahora')", async () => {
    const corredor = corredorBase();
    const { deps, registrar } = depsCon(corredor, crearCerebroClaude(llaveInvalida()));
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await hablarConPatty(deps as never, dbVacia as never, corredor, [], "¿Qué tengo hoy?");
    expect(r).toEqual({ ok: false, motivo: "Falta configurar la IA de Patty: avisa a soporte. Ya les dejé el aviso." });
    expect(registrar).toHaveBeenCalledWith("error_ia_config", expect.objectContaining({ corredorId: corredor.id, causa: "llave_invalida", codigo: 401, donde: "patty" }));
    // Nada del mensaje del corredor ni de la API en el registro.
    const registro = JSON.stringify([...registrar.mock.calls, ...errores.mock.calls]);
    expect(registro).not.toContain("Qué tengo hoy");
    expect(registro).not.toContain("invalid x-api-key");
    errores.mockRestore();
  });

  it("sin energía del mes no llama a la IA y lo dice con la Energía", async () => {
    const corredor = corredorBase();
    const conversar = vi.fn();
    const { deps, db } = depsCon(corredor, { conversarConCorredor: conversar } as unknown as Cerebro);
    db.repo.presupuestoIA = async () => ({ gastoDia: 0, gastoMes: 150, topeDia: 10, topeMes: 150 });
    const r = await hablarConPatty(deps as never, dbVacia as never, corredor, [], "hola");
    expect(r).toEqual({ ok: false, motivo: "Patty se quedó sin energía este mes: los chats quedan para ti. Habla con soporte." });
    expect(conversar).not.toHaveBeenCalled();
  });
});

describe("La demo funciona aunque la IA falle", () => {
  const demo = (): Corredor => ({ ...corredorBase(), activo: false });

  it("Patty contesta una muestra marcada, con el plan de hoy que arma el código, y avisa la falla", async () => {
    const corredor = demo();
    const alFallar = vi.fn();
    const { deps } = depsCon(corredor, cerebroDemo(crearCerebroClaude(llaveInvalida()), alFallar));
    const r = await hablarConPatty(deps as never, dbVacia as never, corredor, [], "¿Qué tengo hoy?");
    expect(r.ok).toBe(true);
    expect(r.ok && r.texto.startsWith(MARCA_MUESTRA)).toBe(true);
    expect(alFallar).toHaveBeenCalledWith("llave_invalida", expect.anything());
  });

  it("«¿dónde cambio mi horario?» lleva a la pantalla con un paso de la guía", () => {
    const t = respuestaPattyDemo("Plan de hoy:\n- nada\n\nVisitas…", "¿Dónde cambio mi horario de visitas?");
    expect(t).toContain("[Horario de visitas](/panel/agenda/horario)");
    expect(t).toContain("<<ir /panel/agenda/horario>>");
    expect(respuestaPattyDemo("Plan de hoy:\n• 10:00 visita en Escazú\n\nVisitas de los próximos 7 días:\n- x", "¿Qué tengo hoy?")).toContain("• 10:00 visita en Escazú");
  });

  it("Probar la asistente contesta como un cliente con una muestra, sin error ni gasto", async () => {
    const corredor = demo();
    const { db } = depsCon(corredor, {} as Cerebro);
    const { turno } = await simularTurno({
      real: db.repo,
      cerebro: cerebroDemo(crearCerebroClaude(llaveInvalida())),
      corredor,
      estado: ESTADO_INICIAL,
      texto: "Hola, ¿qué casas tienen en Escazú?",
      ahora: AHORA,
    });
    expect(turno.error).toBe(false);
    expect(turno.resultado).toBe("respondido");
    expect(turno.respuestas[0]).toContain(MARCA_MUESTRA);
  });

  it("fuera de la demo, Probar dice por qué falló y alerta a soporte", async () => {
    const corredor = corredorBase();
    const { db } = depsCon(corredor, {} as Cerebro);
    const alertar = vi.fn();
    const { turno } = await simularTurno({
      real: db.repo,
      cerebro: crearCerebroClaude(llaveInvalida()),
      corredor,
      estado: ESTADO_INICIAL,
      texto: "Hola",
      ahora: AHORA,
      alertar,
    });
    expect(turno.error).toBe(true);
    expect(turno.motivoError).toContain("Falta configurar la IA");
    expect(alertar).toHaveBeenCalledWith("error_ia_config", expect.objectContaining({ causa: "llave_invalida" }));
  });
});
