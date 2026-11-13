import { describe, expect, it } from "vitest";
import { cifrasInventadas, cifrasPermitidas, traeCifra } from "../lib/redes/cifras";
import { mejoresReales, opcionesDeFoto } from "../lib/redes/fotos";
import { MOTIVO_CIFRAS, revisarTextoIA, textoDemo } from "../lib/redes/texto-ia";
import { textoPublicacion } from "../lib/redes/texto";
import {
  DURACION_MAX,
  DURACION_MIN,
  MAX_FOTOS_VIDEO,
  TOTAL_MAX,
  agregarFoto,
  ajustar,
  aplicarGuion,
  datosDelVideo,
  duracionTotal,
  escenaEn,
  guionPorDefecto,
  mover,
  quitar,
  revisarGuion,
  textoCorto,
} from "../lib/redes/video";

const casa = {
  codigo: "DP-07",
  titulo: "Casa con piscina en Escazú",
  tipo: "casa",
  operacion: "venta",
  precio: 1250000,
  moneda: "USD",
  zona: "Escazú",
  canton: "Escazú",
  habitaciones: 4,
  banos: 3.5,
  m2_construccion: 380,
  m2_terreno: 900,
  amenidades: ["Piscina", "Jardín"],
};
const contacto = { nombre: "Patricia", whatsapp: "+50688887777" };
const ficha = "- Casa con piscina en Escazú (código DP-07)\n  Precio: USD 1,250,000\n  Habitaciones: 4\n  Baños: 3.5\n  Construcción m²: 380\n  Terreno m²: 900";
const original = textoPublicacion(casa as never, contacto);
const fotos = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://x/f${i + 1}.jpg`, ilustrativa: false }));

describe("cifras", () => {
  it("reconoce la misma cifra con distintos separadores y el teléfono por partes", () => {
    const p = cifrasPermitidas("Precio: USD 1,250,000", "WhatsApp +506 8888 7777", "3.5 baños");
    expect(cifrasInventadas("Precio $1.250.000, 3,5 baños, wa.me/50688887777", p)).toEqual([]);
    expect(cifrasInventadas("A 5 minutos de la playa y 1.300.000", p)).toEqual(["5", "1300000"]);
    expect(traeCifra("Solo $1.250.000", 1250000)).toBe(true);
    expect(traeCifra("Solo $1,25 millones", 1250000)).toBe(false);
  });
});

describe("texto para redes con IA", () => {
  const revisar = (t: string, modo = "mejorar" as const) => revisarTextoIA(t, { ficha, anterior: original, casa: casa as never, contacto, modo });

  it("acepta un texto que solo usa cifras de la ficha", () => {
    const r = revisar(`Hermosa casa en Escazú 🌿\n4 habitaciones, 3,5 baños y 380 m².\n💰 $1.250.000\n📲 wa.me/50688887777 (código DP-07)`);
    expect(r).toEqual({ ok: true, texto: expect.stringContaining("$1.250.000"), repuesto: [] });
  });

  it("descarta si cambia el precio o inventa una cifra", () => {
    expect(revisar("Casa en Escazú, ahora $1.100.000. wa.me/50688887777 DP-07")).toEqual({ ok: false, motivo: MOTIVO_CIFRAS });
    expect(revisar("Casa a 10 minutos del mall. $1.250.000 wa.me/50688887777 DP-07")).toEqual({ ok: false, motivo: MOTIVO_CIFRAS });
  });

  it("si se pierden el precio, el código o el contacto, el código los vuelve a poner", () => {
    const r = revisar("Una casa preciosa en Escazú, con piscina y jardín.");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).toContain("💰 $1.250.000");
    expect(r.texto).toContain("wa.me/50688887777 (código DP-07)");
    expect(r.repuesto).toEqual(["el precio", "el código y el contacto"]);
    const en = revisarTextoIA("Beautiful home in Escazú.", { ficha, anterior: original, casa: casa as never, contacto, modo: "ingles" });
    expect(en.ok && en.texto).toContain("(code DP-07)");
  });

  it("la demo no inventa nada: devuelve el mismo texto (o sus líneas)", () => {
    expect(textoDemo("vendedor", original)).toContain(original);
    expect(cifrasInventadas(textoDemo("corto", original), cifrasPermitidas(original))).toEqual([]);
  });

  it("la demo no mete avisos en el texto, ni apila con pedidos seguidos", () => {
    const uno = textoDemo("mejorar", original);
    const dos = textoDemo("vendedor", uno);
    const viejo = textoDemo("ingles", `(Demostración: aquí la IA dejaría tu texto más claro.)\n\n(Demo: here the AI would translate.)\n\n${original}`);
    for (const t of [uno, dos, viejo]) expect(t).not.toMatch(/\(Demo/i);
    expect(dos).toBe(uno);
    expect(viejo).toBe(original.trim());
  });
});

describe("guion del video", () => {
  const datos = datosDelVideo(casa as never, "+506 8888 7777", "Deluxe Properties");

  it("los datos de la escena los escribe el código desde la ficha", () => {
    expect(datos.precio).toBe("$1.250.000");
    expect(datos.datos).toEqual(["4 habitaciones", "3,5 baños", "380 m²", "900 m² de terreno"]);
    expect(datos.operacion).toBe("EN VENTA");
  });

  it("sin IA: portada, una escena por foto, datos y cierre, dentro de 45 s", () => {
    const e = guionPorDefecto(fotos(4), datos);
    expect(e.map((x) => x.tipo)).toEqual(["portada", "foto", "foto", "foto", "datos", "cierre"]);
    expect(e[0].foto?.url).toBe("https://x/f1.jpg");
    expect(duracionTotal(e)).toBeLessThanOrEqual(TOTAL_MAX);
    expect(guionPorDefecto([], datos)).toEqual([]);
  });

  it("ajustar deja duraciones de 2 a 6 s, hasta 12 fotos y 45 s como máximo", () => {
    const base = guionPorDefecto(fotos(2), datos);
    const largas = ajustar(base.map((x) => ({ ...x, duracion: 99, texto: "x".repeat(200) })));
    expect(largas.every((x) => x.duracion >= DURACION_MIN && x.duracion <= DURACION_MAX)).toBe(true);
    expect(largas.every((x) => x.texto.length <= 60)).toBe(true);
    let muchas = base;
    for (const f of fotos(20)) muchas = agregarFoto(muchas, f);
    expect(muchas.filter((x) => x.tipo === "foto").length).toBe(MAX_FOTOS_VIDEO);
    expect(duracionTotal(ajustar(muchas.map((x) => ({ ...x, duracion: 6 }))))).toBeLessThanOrEqual(TOTAL_MAX);
  });

  it("la portada y el cierre no se mueven ni se quitan; las fotos sí", () => {
    const e = guionPorDefecto(fotos(3), datos);
    expect(mover(e, 0, 1)).toBe(e);
    expect(mover(e, 1, -1)).toBe(e);
    expect(mover(e, 1, 1).map((x) => x.foto?.url)).toEqual([e[0].foto?.url, e[2].foto?.url, e[1].foto?.url, undefined, undefined]);
    expect(quitar(e, 0)).toBe(e);
    expect(quitar(e, 1).length).toBe(e.length - 1);
  });

  it("escenaEn dice qué escena se ve en cada segundo", () => {
    const e = guionPorDefecto(fotos(2), datos); // 4 + 3 + 4 + 4
    expect(escenaEn(e, 0)).toEqual({ indice: 0, local: 0 });
    expect(escenaEn(e, 5)).toEqual({ indice: 1, local: 1 });
    expect(escenaEn(e, 999).indice).toBe(e.length - 1);
  });

  it("revisa el guion de la IA: solo fotos de la lista, sin repetir, textos cortos y sin cifras inventadas", () => {
    const lista = fotos(3).map((f, i) => ({ id: `F${i + 1}`, url: f.url, nombre: `Foto ${i + 1}`, ilustrativa: false }));
    const permitidas = cifrasPermitidas(ficha);
    const r = revisarGuion(
      {
        escenas: [
          { foto: "F2", texto: "" },
          { foto: "F9", texto: "No existe" },
          { foto: "f1", texto: "Sala con 4 ventanales y una luz preciosa que entra todo el día por el jardín" },
          { foto: "F2", texto: "Repetida" },
          { foto: "F3", texto: "A 5 minutos de la playa" },
        ],
      },
      lista,
      permitidas,
    );
    expect(r).toEqual({
      ok: true,
      quitados: 1,
      escenas: [
        { url: "https://x/f2.jpg", texto: "" },
        { url: "https://x/f1.jpg", texto: textoCorto("Sala con 4 ventanales y una luz preciosa que entra todo el día por el jardín") },
        { url: "https://x/f3.jpg", texto: "" },
      ],
    });
    expect(revisarGuion({ escenas: [{ foto: "X", texto: "" }] }, lista, permitidas).ok).toBe(false);
    expect(revisarGuion("nada", lista, permitidas).ok).toBe(false);
  });

  it("aplicar el guion pone la primera foto en la portada y conserva datos y cierre", () => {
    const e = guionPorDefecto(fotos(3), datos);
    const nuevo = aplicarGuion(e, [{ url: "https://x/f3.jpg", texto: "" }, { url: "https://x/f1.jpg", texto: "Sala amplia" }, { url: "https://otro/sitio.jpg", texto: "x" }], fotos(3));
    expect(nuevo.map((x) => [x.tipo, x.foto?.url, x.texto])).toEqual([
      ["portada", "https://x/f3.jpg", e[0].texto],
      ["foto", "https://x/f1.jpg", "Sala amplia"],
      ["datos", undefined, "Lo que tiene"],
      ["cierre", undefined, "Escríbeme"],
    ]);
  });

  it("el video usa por defecto la mejor versión real de cada foto (no las ilustrativas)", () => {
    const op = opcionesDeFoto([
      { url: "a.jpg", orden: 1, mejorada_url: "a-m.jpg", variantes: [{ tipo: "amueblada", url: "a-am.jpg", detalle: "", creada_at: "" }] },
      { url: "b.jpg", orden: 2 },
    ]);
    expect(mejoresReales(op).map((o) => o.url)).toEqual(["a-m.jpg", "b.jpg"]);
    expect(op.find((o) => o.url === "a-am.jpg")).toMatchObject({ ilustrativa: true, tipo: "amueblada", original: "a.jpg" });
  });
});
