import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { EditorFotos } from "../lib/fotos/editor";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

describe('"fotos <código>"', () => {
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: Record<string, ReturnType<typeof vi.fn>>;
  let editor: { mejorar: ReturnType<typeof vi.fn> };
  let deps: Dependencias;
  const ahora = new Date("2026-10-20T15:00:00Z");

  beforeEach(() => {
    db = repoEnMemoria(corredorBase());
    whatsapp = { texto: vi.fn(async () => "w"), plantilla: vi.fn(async () => "w"), imagen: vi.fn(async () => "w") };
    editor = { mejorar: vi.fn(async (b: Buffer) => Buffer.concat([Buffer.from("mejorada:"), b])) };
    deps = {
      repo: db.repo,
      cerebro: {} as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      fotos: editor as unknown as EditorFotos,
      registrar: () => {},
      ahora: () => ahora,
    };
    db.propiedades.push({
      id: "p1", codigo: "DLX-1", titulo: "Casa en condominio", tipo: "casa", operacion: "venta",
      precio: 1, moneda: "USD", provincia: null, canton: null, distrito: null, zona: null,
      habitaciones: null, banos: null, m2_construccion: null, m2_terreno: null, descripcion: null,
      amenidades: [], url_e24: null, estado: "activa",
      fotos: [
        { url: "https://x/b.jpg", orden: 2 },
        { url: "https://x/a.jpg", orden: 1 },
        { url: "https://x/rota.jpg", orden: 3 },
      ],
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.includes("rota")
        ? new Response("no", { status: 404 })
        : new Response(Buffer.from(url), { headers: { "content-type": "image/jpeg" } }),
    ));
  });
  afterEach(() => vi.unstubAllGlobals());

  const dePatricia = (texto: string) => entrante(texto, { telefono: PATRICIA, timestamp: ahora });

  it("mejora las fotos en orden, guarda la versión aparte y se las manda a Patricia para revisar", async () => {
    const r = await procesarMensaje(deps, dePatricia("fotos DLX-1"));
    expect(r).toEqual({ tipo: "corredor", accion: "fotos" });

    // Orden de la propiedad: a.jpg es la 1, b.jpg la 2.
    expect(editor.mejorar.mock.calls.map((c) => String(c[0]))).toEqual(["https://x/a.jpg", "https://x/b.jpg"]);
    const fotos = db.propiedades[0].fotos;
    expect(fotos.find((f) => f.url === "https://x/a.jpg")?.mejorada_url).toMatch(/p1\/1-mejorada-/);
    expect(fotos.find((f) => f.url === "https://x/rota.jpg")?.mejorada_url).toBeUndefined();
    // Las originales no cambian.
    expect(fotos.map((f) => f.url).sort()).toEqual(["https://x/a.jpg", "https://x/b.jpg", "https://x/rota.jpg"]);
    expect(db.fotosMejoradas()).toBe(2);

    expect(whatsapp.imagen.mock.calls.map((c) => c[3])).toEqual(["Foto 1 mejorada", "Foto 2 mejorada"]);
    const textos = whatsapp.texto.mock.calls.map((c) => c[2] as string);
    expect(textos[0]).toContain("Estoy mejorando 3 fotos");
    expect(textos.at(-1)).toContain("Listo: 2 fotos mejoradas de Casa en condominio (1 no se pudieron).");
    expect(textos.at(-1)).toContain("Revísalas antes de publicarlas");
  });

  it("sin OpenAI configurado lo dice y no descarga nada", async () => {
    deps.fotos = undefined;
    await procesarMensaje(deps, dePatricia("fotos DLX-1"));
    expect(fetch).not.toHaveBeenCalled();
    expect(whatsapp.texto.mock.calls[0][2]).toContain("no está configurada");
  });
});
