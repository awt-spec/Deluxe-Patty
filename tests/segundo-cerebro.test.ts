import { describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { corredorBase, entrante, repoEnMemoria } from "./dobles";

function preparar(aviso: string | null) {
  const db = repoEnMemoria(corredorBase());
  const cerebro = {
    clasificar: vi.fn(async () => ({ intencion: "consulta_propiedad", tema: "mascotas", consumo: SIN_CONSUMO })),
    responder: vi.fn(async (..._args: unknown[]) => ({ texto: "Déjeme confirmarlo y le escribo.", avisarCorredor: aviso, consumo: SIN_CONSUMO })),
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

describe("segundo cerebro de la asistente", () => {
  it("responde con lo que el corredor le enseñó", async () => {
    const { db, deps, cerebro } = preparar(null);
    db.conocimiento.push({ tema: "Mascotas en alquileres", respuesta: "Se aceptan perros pequeños con depósito extra.", veces: 1 });
    db.conocimiento.push({ tema: "Duda sin responder", respuesta: null, veces: 1 });
    await procesarMensaje(deps, entrante("¿Aceptan mascotas?"));
    // Solo lo que ya tiene respuesta llega a la asistente.
    expect(cerebro.responder.mock.calls[0][5]).toEqual([
      { tema: "Mascotas en alquileres", respuesta: "Se aceptan perros pequeños con depósito extra.", veces: 1 },
    ]);
  });

  it("lo que no supo queda como duda, sin repetirse", async () => {
    const { db, deps } = preparar("Confirmar si el apartamento acepta mascotas");
    await procesarMensaje(deps, entrante("¿Aceptan mascotas?"));
    await procesarMensaje(deps, entrante("¿Y gatos?", { waMessageId: "wamid.2" }));
    expect(db.conocimiento).toEqual([{ tema: "Confirmar si el apartamento acepta mascotas", respuesta: null, veces: 2 }]);
  });

  it("si el cerebro no se puede leer, la asistente contesta igual", async () => {
    const { db, deps, cerebro } = preparar(null);
    db.repo.conocimientoActivo = async () => {
      throw new Error("tabla no existe");
    };
    const r = await procesarMensaje(deps, entrante("¿Sigue disponible?"));
    expect(r).toMatchObject({ tipo: "respondido" });
    expect(cerebro.responder.mock.calls[0][5]).toEqual([]);
  });
});
