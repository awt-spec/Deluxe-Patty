import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  armarPedido,
  caminoEnvio,
  caminoMejorada,
  causaRespuesta,
  configFotosSitio,
  enviarAlSitio,
  esCaminoEnvio,
  esFotoParaSitio,
  firmarCuerpo,
  leerRespuestaSitio,
  mensajeFallaSitio,
  urlPublicaFoto,
} from "@/lib/sitio/fotos";
import {
  filtrarCasas,
  moverFotoEnvio,
  pedidoDeEnvio,
  pideSubirAlSitio,
  portadaDe,
  proponerCasa,
  quitarFotoEnvio,
  resumenEnvio,
  textoResultado,
  type CasaDelSitio,
  type EnvioSitio,
} from "@/lib/panel/sitio-fotos";
import { turnoValido } from "@/lib/panel/almacen";

const CORREDOR = "00000000-0000-4000-8000-000000000001";
const CASA = "60000000-0000-4000-8000-000000000001";
const OTRA = "60000000-0000-4000-8000-000000000002";
const BASE = "https://portal.supabase.co";
const SECRETO = "s".repeat(32);

describe("Configuración", () => {
  it("un valor suelto es de Deluxe; JSON por slug; exige https y secreto largo", () => {
    expect(configFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: "https://x.supabase.co/functions/v1/recibir-fotos", SITIO_FOTOS_SECRETO: SECRETO })).toEqual({
      url: "https://x.supabase.co/functions/v1/recibir-fotos",
      secreto: SECRETO,
    });
    const env = { SITIO_FOTOS_URL: JSON.stringify({ otro: "https://o.example/f" }), SITIO_FOTOS_SECRETO: JSON.stringify({ otro: SECRETO }) };
    expect(configFotosSitio("otro", env)?.url).toBe("https://o.example/f");
    expect(configFotosSitio("deluxe-properties", env)).toBeNull();
    expect(configFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: "http://x/f", SITIO_FOTOS_SECRETO: SECRETO })).toBeNull();
    expect(configFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: "https://x/f", SITIO_FOTOS_SECRETO: "corto" })).toBeNull();
    expect(configFotosSitio(null, {})).toBeNull();
    expect(configFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: "{roto", SITIO_FOTOS_SECRETO: SECRETO })).toBeNull();
  });
});

describe("Firma y pedido", () => {
  it("firma HMAC-SHA256 del cuerpo exacto, en hexadecimal", () => {
    expect(firmarCuerpo("k", "hola")).toBe(createHmac("sha256", "k").update("hola").digest("hex"));
  });

  it("arma el cuerpo con orden, portada, ts en segundos y nonce, sin repetidas", () => {
    const a = `${BASE}/storage/v1/object/public/fotos/a.jpg`;
    const b = `${BASE}/storage/v1/object/public/fotos/b.jpg`;
    const p = armarPedido({ codigo: "dp-01ab2c", fotos: [a, b, a], portada: b, secreto: SECRETO }, 1_700_000_000_123, "n-1");
    expect(JSON.parse(p.cuerpo)).toEqual({ codigo: "DP-01AB2C", fotos: [{ url: a, orden: 1 }, { url: b, orden: 2 }], portada_url: b, ts: 1_700_000_000, nonce: "n-1" });
    expect(p.firma).toBe(firmarCuerpo(SECRETO, p.cuerpo));
    // Cambiar un byte invalida la firma.
    expect(firmarCuerpo(SECRETO, p.cuerpo.replace("DP-01AB2C", "DP-01AB2D"))).not.toBe(p.firma);
  });

  it("una portada que no está entre las fotos no se manda; sin fotos no hay pedido", () => {
    const a = `${BASE}/a.jpg`;
    expect(JSON.parse(armarPedido({ codigo: "DP-1", fotos: [a], portada: "https://otra/x.jpg", secreto: SECRETO }).cuerpo)).not.toHaveProperty("portada_url");
    expect(() => armarPedido({ codigo: "DP-1", fotos: [], secreto: SECRETO })).toThrow();
  });

  it("dos pedidos llevan nonce distinto", () => {
    const a = armarPedido({ codigo: "DP-1", fotos: ["https://x/a"], secreto: SECRETO });
    const b = armarPedido({ codigo: "DP-1", fotos: ["https://x/a"], secreto: SECRETO });
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe("Solo fotos propias de la carpeta de envío de esa casa", () => {
  const camino = caminoEnvio(CORREDOR, CASA, "1700000000000-abc123", 3);

  it("la ruta del envío y su mejorada", () => {
    expect(camino).toBe(`${CORREDOR}/${CASA}/al-sitio/1700000000000-abc123-3.jpg`);
    expect(esCaminoEnvio(camino, CORREDOR, CASA)).toBe(true);
    expect(esCaminoEnvio(caminoMejorada(camino), CORREDOR, CASA, true)).toBe(true);
    expect(esCaminoEnvio(caminoMejorada(camino), CORREDOR, CASA)).toBe(false);
  });

  it("otra casa, otro corredor, otra carpeta o ../ no sirven", () => {
    expect(esCaminoEnvio(camino, CORREDOR, OTRA)).toBe(false);
    expect(esCaminoEnvio(camino.replace(CORREDOR, "00000000-0000-4000-8000-000000000002"), CORREDOR, CASA)).toBe(false);
    expect(esCaminoEnvio(`${CORREDOR}/${CASA}/originales/1700000000000-abc123.jpg`, CORREDOR, CASA)).toBe(false);
    expect(esCaminoEnvio(`${CORREDOR}/${CASA}/al-sitio/../x-1.jpg`, CORREDOR, CASA)).toBe(false);
    expect(esCaminoEnvio(42, CORREDOR, CASA)).toBe(false);
  });

  it("la dirección que sale al sitio: host exacto del portal, Storage público, sin consulta", () => {
    const url = urlPublicaFoto(BASE, camino);
    expect(esFotoParaSitio(url, BASE, CORREDOR, CASA)).toBe(true);
    expect(esFotoParaSitio(url.replace("portal.supabase.co", "otro.supabase.co"), BASE, CORREDOR, CASA)).toBe(false);
    expect(esFotoParaSitio(url.replace("https:", "http:"), BASE, CORREDOR, CASA)).toBe(false);
    expect(esFotoParaSitio(`${url}?x=1`, BASE, CORREDOR, CASA)).toBe(false);
    expect(esFotoParaSitio(url.replace("/public/fotos/", "/public/fichas/"), BASE, CORREDOR, CASA)).toBe(false);
    expect(esFotoParaSitio("no es url", BASE, CORREDOR, CASA)).toBe(false);
  });
});

describe("Respuesta del sitio", () => {
  const hostsFotos = ["sitio.supabase.co", "sitio.storage.supabase.co"];
  const sitio = "https://www.deluxeproperties.sale";

  it("toma las fotos de su Storage y el enlace de la casa en su dirección pública", () => {
    const r = leerRespuestaSitio(
      { ok: true, fotos: [{ url: "https://sitio.supabase.co/storage/v1/object/public/property-media/images/a.jpg" }, { url: "https://malo.com/x.jpg" }], url_casa: `${sitio}/propiedad/casa-escazu` },
      { hostsFotos, sitio },
    );
    expect(r).toEqual({ fotos: ["https://sitio.supabase.co/storage/v1/object/public/property-media/images/a.jpg"], urlCasa: `${sitio}/propiedad/casa-escazu` });
  });

  it("un enlace a otro sitio se descarta; sin ok no hay respuesta", () => {
    expect(leerRespuestaSitio({ ok: true, fotos: [], url_casa: "https://phishing.example/x" }, { hostsFotos, sitio })?.urlCasa).toBeNull();
    expect(leerRespuestaSitio({ ok: false }, { hostsFotos, sitio })).toBeNull();
    expect(leerRespuestaSitio(null, { hostsFotos, sitio })).toBeNull();
  });

  it("cada falla con su causa y palabras de todos los días", () => {
    expect(causaRespuesta(401, "firma")).toBe("firma");
    expect(causaRespuesta(400, "repetido")).toBe("firma");
    expect(causaRespuesta(404, "casa_no_encontrada")).toBe("casa");
    expect(causaRespuesta(409, "casa_fija")).toBe("casa_fija");
    expect(causaRespuesta(422, "foto_tipo")).toBe("fotos");
    expect(causaRespuesta(429, null)).toBe("ocupado");
    expect(causaRespuesta(503, null)).toBe("pasajera");
    for (const c of ["firma", "casa", "casa_fija", "fotos", "ocupado", "pasajera", "otra"] as const) {
      expect(mensajeFallaSitio(c)).not.toMatch(/HMAC|401|nonce|error/i);
    }
  });

  it("enviar: POST con la firma; red caída = pasajera, nunca lanza", async () => {
    const pedido = armarPedido({ codigo: "DP-1", fotos: ["https://x/a"], secreto: SECRETO });
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, fotos: [] }), { status: 200 }));
    const r = await enviarAlSitio("https://sitio/f", pedido, f as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-firma"]).toBe(pedido.firma);
    expect(init.body).toBe(pedido.cuerpo);
    const caida = await enviarAlSitio("https://sitio/f", pedido, (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(caida).toEqual({ ok: false, causa: "pasajera", status: null });
    const rechazo = await enviarAlSitio("https://sitio/f", pedido, (async () => new Response(JSON.stringify({ ok: false, error: "firma" }), { status: 401 })) as unknown as typeof fetch);
    expect(rechazo).toEqual({ ok: false, causa: "firma", status: 401 });
  });
});

const casas: CasaDelSitio[] = [
  { id: "1", codigo: "DP-01AB2C", titulo: "Casa con piscina en Escazú", zona: "Escazú", foto: null },
  { id: "2", codigo: "DP-9ZZ001", titulo: "Apartamento en Santa Ana", zona: "Santa Ana", foto: null },
  { id: "3", codigo: "DP-01XY99", titulo: "Lote en Lindora", zona: "Lindora", foto: null },
];

describe("Chat: entender el pedido y proponer la casa", () => {
  it("reconoce pedidos de subir fotos al sitio o a una casa", () => {
    expect(pideSubirAlSitio("sube estas fotos al sitio")).toBe(true);
    expect(pideSubirAlSitio("Patty, sube estas fotos a la casa de Escazú")).toBe(true);
    expect(pideSubirAlSitio("ponle estas fotos a DP-01AB2C")).toBe(true);
    expect(pideSubirAlSitio("agrega estas imágenes a la página web")).toBe(true);
  });

  it("no confunde preguntas ni otros pedidos", () => {
    expect(pideSubirAlSitio("¿Cómo subo fotos a la casa?")).toBe(false);
    expect(pideSubirAlSitio("analiza estas fotos")).toBe(false);
    expect(pideSubirAlSitio("sube estas fotos")).toBe(false);
    expect(pideSubirAlSitio("agrega esta casa: Escazú, 3 cuartos")).toBe(false);
  });

  it("propone por código (completo o el comienzo único), por zona o título; con empate no propone", () => {
    expect(proponerCasa("sube estas fotos a DP-01AB2C", casas)?.id).toBe("1");
    expect(proponerCasa("sube a dp 9zz", casas)?.id).toBe("2");
    expect(proponerCasa("sube a DP-01", casas)).toBeNull();
    expect(proponerCasa("sube estas fotos a la casa de Escazú", casas)?.id).toBe("1");
    expect(proponerCasa("las fotos del lote de lindora", casas)?.id).toBe("3");
    expect(proponerCasa("sube estas fotos al sitio", casas)).toBeNull();
  });

  it("el buscador encuentra por código, título o zona sin tildes", () => {
    expect(filtrarCasas(casas, "escazu").map((c) => c.id)).toEqual(["1"]);
    expect(filtrarCasas(casas, "dp-9").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarCasas(casas, "")).toHaveLength(3);
  });
});

describe("Chat: orden, portada y lo que se manda", () => {
  const base = (): EnvioSitio => ({
    paso: "orden",
    casa: casas[0],
    fotos: [
      { id: "a", mini: "blob:a", camino: "c/a.jpg", mejorada: null, usar: "original" },
      { id: "b", mini: "blob:b", camino: "c/b.jpg", mejorada: { camino: "c/b-mejorada.jpg", url: "https://x/b-m.jpg" }, usar: "mejorada" },
      { id: "c", mini: "blob:c", camino: "c/c.jpg", mejorada: null, usar: "original" },
    ],
    portada: null,
    demo: false,
    resultado: null,
  });

  it("mover arriba y abajo sin salirse; portada por defecto la primera", () => {
    const e = base();
    expect(moverFotoEnvio(e.fotos, "b", -1).map((f) => f.id)).toEqual(["b", "a", "c"]);
    expect(moverFotoEnvio(e.fotos, "a", -1)).toBe(e.fotos);
    expect(moverFotoEnvio(e.fotos, "c", 1)).toBe(e.fotos);
    expect(portadaDe(e)?.id).toBe("a");
    expect(portadaDe({ ...e, portada: "c" })?.id).toBe("c");
  });

  it("quitar la portada vuelve a la primera", () => {
    const e = quitarFotoEnvio({ ...base(), portada: "c" }, "c");
    expect(e.fotos).toHaveLength(2);
    expect(e.portada).toBeNull();
  });

  it("el pedido lleva cada foto con su versión y la portada por índice", () => {
    expect(pedidoDeEnvio({ ...base(), portada: "c" })).toEqual({
      fotos: [
        { camino: "c/a.jpg", usar: "original" },
        { camino: "c/b.jpg", usar: "mejorada" },
        { camino: "c/c.jpg", usar: "original" },
      ],
      portada: 2,
    });
    // Si una no subió, no se manda nada a medias.
    const e = base();
    e.fotos[1] = { ...e.fotos[1], camino: null };
    expect(pedidoDeEnvio(e)).toBeNull();
  });

  it("la tarjeta dice qué va mejorado, la portada y que no se borra nada", () => {
    const l = resumenEnvio({ ...base(), portada: "b" });
    expect(l[0]).toBe("Casa con piscina en Escazú (DP-01AB2C)");
    expect(l.join(" ")).toMatch(/No se borra ninguna/);
    expect(l.join(" ")).toMatch(/Portada: la foto 2/);
    expect(l.join(" ")).toMatch(/1 va mejorada con IA \(la original queda guardada\)/);
  });

  it("el texto final: demo simulado; real con la casa", () => {
    expect(textoResultado({ ...base(), demo: true, resultado: { fotos: [], urlCasa: null } })).toMatch(/Demostración: así quedarían 3 fotos/);
    expect(textoResultado({ ...base(), resultado: { fotos: ["https://x/1", "https://x/2"], urlCasa: "https://s/p" } })).toMatch(/subí 2 fotos al sitio/);
  });
});

describe("Lo guardado del chat: el resultado del sitio solo con direcciones https", () => {
  it("acepta fotos https y enlace; descarta lo demás", () => {
    expect(turnoValido({ autor: "asistente", texto: "Listo", sitio: { fotos: ["https://a/1.jpg"], url: "https://s/p" } })?.sitio).toEqual({ fotos: ["https://a/1.jpg"], url: "https://s/p" });
    expect(turnoValido({ autor: "asistente", texto: "Listo", sitio: { fotos: ["javascript:alert(1)"], url: null } })).toBeNull();
    expect(turnoValido({ autor: "asistente", texto: "Listo", sitio: { fotos: [], url: "http://s/p" } })).toBeNull();
  });
});

describe("diagnosticoFotosSitio", async () => {
  const { diagnosticoFotosSitio } = await import("../lib/sitio/fotos");
  const URL_OK = "https://x.supabase.co/functions/v1/recibir-fotos";
  it("dice qué falta sin mostrar la clave", () => {
    expect(diagnosticoFotosSitio("deluxe-properties", {})).toBe("falta_url");
    expect(diagnosticoFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: URL_OK })).toBe("falta_secreto");
    expect(diagnosticoFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: URL_OK, SITIO_FOTOS_SECRETO: "corta" })).toBe("secreto_corto");
    expect(diagnosticoFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: "http://x", SITIO_FOTOS_SECRETO: "x".repeat(40) })).toBe("url_no_https");
    expect(diagnosticoFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: "{mal", SITIO_FOTOS_SECRETO: "x".repeat(40) })).toBe("json_invalido");
    expect(diagnosticoFotosSitio("deluxe-properties", { SITIO_FOTOS_URL: ` ${URL_OK}\n`, SITIO_FOTOS_SECRETO: "x".repeat(40) })).toBe("conectado");
  });
});
