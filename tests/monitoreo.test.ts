import { describe, expect, it, vi } from "vitest";
import { crearAlertas } from "../lib/monitoreo/alertas";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";

describe("alertas a soporte", () => {
  const base = () => {
    const reclamadas = new Set<string>();
    const whatsapp = { plantilla: vi.fn(async () => "w") };
    const alertas = crearAlertas({
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantilla: "aviso_corredor",
      destino: "+50671111111",
      phoneNumberId: "PNID",
      reclamar: async (clave) => (reclamadas.has(clave) ? false : (reclamadas.add(clave), true)),
    });
    return { alertas, whatsapp };
  };

  it("manda por la plantilla de aviso y no repite la misma alerta dentro de la ventana", async () => {
    const { alertas, whatsapp } = base();
    expect(await alertas.alertar("error_webhook", "El webhook falló")).toBe(true);
    expect(await alertas.alertar("error_webhook", "El webhook falló otra vez")).toBe(false);
    expect(await alertas.alertar("cron_plan-dia", "La tarea falló")).toBe(true);
    expect(whatsapp.plantilla).toHaveBeenCalledWith("PNID", "+50671111111", "aviso_corredor", ["[Asistente] El webhook falló"]);
    expect(whatsapp.plantilla).toHaveBeenCalledTimes(2);
  });

  it("si falla el envío, no lanza (no tumba lo que la disparó)", async () => {
    const { alertas, whatsapp } = base();
    whatsapp.plantilla.mockRejectedValueOnce(new Error("meta caído"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(alertas.alertar("x", "y")).resolves.toBe(false);
  });
});
