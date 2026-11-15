import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REINTENTO_ESTADO_MS, procesarEstado } from "../lib/asistente/procesar";
import { ESTADOS_PREVIOS, crearRepositorioSupabase, filtroEstadoAnterior } from "../lib/datos/repositorio";
import { corredorBase, repoEnMemoria } from "./dobles";

// El aviso de entrega de Meta solo puede tocar mensajes del corredor dueño del número que lo recibió.
describe("procesarEstado", () => {
  it("actualiza el mensaje con el corredor del número que recibió el aviso", async () => {
    const corredor = corredorBase();
    const { repo } = repoEnMemoria(corredor);
    const actualizar = vi.fn(async () => true);
    repo.actualizarEstadoEntrega = actualizar;
    await procesarEstado({ repo }, { phoneNumberId: corredor.whatsapp_phone_number_id!, waMessageId: "wamid.1", estado: "leido" });
    expect(actualizar).toHaveBeenCalledWith(corredor.id, "wamid.1", "leido");
    expect(actualizar).toHaveBeenCalledTimes(1);
  });

  it("con un número que no es de ningún corredor no toca nada", async () => {
    const { repo } = repoEnMemoria(corredorBase());
    const actualizar = vi.fn(async () => true);
    repo.actualizarEstadoEntrega = actualizar;
    await procesarEstado({ repo }, { phoneNumberId: "OTRO", waMessageId: "wamid.1", estado: "leido" });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it("H-13: si el aviso llega antes de que se guarde el mensaje, reintenta una vez tras una espera corta", async () => {
    const corredor = corredorBase();
    const { repo } = repoEnMemoria(corredor);
    const actualizar = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    repo.actualizarEstadoEntrega = actualizar;
    const esperar = vi.fn(async () => {});
    await procesarEstado({ repo }, { phoneNumberId: corredor.whatsapp_phone_number_id!, waMessageId: "wamid.1", estado: "enviado" }, esperar);
    expect(esperar).toHaveBeenCalledWith(REINTENTO_ESTADO_MS);
    expect(actualizar).toHaveBeenCalledTimes(2);
  });
});

// H-13 (QA): un "entregado" que llega después del "leído" borraba los vistos azules.
describe("estado de entrega: nunca retrocede", () => {
  const ORDEN = { enviado: 1, entregado: 2, leido: 3 } as const;

  it("ningún estado pasa a uno menor; fallido solo si no había llegado", () => {
    for (const [nuevo, previos] of Object.entries(ESTADOS_PREVIOS)) {
      for (const previo of previos) {
        if (previo === null || previo === "fallido" || nuevo === "fallido") continue;
        expect(ORDEN[previo]).toBeLessThanOrEqual(ORDEN[nuevo as keyof typeof ORDEN]);
      }
    }
    expect(ESTADOS_PREVIOS.entregado).not.toContain("leido");
    expect(ESTADOS_PREVIOS.enviado).not.toContain("entregado");
    expect(ESTADOS_PREVIOS.fallido).not.toContain("entregado");
    expect(ESTADOS_PREVIOS.fallido).not.toContain("leido");
    expect(ESTADOS_PREVIOS.leido).toContain(null);
  });

  it("el filtro de PostgREST lleva los estados anteriores y el vacío", () => {
    expect(filtroEstadoAnterior("entregado")).toBe("estado_entrega.is.null,estado_entrega.in.(enviado,entregado,fallido)");
    expect(filtroEstadoAnterior("fallido")).toBe("estado_entrega.is.null,estado_entrega.in.(enviado,fallido)");
  });

  it("el repositorio pone la condición en el mismo UPDATE, filtrado por corredor", async () => {
    const llamadas: [string, unknown[]][] = [];
    const filas: { id: string; estado_entrega: string }[] = [{ id: "m1", estado_entrega: "leido" }];
    const q: Record<string, unknown> = {};
    for (const m of ["from", "update", "eq", "or"]) q[m] = (...a: unknown[]) => (llamadas.push([m, a]), q);
    // Simula la base: el "or" deja pasar solo los estados previos permitidos.
    q.select = async () => {
      const filtro = String(llamadas.find(([m]) => m === "or")![1][0]);
      const pasa = filas.filter((f) => filtro.includes(f.estado_entrega));
      return { data: pasa, error: null };
    };
    const repo = crearRepositorioSupabase(q as unknown as SupabaseClient);
    expect(await repo.actualizarEstadoEntrega("c1", "wamid.1", "entregado")).toBe(false);
    expect(llamadas).toContainEqual(["eq", ["corredor_id", "c1"]]);
    expect(llamadas).toContainEqual(["eq", ["wa_message_id", "wamid.1"]]);
    expect(llamadas).toContainEqual(["or", [filtroEstadoAnterior("entregado")]]);
    llamadas.length = 0;
    expect(await repo.actualizarEstadoEntrega("c1", "wamid.1", "leido")).toBe(true);
  });
});
