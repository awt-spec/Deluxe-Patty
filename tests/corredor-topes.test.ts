import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { CORREDOR_SIN_PRESUPUESTO, CORREDOR_TOPE_MENSAJES } from "../lib/asistente/corredor";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor } from "../lib/datos/tipos";
import type { EditorFotos } from "../lib/fotos/editor";
import { mejorarFotos } from "../lib/fotos/mejorar";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { PATRICIA, corredorBase, entrante, repoEnMemoria } from "./dobles";

// H-01 (QA): el WhatsApp del corredor gastaba IA (análisis con web_fetch, "anuncio <código>", "fotos <código>")
// sin mirar el tope de gasto, el tope de mensajes del mes ni `imagenes_activas`. Los topes frenan, no solo avisan.

const B = "https://proyecto.supabase.co/storage/v1/object/public/fotos/c1/p1/originales";

describe("WhatsApp del corredor: los topes frenan la IA", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: Record<string, ReturnType<typeof vi.fn>>;
  let cerebro: Record<string, ReturnType<typeof vi.fn>>;
  let editor: { mejorar: ReturnType<typeof vi.fn> };
  let deps: Dependencias;
  const ahora = new Date("2026-10-20T15:00:00Z");

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    corredor = corredorBase();
    db = repoEnMemoria(corredor);
    whatsapp = { texto: vi.fn(async () => "w"), plantilla: vi.fn(async () => "w"), imagen: vi.fn(async () => "w"), documento: vi.fn(async () => "w") };
    cerebro = {
      analizar: vi.fn(async () => ({ texto: "Análisis", avisarCorredor: null, consumo: SIN_CONSUMO })),
      prepararAnuncio: vi.fn(async () => ({ tituloEs: "T", descripcionEs: "D", tituloEn: "T", descripcionEn: "D", ordenFotos: [], sugerencias: [], consumo: SIN_CONSUMO })),
    };
    editor = { mejorar: vi.fn(async (b: Buffer) => ({ imagen: b, costoUsd: 0.2 })) };
    deps = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      fotos: editor as unknown as EditorFotos,
      registrar: () => {},
      ahora: () => ahora,
    };
    db.propiedades.push({
      id: "p1", codigo: "DP-01", titulo: "Casa", tipo: "casa", operacion: "venta", precio: 1, moneda: "USD",
      provincia: null, canton: null, distrito: null, zona: null, habitaciones: null, banos: null,
      m2_construccion: null, m2_terreno: null, descripcion: null, amenidades: [], url_e24: null, estado: "activa",
      fotos: [{ url: `${B}/a.jpg`, orden: 1 }, { url: `${B}/b.jpg`, orden: 2 }],
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("foto"), { headers: { "content-type": "image/jpeg" } })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const dePatricia = (texto: string) => entrante(texto, { telefono: PATRICIA, timestamp: ahora });
  const textos = () => whatsapp.texto.mock.calls.map((c) => c[2] as string);
  const pasarTope = () => {
    db.repo.presupuestoIA = async () => ({ gastoDia: 50, gastoMes: 500, topeDia: 10, topeMes: 150 });
  };

  it("análisis con el tope de gasto superado: no llama a Claude y se lo dice en claro", async () => {
    pasarTope();
    const r = await procesarMensaje(deps, dePatricia("Analízame https://www.encuentra24.com/x/123"));
    expect(cerebro.analizar).not.toHaveBeenCalled();
    expect(r).toEqual({ tipo: "corredor", accion: "error" });
    expect(textos()).toEqual([CORREDOR_SIN_PRESUPUESTO]);
  });

  it("solo el tope del mes superado también frena", async () => {
    db.repo.presupuestoIA = async () => ({ gastoDia: 0, gastoMes: 200, topeDia: 10, topeMes: 150 });
    await procesarMensaje(deps, dePatricia("Analízame https://www.encuentra24.com/x/123"));
    expect(cerebro.analizar).not.toHaveBeenCalled();
  });

  it('"anuncio <código>" con el tope superado no llama a Claude ni guarda borrador', async () => {
    pasarTope();
    await procesarMensaje(deps, dePatricia("anuncio DP-01"));
    expect(cerebro.prepararAnuncio).not.toHaveBeenCalled();
    expect(db.anuncios).toHaveLength(0);
    expect(textos()).toEqual([CORREDOR_SIN_PRESUPUESTO]);
  });

  it('"fotos <código>" con el tope superado no llama a OpenAI ni descarga fotos', async () => {
    pasarTope();
    await procesarMensaje(deps, dePatricia("fotos DP-01"));
    expect(editor.mejorar).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(textos()).toEqual([CORREDOR_SIN_PRESUPUESTO]);
  });

  it('"fotos <código>" con imagenes_activas=false no llama a OpenAI', async () => {
    corredor.imagenes_activas = false;
    await procesarMensaje(deps, dePatricia("fotos DP-01"));
    expect(editor.mejorar).not.toHaveBeenCalled();
    expect(textos()[0]).toContain("Las imágenes con IA están apagadas");
  });

  it("con el tope de mensajes del mes alcanzado no se usa la IA", async () => {
    db.uso.mensajes_total = corredor.tope_mensajes_mes;
    await procesarMensaje(deps, dePatricia("Analízame https://www.encuentra24.com/x/123"));
    await procesarMensaje(deps, dePatricia("fotos DP-01"));
    expect(cerebro.analizar).not.toHaveBeenCalled();
    expect(editor.mejorar).not.toHaveBeenCalled();
    expect(textos().filter((t) => t === CORREDOR_TOPE_MENSAJES)).toHaveLength(2);
  });

  it('dentro del tope sigue igual, y "plan" o "reporte" (sin IA) funcionan aunque se pase el tope', async () => {
    await procesarMensaje(deps, dePatricia("Analízame https://www.encuentra24.com/x/123"));
    expect(cerebro.analizar).toHaveBeenCalledTimes(1);
    pasarTope();
    expect(await procesarMensaje(deps, dePatricia("plan"))).toEqual({ tipo: "corredor", accion: "plan" });
    expect(await procesarMensaje(deps, dePatricia("reporte"))).toEqual({ tipo: "corredor", accion: "reporte" });
  });
});

describe("mejorarFotos: un lote en paralelo no se pasa del tope por más de una imagen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("con $1 de margen y fotos de $0,25 mejora 4 de 12 y avisa que llegó al tope", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("foto"), { headers: { "content-type": "image/jpeg" } })));
    const corredor = corredorBase();
    const db = repoEnMemoria(corredor);
    db.costoDia.usd = 9; // tope del día: $10
    db.propiedades.push({
      id: "p1", codigo: "DP-01", titulo: "Casa", fotos: Array.from({ length: 12 }, (_, i) => ({ url: `${B}/${i}.jpg`, orden: i })),
    } as never);
    const mejorar = vi.fn(async (b: Buffer) => {
      await new Promise((r) => setTimeout(r, 5));
      return { imagen: b, costoUsd: 0.25 };
    });
    const r = await mejorarFotos(
      { repo: db.repo, fotos: { mejorar } as unknown as EditorFotos, registrar: () => {} } as unknown as Dependencias,
      corredor,
      "DP-01",
      async () => {},
    );
    // Sin la reserva, las 3 en paralelo veían el mismo gasto y se pagaban las 12.
    expect(mejorar).toHaveBeenCalledTimes(4);
    expect(db.costoDia.usd).toBeCloseTo(10);
    expect(r.mejoradas).toHaveLength(4);
    expect(r.mensajes[0]).toContain("Llegué al tope de gasto de IA");
  });

  it("si ya no cabe ninguna, no llama a OpenAI", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("foto"), { headers: { "content-type": "image/jpeg" } })));
    const corredor = corredorBase();
    const db = repoEnMemoria(corredor);
    db.costoDia.usd = 9.9;
    db.propiedades.push({ id: "p1", codigo: "DP-01", titulo: "Casa", fotos: [{ url: `${B}/a.jpg`, orden: 1 }] } as never);
    const mejorar = vi.fn();
    const r = await mejorarFotos(
      { repo: db.repo, fotos: { mejorar } as unknown as EditorFotos, registrar: () => {} } as unknown as Dependencias,
      corredor,
      "DP-01",
      async () => {},
    );
    expect(mejorar).not.toHaveBeenCalled();
    expect(r.mensajes[0]).toContain("límite de gasto");
  });
});
