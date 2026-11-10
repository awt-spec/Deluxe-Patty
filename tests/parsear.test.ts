import { describe, expect, it } from "vitest";
import { parsearWebhook } from "../lib/whatsapp/parsear";

function payload(value: object) {
  return { object: "whatsapp_business_account", entry: [{ id: "WABA", changes: [{ field: "messages", value }] }] };
}

describe("parsearWebhook", () => {
  it("extrae mensajes de texto con nombre de perfil y teléfono en E.164", () => {
    const { mensajes } = parsearWebhook(
      payload({
        metadata: { phone_number_id: "PNID" },
        contacts: [{ wa_id: "50688880001", profile: { name: "Ana" } }],
        messages: [{ id: "wamid.1", from: "50688880001", timestamp: "1760000000", type: "text", text: { body: "Hola" } }],
      }),
    );
    expect(mensajes).toEqual([
      {
        phoneNumberId: "PNID",
        waMessageId: "wamid.1",
        telefono: "+50688880001",
        nombrePerfil: "Ana",
        tipo: "texto",
        texto: "Hola",
        timestamp: new Date(1760000000 * 1000),
      },
    ]);
  });

  it("sin timestamp válido usa la hora de llegada en vez de una fecha inválida", () => {
    const antes = Date.now();
    const { mensajes } = parsearWebhook(
      payload({
        metadata: { phone_number_id: "PNID" },
        messages: [
          { id: "wamid.a", from: "50688880001", type: "text", text: { body: "Hola" } },
          { id: "wamid.b", from: "50688880001", timestamp: "abc", type: "text", text: { body: "Hola" } },
        ],
      }),
    );
    for (const m of mensajes) {
      expect(Number.isNaN(m.timestamp.getTime())).toBe(false);
      expect(m.timestamp.getTime()).toBeGreaterThanOrEqual(antes);
      expect(() => m.timestamp.toISOString()).not.toThrow();
    }
  });

  it("marca audios sin texto y respuestas de botón como texto", () => {
    const { mensajes } = parsearWebhook(
      payload({
        metadata: { phone_number_id: "PNID" },
        messages: [
          { id: "a", from: "1", timestamp: "1", type: "audio", audio: { id: "m" } },
          { id: "b", from: "1", timestamp: "1", type: "interactive", interactive: { button_reply: { title: "Sí" } } },
        ],
      }),
    );
    expect(mensajes.map((m) => [m.tipo, m.texto])).toEqual([
      ["audio", null],
      ["texto", "Sí"],
    ]);
  });

  it("extrae estados de entrega e ignora otros objetos", () => {
    const { estados } = parsearWebhook(
      payload({ metadata: { phone_number_id: "PNID" }, statuses: [{ id: "wamid.9", status: "read" }] }),
    );
    expect(estados).toEqual([{ waMessageId: "wamid.9", estado: "leido" }]);
    expect(parsearWebhook({ object: "page" })).toEqual({ mensajes: [], estados: [] });
  });
});
