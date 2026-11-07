import { describe, expect, it, vi } from "vitest";
import { REINTENTOS, TIEMPO_ESPERA_MS, fetchConTraza, trazaDe } from "../lib/asistente/cliente-claude";

describe("cliente de Claude para producción", () => {
  it("el peor caso (tiempo de espera × intentos) cabe en los 300 s de la función del webhook", () => {
    expect(TIEMPO_ESPERA_MS * (REINTENTOS + 1)).toBeLessThan(300_000 - 60_000);
  });

  it("la traza tiene solo cifras: modelo, tiempo, tokens, caché y motivo de parada", () => {
    const t = trazaDe(200, 1234, {
      model: "claude-sonnet-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Hola Laura, la casa en Escazú…" }],
      usage: { input_tokens: 120, output_tokens: 80, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 },
    });
    expect(t).toEqual({
      evento: "llamada_claude", modelo: "claude-sonnet-5-5", estado: 200, ms: 1234,
      entrada: 120, salida: 80, cache_lectura: 3000, cache_escritura: 0, parada: "end_turn",
    });
    expect(JSON.stringify(t)).not.toContain("Laura");
  });

  it("deja una traza por llamada a /v1/messages sin tocar la respuesta", async () => {
    const trazas: unknown[] = [];
    const base = vi.fn(async () => new Response(JSON.stringify({ model: "claude-haiku-5-5", stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }), { status: 200 }));
    const f = fetchConTraza(base as never, (t) => trazas.push(t));
    const r = await f("https://api.anthropic.com/v1/messages", { method: "POST" });
    expect(await r.json()).toMatchObject({ model: "claude-haiku-5-5" });
    await new Promise((ok) => setTimeout(ok, 0));
    expect(trazas).toHaveLength(1);
    expect(trazas[0]).toMatchObject({ modelo: "claude-haiku-5-5", entrada: 5, salida: 2 });
    // Contar tokens no es una llamada al modelo: no se traza.
    await f("https://api.anthropic.com/v1/messages/count_tokens", { method: "POST" });
    await new Promise((ok) => setTimeout(ok, 0));
    expect(trazas).toHaveLength(1);
  });
});
