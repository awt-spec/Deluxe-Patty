import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cerebro } from "../lib/asistente/cerebro";
import { fichaPropiedades } from "../lib/asistente/cerebro";
import { SIN_CONSUMO } from "../lib/asistente/costo";
import { MAX_FOTOS_CLIENTE, casaParaFotos, fotosParaMandar } from "../lib/asistente/fotos-casa";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor, Propiedad } from "../lib/datos/tipos";
import { ErrorWhatsApp, type EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { corredorBase, entrante, repoEnMemoria } from "./dobles";

const foto = (n: number) => ({
  url: `https://x.supabase.co/storage/v1/object/public/fotos/c1/p1/originales/${n}.jpg`,
  mejorada_url: `https://x.supabase.co/storage/v1/object/public/fotos/c1/p1/mejoradas/${n}.jpg`,
  variantes: [{ tipo: "amueblada" as const, url: `https://x.supabase.co/v/${n}.jpg`, detalle: "moderno", creada_at: "2026-10-01" }],
});

function casa(extra: Partial<Propiedad> = {}): Propiedad {
  return {
    id: "p1",
    codigo: "DP-01",
    titulo: "Casa en Escazú",
    tipo: "casa",
    operacion: "venta",
    precio: 485000,
    moneda: "USD",
    provincia: "San José",
    canton: "Escazú",
    distrito: "San Rafael",
    zona: "Escazú",
    habitaciones: 3,
    banos: 2,
    m2_construccion: 250,
    m2_terreno: 400,
    descripcion: null,
    amenidades: [],
    url_e24: null,
    estado: "activa",
    fotos: Array.from({ length: 8 }, (_, i) => foto(i + 1)),
    ...extra,
  };
}

describe("fotos de una casa al cliente", () => {
  let corredor: Corredor;
  let db: ReturnType<typeof repoEnMemoria>;
  let whatsapp: { texto: ReturnType<typeof vi.fn>; imagen: ReturnType<typeof vi.fn>; plantilla: ReturnType<typeof vi.fn> };
  let cerebro: { clasificar: ReturnType<typeof vi.fn>; responder: ReturnType<typeof vi.fn> };
  let propiedades: Propiedad[];
  let orden: string[];
  let deps: Dependencias;

  beforeEach(() => {
    corredor = corredorBase();
    db = repoEnMemoria(corredor);
    propiedades = [casa()];
    db.repo.propiedadesActivas = async (corredorId) => (corredorId === corredor.id ? propiedades : []);
    orden = [];
    let n = 0;
    whatsapp = {
      texto: vi.fn(async () => {
        orden.push("texto");
        return `wamid.t${++n}`;
      }),
      imagen: vi.fn(async () => {
        orden.push("imagen");
        return `wamid.i${++n}`;
      }),
      plantilla: vi.fn(async () => "wamid.aviso"),
    };
    cerebro = {
      clasificar: vi.fn(async () => ({ intencion: "consulta_propiedad", tema: "fotos", consumo: SIN_CONSUMO })),
      responder: vi.fn(async () => ({ texto: "Con gusto, le mando unas fotos.", avisarCorredor: null, enviarFotos: "DP-01", consumo: SIN_CONSUMO })),
    };
    deps = {
      repo: db.repo,
      cerebro: cerebro as unknown as Cerebro,
      whatsapp: whatsapp as unknown as EnviadorWhatsApp,
      plantillaAviso: "aviso_corredor",
      plantillaRecordatorio: "recordatorio_visita",
      registrar: () => {},
    };
  });

  it("manda las fotos originales después del texto, máximo 6, con leyenda solo en la primera", async () => {
    const r = await procesarMensaje(deps, entrante("¿Me manda fotos de la de Escazú?"));
    expect(r).toEqual({ tipo: "respondido", intencion: "consulta_propiedad", borrador: false });
    expect(orden[0]).toBe("texto");
    expect(whatsapp.imagen).toHaveBeenCalledTimes(MAX_FOTOS_CLIENTE);
    const llamadas = whatsapp.imagen.mock.calls;
    expect(llamadas.map((c) => c[2])).toEqual(propiedades[0].fotos!.slice(0, 6).map((f) => f.url));
    expect(llamadas[0]).toEqual(["PNID", "+50688880001", propiedades[0].fotos![0].url, "Casa en Escazú (código DP-01)"]);
    expect(llamadas.slice(1).every((c) => c[3] === "")).toBe(true);
    // Nunca la mejorada ni las variantes.
    expect(llamadas.some((c) => /mejoradas|\/v\//.test(c[2]))).toBe(false);

    const fotos = db.mensajes.filter((m) => m.tipo === "imagen");
    expect(fotos).toHaveLength(6);
    expect(fotos.every((m) => m.direccion === "saliente" && m.autor === "asistente" && m.estado_entrega === "enviado")).toBe(true);
    expect(fotos[0].contenido).toBe(`${propiedades[0].fotos![0].url}\nCasa en Escazú (código DP-01)`);
    expect(fotos[1].contenido).toBe(propiedades[0].fotos![1].url);
    // 1 entrante + 1 texto + 6 fotos.
    expect(db.uso.mensajes_total).toBe(8);
  });

  it("en piloto en sombra no manda fotos: solo queda el borrador del texto", async () => {
    corredor.respuesta_automatica = false;
    const r = await procesarMensaje(deps, entrante("¿Tiene fotos?"));
    expect(r).toMatchObject({ tipo: "respondido", borrador: true });
    expect(whatsapp.texto).not.toHaveBeenCalled();
    expect(whatsapp.imagen).not.toHaveBeenCalled();
    expect(db.mensajes.filter((m) => m.tipo === "imagen")).toHaveLength(0);
  });

  it("no manda fotos de un código que no está entre sus casas (de otro corredor o inventado)", async () => {
    cerebro.responder.mockResolvedValueOnce({ texto: "Le mando fotos.", avisarCorredor: null, enviarFotos: "OTRO-99", consumo: SIN_CONSUMO });
    await procesarMensaje(deps, entrante("Fotos de la casa de Heredia"));
    expect(whatsapp.texto).toHaveBeenCalledTimes(1);
    expect(whatsapp.imagen).not.toHaveBeenCalled();
  });

  it("no manda fotos de una casa vendida o pausada aunque llegue en la lista", async () => {
    propiedades = [casa({ estado: "vendida" })];
    await procesarMensaje(deps, entrante("¿Me manda fotos?"));
    expect(whatsapp.imagen).not.toHaveBeenCalled();
  });

  it("sin el campo (respuesta vieja) o sin fotos, no manda nada", async () => {
    cerebro.responder.mockResolvedValueOnce({ texto: "Sí, sigue disponible.", avisarCorredor: null, consumo: SIN_CONSUMO });
    await procesarMensaje(deps, entrante("¿Sigue disponible?"));
    propiedades = [casa({ fotos: [] })];
    await procesarMensaje(deps, entrante("¿Me manda fotos?"));
    expect(whatsapp.texto).toHaveBeenCalledTimes(2);
    expect(whatsapp.imagen).not.toHaveBeenCalled();
  });

  it("no repite las fotos de la misma casa al mismo chat dentro de 24 horas", async () => {
    await procesarMensaje(deps, entrante("¿Me manda fotos?"));
    await procesarMensaje(deps, entrante("¿Me las manda otra vez?"));
    expect(whatsapp.texto).toHaveBeenCalledTimes(2);
    expect(whatsapp.imagen).toHaveBeenCalledTimes(6);
  });

  it("si una foto no sale, no manda las demás y lo registra sin datos del cliente", async () => {
    const eventos: [string, Record<string, unknown>][] = [];
    deps.registrar = (evento, datos) => eventos.push([evento, datos]);
    whatsapp.imagen
      .mockResolvedValueOnce("wamid.f1")
      .mockResolvedValueOnce("wamid.f2")
      .mockRejectedValueOnce(new ErrorWhatsApp(400, 131053));
    await procesarMensaje(deps, entrante("¿Me manda fotos?"));
    expect(whatsapp.imagen).toHaveBeenCalledTimes(3);
    expect(db.mensajes.filter((m) => m.tipo === "imagen")).toHaveLength(2);
    const falla = eventos.find(([e]) => e === "envio_fotos_fallo");
    expect(falla?.[1]).toMatchObject({ enviadas: 2, codigo: 131053 });
    expect(JSON.stringify(eventos)).not.toContain("+50688880001");
  });

  it("si el texto no salió, tampoco las fotos", async () => {
    whatsapp.texto.mockRejectedValueOnce(new ErrorWhatsApp(400, 131026));
    await procesarMensaje(deps, entrante("¿Me manda fotos?"));
    expect(whatsapp.imagen).not.toHaveBeenCalled();
  });
});

describe("reglas de las fotos", () => {
  it("la ficha dice cuántas fotos reales hay, o ninguna", () => {
    expect(fichaPropiedades([casa()])).toContain("Fotos: 8");
    expect(fichaPropiedades([casa({ fotos: [] })])).toContain("Fotos: ninguna");
    // Sin fotos leídas (otras consultas) no se dice nada.
    expect(fichaPropiedades([casa({ fotos: undefined })])).not.toContain("Fotos:");
  });

  it("solo originales https; el código se busca sin mayúsculas", () => {
    expect(fotosParaMandar([{ url: "http://inseguro/1.jpg" }, { url: "https://ok/2.jpg" }, { url: "no-es-url" }])).toEqual(["https://ok/2.jpg"]);
    expect(casaParaFotos([casa()], " dp-01 ")?.id).toBe("p1");
    expect(casaParaFotos([casa()], "p1")?.id).toBe("p1");
    expect(casaParaFotos([casa()], null)).toBeNull();
    expect(casaParaFotos([casa({ estado: "reservada" })], "DP-01")?.id).toBe("p1");
    expect(casaParaFotos([casa({ estado: "inactiva" })], "DP-01")).toBeNull();
  });
});
