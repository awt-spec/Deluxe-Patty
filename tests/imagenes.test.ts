import { describe, expect, it, vi } from "vitest";
import { dentroDelTope } from "../lib/asistente/limites";
import { costoImagen } from "../lib/fotos/editor";

describe("costo de las imágenes de OpenAI", () => {
  it("se calcula con el uso de tokens que informa la API", () => {
    // 100 de texto a $5/M + 1.000 de imagen a $10/M + 4.000 de salida a $40/M = 0,0005 + 0,01 + 0,16
    expect(costoImagen({ input_tokens: 1100, output_tokens: 4000, input_tokens_details: { text_tokens: 100, image_tokens: 1000 } })).toBe(0.1705);
  });

  it("sin uso informado se cuenta un estimado fijo (para que el tope igual frene)", () => {
    expect(costoImagen(undefined)).toBe(0.25);
    vi.stubEnv("OPENAI_COSTO_IMAGEN_USD", "0.4");
    expect(costoImagen(null)).toBe(0.4);
    vi.unstubAllEnvs();
  });
});

describe("topes de gasto de IA", () => {
  it("frena al llegar al tope del día o al del mes", () => {
    expect(dentroDelTope({ gastoDia: 9.99, gastoMes: 100, topeDia: 10, topeMes: 150 })).toBe(true);
    expect(dentroDelTope({ gastoDia: 10, gastoMes: 100, topeDia: 10, topeMes: 150 })).toBe(false);
    expect(dentroDelTope({ gastoDia: 1, gastoMes: 150, topeDia: 10, topeMes: 150 })).toBe(false);
    // Tope en cero: la IA queda apagada para ese corredor.
    expect(dentroDelTope({ gastoDia: 0, gastoMes: 0, topeDia: 0, topeMes: 150 })).toBe(false);
  });
});

describe("amueblar y quitar objetos (imágenes ilustrativas)", () => {
  const BASE = "https://proyecto.supabase.co/storage/v1/object/public/fotos";
  const preparar = async (extra: Record<string, unknown> = {}) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("foto"), { headers: { "content-type": "image/jpeg" } })));
    const { corredorBase, repoEnMemoria } = await import("./dobles");
    const corredor = { ...corredorBase(), ...extra };
    const db = repoEnMemoria(corredor);
    const editor = {
      amueblar: vi.fn(async () => ({ imagen: Buffer.from("amueblada"), costoUsd: 0.3 })),
      limpiar: vi.fn(async () => ({ imagen: Buffer.from("limpia"), costoUsd: 0.2 })),
    };
    const deps = { repo: db.repo, fotos: editor, registrar: () => {} } as never;
    const fotos = [{ url: `${BASE}/${corredor.id}/p1/originales/sala.jpg`, orden: 1 }];
    return { corredor, db, editor, deps, fotos };
  };

  it("guarda la versión amueblada aparte, sin tocar la original, y suma su costo", async () => {
    const { crearVariante } = await import("../lib/fotos/variantes");
    const { corredor, db, editor, deps, fotos } = await preparar();
    const r = await crearVariante(deps, corredor, "p1", fotos, fotos[0].url, { tipo: "amueblada", estilo: "tropical", cuarto: "sala" });
    expect(r.ok).toBe(true);
    expect(editor.amueblar).toHaveBeenCalledWith(expect.any(Buffer), "image/jpeg", "tropical", "sala");
    expect(fotos[0].url).toContain("originales/sala.jpg");
    expect((fotos[0] as { variantes?: { tipo: string; detalle: string }[] }).variantes?.[0]).toMatchObject({ tipo: "amueblada", detalle: "Estilo tropical" });
    expect((await db.repo.presupuestoIA(corredor.id)).gastoDia).toBeCloseTo(0.3);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("no gasta nada en la demo, con imágenes apagadas, sin tope o con una foto ajena", async () => {
    const { crearVariante } = await import("../lib/fotos/variantes");
    for (const [extra, url, esperado] of [
      [{ activo: false }, null, "demo"],
      [{ imagenes_activas: false }, null, "apagadas"],
      [{}, "https://otro.sitio/foto.jpg", "No encontré esa foto"],
    ] as const) {
      const { corredor, editor, deps, fotos } = await preparar(extra);
      const r = await crearVariante(deps, corredor, "p1", fotos, url ?? fotos[0].url, { tipo: "limpia", queQuitar: "el carro" });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.motivo).toContain(esperado);
      expect(editor.limpiar).not.toHaveBeenCalled();
    }
    const { corredor, db, editor, deps, fotos } = await preparar();
    await db.repo.registrarImagenes(corredor.id, 1, 50); // pasa el tope del día ($10)
    const r = await crearVariante(deps, corredor, "p1", fotos, fotos[0].url, { tipo: "limpia", queQuitar: "el carro" });
    expect(!r.ok && r.motivo).toContain("límite");
    expect(editor.limpiar).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("imagen y texto para redes", () => {
  const casa = {
    titulo: "Casa contemporánea con vista al valle", operacion: "venta", tipo: "casa", precio: 1_250_000, moneda: "USD",
    zona: "Escazú", canton: "Escazú", habitaciones: 4, banos: 3.5, m2_construccion: 380, m2_terreno: 900,
    amenidades: ["Piscina", "Vista"], codigo: "DLX-01",
  } as const;

  it("el texto sale de la ficha, con el código y el WhatsApp de la asistente", async () => {
    const { textoPublicacion } = await import("../lib/redes/texto");
    const t = textoPublicacion(casa as never, { nombre: "Patricia", whatsapp: "+50688000000" });
    expect(t).toContain("Casa en venta · Escazú");
    expect(t).toContain("$1.250.000");
    expect(t).toContain("4 habitaciones · 3,5 baños · 380 m²");
    expect(t).toContain("wa.me/50688000000 (código DLX-01)");
    expect(t).toContain("#Escazú");
  });

  it("en alquiler dice al mes y no inventa datos que no hay", async () => {
    const { textoPublicacion } = await import("../lib/redes/texto");
    const t = textoPublicacion({ ...casa, operacion: "alquiler", precio: 2500, habitaciones: null, banos: null, m2_construccion: null, m2_terreno: null, amenidades: [] } as never, { nombre: "Patricia", whatsapp: null });
    expect(t).toContain("$2.500 al mes");
    expect(t).not.toContain("habitaciones");
    expect(t).toContain("Escríbele a Patricia");
  });

  it("solo se usan fotos de la casa; las hechas con IA van marcadas como ilustrativas", async () => {
    const { opcionesDeFoto } = await import("../lib/redes/fotos");
    const op = opcionesDeFoto([
      { url: "a.jpg", orden: 1, mejorada_url: "a-mejorada.jpg", variantes: [{ tipo: "amueblada", url: "a-amueblada.jpg", detalle: "", creada_at: "" }] },
    ]);
    expect(op.map((o) => [o.url, o.ilustrativa])).toEqual([
      ["a-mejorada.jpg", false],
      ["a.jpg", false],
      ["a-amueblada.jpg", true],
    ]);
  });
});

describe("imágenes desde el chat de Patty", () => {
  const foto = { tipo: "imagen" as const, mediaType: "image/jpeg" as const, datos: Buffer.from("sala").toString("base64"), nombre: "sala.jpg" };

  it("entiende cuándo le piden una imagen y cuándo es una conversación", async () => {
    const { pideImagen } = await import("../lib/panel/imagenes-patty");
    expect(pideImagen("Hazme una imagen para Instagram de una casa con piscina")).toEqual({ tipo: "generar", formato: "cuadrada" });
    expect(pideImagen("Genérame una historia para anunciar el open house")).toEqual({ tipo: "generar", formato: "vertical" });
    expect(pideImagen("crea un banner para mi página")).toEqual({ tipo: "generar", formato: "horizontal" });
    expect(pideImagen("Amuebla esta sala en estilo moderno", [foto])).toMatchObject({ tipo: "editar" });
    expect(pideImagen("Quítale el carro a la foto", [foto])).toMatchObject({ tipo: "editar" });
    // Sin foto, "quita…" no es una imagen; y preguntar sobre una foto tampoco.
    expect(pideImagen("Quita a Juan de mis clientes")).toBeNull();
    expect(pideImagen("¿Qué le mejorarías a esta foto?", [foto])).toBeNull();
    expect(pideImagen("¿A quién debería llamar hoy?")).toBeNull();
    expect(pideImagen("Hazme un resumen de mis clientes")).toBeNull();
  });

  it("genera, guarda en el bucket del corredor y suma el costo; en la demo no", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    const { imagenParaPatty } = await import("../lib/panel/imagenes-patty");
    const { corredorBase, repoEnMemoria } = await import("./dobles");
    const corredor = corredorBase();
    const db = repoEnMemoria(corredor);
    const editor = { generar: vi.fn(async () => ({ imagen: Buffer.from("img"), costoUsd: 0.17 })), editarLibre: vi.fn() };
    const deps = { repo: db.repo, fotos: editor, registrar: () => {} } as never;
    const r = await imagenParaPatty(deps, corredor, { tipo: "generar", formato: "vertical" }, "Hazme una historia");
    expect(r.ok).toBe(true);
    expect(r.ok && r.texto).toMatch(/!\[Imagen hecha con IA\]\(.+\/patty\/\d+\.jpg\)/);
    expect(editor.generar).toHaveBeenCalledWith("Hazme una historia", "vertical");
    expect((await db.repo.presupuestoIA(corredor.id)).gastoDia).toBeCloseTo(0.17);

    const demo = await imagenParaPatty(deps, { ...corredor, activo: false }, { tipo: "generar", formato: "cuadrada" }, "Hazme una imagen");
    expect(demo.ok).toBe(false);
    expect(editor.generar).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});

describe("fotos que puede leer la imagen para redes", () => {
  it("un corredor activo solo usa su bucket; la demo, además, las fotos de ejemplo de Unsplash", async () => {
    const { fotosParaRedes } = await import("../lib/redes/fotos");
    const propias = (f: { url: string }[]) => f.filter((x) => x.url.startsWith("https://propio/")) as never;
    const fotos = [{ url: "https://propio/a.jpg" }, { url: "https://images.unsplash.com/photo-1?w=1" }, { url: "http://169.254.169.254/x" }];
    expect(fotosParaRedes(fotos, { id: "c", activo: true }, propias).map((f) => f.url)).toEqual(["https://propio/a.jpg"]);
    expect(fotosParaRedes(fotos, { id: "c", activo: false }, propias).map((f) => f.url)).toEqual(["https://images.unsplash.com/photo-1?w=1"]);
  });
});
