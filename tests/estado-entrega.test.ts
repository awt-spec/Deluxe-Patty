import { describe, expect, it, vi } from "vitest";
import { procesarEstado } from "../lib/asistente/procesar";
import { corredorBase, repoEnMemoria } from "./dobles";

// El aviso de entrega de Meta solo puede tocar mensajes del corredor dueño del número que lo recibió.
describe("procesarEstado", () => {
  it("actualiza el mensaje con el corredor del número que recibió el aviso", async () => {
    const corredor = corredorBase();
    const { repo } = repoEnMemoria(corredor);
    const actualizar = vi.fn(async () => {});
    repo.actualizarEstadoEntrega = actualizar;
    await procesarEstado({ repo }, { phoneNumberId: corredor.whatsapp_phone_number_id!, waMessageId: "wamid.1", estado: "leido" });
    expect(actualizar).toHaveBeenCalledWith(corredor.id, "wamid.1", "leido");
  });

  it("con un número que no es de ningún corredor no toca nada", async () => {
    const { repo } = repoEnMemoria(corredorBase());
    const actualizar = vi.fn(async () => {});
    repo.actualizarEstadoEntrega = actualizar;
    await procesarEstado({ repo }, { phoneNumberId: "OTRO", waMessageId: "wamid.1", estado: "leido" });
    expect(actualizar).not.toHaveBeenCalled();
  });
});
