import { describe, expect, it } from "vitest";
import {
  MAX_CARRUSEL,
  analisisDemo,
  dimensionesImagen,
  espaciosQueFaltan,
  normalizarEspacio,
  puntajeFoto,
  resumirFotos,
  revisarAnalisis,
  tipoImagen,
  type AnalisisCrudo,
  type FotoParaAnalisis,
} from "@/lib/redes/analisis-fotos";
import { cifrasPermitidas } from "@/lib/redes/cifras";
import { fotosGuardadas } from "@/lib/redes/guardado-estratega";

// "Analizar fotos": la IA califica; el código calcula el puntaje, elige portadas por proporción real, qué mejorar,
// qué falta y el orden del carrusel, y lee el tamaño de la imagen de sus bytes.

const foto = (n: number, ancho: number | null = 2400, alto: number | null = 1600, mejorada = false): FotoParaAnalisis => ({
  id: `F${n}`,
  url: `https://sb.test/fotos/c/${n}.jpg`,
  nombre: `Foto ${n}`,
  ancho,
  alto,
  mejorada,
  original: `https://sb.test/fotos/c/${n}.jpg`,
});
const nota = (n: number, espacio: string, luz: number, encuadre = luz, orden = luz, nitidez = luz, mejorar = false): AnalisisCrudo => ({
  foto: `F${n}`,
  espacio,
  muestra: `${espacio} ${n}`,
  luz,
  encuadre,
  orden,
  nitidez,
  mejorar,
  consejo: "",
});

describe("Puntaje y revisión de lo que dice la IA", () => {
  it("puntaje de 0 a 100 con la luz y el encuadre pesando más", () => {
    expect(puntajeFoto({ luz: 5, encuadre: 5, orden: 5, nitidez: 5 })).toBe(100);
    expect(puntajeFoto({ luz: 1, encuadre: 1, orden: 1, nitidez: 1 })).toBe(0);
    expect(puntajeFoto({ luz: 5, encuadre: 5, orden: 1, nitidez: 1 })).toBeGreaterThan(puntajeFoto({ luz: 1, encuadre: 1, orden: 5, nitidez: 5 }));
  });

  it("solo fotos que se mandaron, una vez, notas de 1 a 5 y espacios normalizados", () => {
    const fotos = [foto(1), foto(2)];
    const r = revisarAnalisis(
      [
        { ...nota(1, "Baño principal", 9, 0, 3, 3), consejo: "Tiene 7 baños" },
        nota(1, "sala", 5),
        nota(9, "sala", 5),
        { ...nota(2, "master bedroom", 4), foto: "f2" },
      ],
      fotos,
      cifrasPermitidas("Baños: 3"),
    );
    expect(r.map((f) => [f.id, f.espacio])).toEqual([
      ["F1", "bano_principal"],
      ["F2", "dormitorio_principal"],
    ]);
    expect(r[0].notas).toEqual({ luz: 5, encuadre: 1, orden: 3, nitidez: 3 });
    expect(r[0].consejo).toBe("");
    expect(r[0].url).toBe(fotos[0].url);
  });

  it("normaliza espacios con tildes, sinónimos o desconocidos", () => {
    expect(normalizarEspacio("Área social")).toBe("area_social");
    expect(normalizarEspacio("Jardín")).toBe("jardin");
    expect(normalizarEspacio("cuarto de pilas")).toBe("dormitorio");
    expect(normalizarEspacio("algo raro")).toBe("otro");
  });
});

describe("Resumen: portadas, mejoras, faltantes y carrusel", () => {
  const fotos = [foto(1), foto(2, 1080, 1920), foto(3), foto(4), foto(5), foto(6, 2400, 1600, true), foto(7)];
  const analisis = revisarAnalisis(
    [
      nota(1, "sala", 5, 5, 4, 5),
      nota(2, "piscina", 4, 4, 4, 4),
      nota(3, "cocina", 2, 3, 3, 3),
      nota(4, "fachada", 4, 4, 3, 4),
      nota(5, "otro", 1, 1, 1, 1),
      nota(6, "bano", 2, 2, 2, 2),
      nota(7, "dormitorio", 3, 3, 3, 3, true),
    ],
    fotos,
  );
  const r = resumirFotos(analisis, "casa");

  it("ordena de mejor a peor y saca el promedio", () => {
    expect(r.fotos[0].id).toBe("F1");
    expect(r.fotos.at(-1)?.id).toBe("F5");
    expect(r.promedio).toBe(Math.round(analisis.reduce((s, f) => s + f.puntaje, 0) / analisis.length));
  });

  it("feed: la mejor en un espacio de portada; historia: prefiere la vertical", () => {
    expect(r.portadaFeed?.id).toBe("F1");
    expect(r.portadaHistoria?.id).toBe("F2");
  });

  it("a mejorar: luz o nitidez bajas o marcadas, nunca las ya mejoradas, de peor a mejor", () => {
    expect(r.aMejorar.map((f) => f.id)).toEqual(["F5", "F3", "F7"]);
  });

  it("faltan los espacios clave que no aparecen", () => {
    expect(r.faltan).toEqual([]);
    expect(espaciosQueFaltan([{ espacio: "sala" }], "casa")).toEqual([
      "Fachada",
      "Cocina",
      "Dormitorio principal",
      "Baño principal",
      "Vista o exteriores (jardín, terraza, piscina)",
    ]);
    expect(espaciosQueFaltan([{ espacio: "terreno" }], "lote")).toEqual(["La vista o el entorno"]);
  });

  it("carrusel: portada primero, luego lo social, cocina, lo privado y el afuera; sin las muy flojas", () => {
    expect(r.carrusel.map((f) => f.espacio)).toEqual(["sala", "cocina", "piscina", "dormitorio", "fachada"]);
    expect(r.carrusel.some((f) => f.id === "F5")).toBe(false);
  });

  it("el carrusel no pasa de 10 ni repite más de 2 del mismo espacio", () => {
    const muchas = Array.from({ length: 14 }, (_, i) => foto(i + 1));
    const a = revisarAnalisis(muchas.map((f, i) => nota(i + 1, i < 5 ? "sala" : ["cocina", "terraza", "jardin", "piscina", "dormitorio", "bano", "vista", "comedor", "cochera"][i - 5], 4)), muchas);
    const c = resumirFotos(a, "casa").carrusel;
    expect(c.length).toBe(MAX_CARRUSEL);
    expect(c.filter((f) => f.espacio === "sala").length).toBeLessThanOrEqual(3); // la portada más 2
  });

  it("sin fotos buenas no hay portada", () => {
    const flojas = revisarAnalisis([nota(1, "sala", 1), nota(2, "fachada", 2)], [foto(1), foto(2)]);
    expect(resumirFotos(flojas, "casa").portadaFeed).toBeNull();
  });

  it("la demo arma notas válidas para cada foto, sin IA", () => {
    const d = revisarAnalisis(analisisDemo(fotos), fotos);
    expect(d).toHaveLength(fotos.length);
    expect(resumirFotos(d, "casa").portadaFeed).not.toBeNull();
  });

  it("lo guardado en el navegador vale solo para fotos que la casa tiene hoy, con su tamaño medido", () => {
    const g = fotosGuardadas(
      {
        fecha: "2026-11-18T10:00:00Z",
        comentario: "Buena galería",
        analisis: [
          { ...analisis[1], url: fotos[1].url },
          { ...analisis[0], url: "https://malo.example/x.jpg" },
        ],
      },
      fotos.map((f) => ({ ...f, ancho: null, alto: null })),
    );
    expect(g?.analisis.map((f) => [f.url, f.ancho, f.alto, f.espacio])).toEqual([[fotos[1].url, 1080, 1920, "piscina"]]);
    expect(fotosGuardadas({ fecha: "x", analisis: [] }, fotos)).toBeNull();
  });
});

describe("Tamaño y tipo de la imagen por sus bytes", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  const jpeg = (w: number, h: number) =>
    new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46, // APP0 (largo 6)
      0xff, 0xdb, 0x00, 0x04, 0x00, 0x00, // DQT (largo 4)
      0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  const webpVp8x = (w: number, h: number) => {
    const b = new Uint8Array(32);
    b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
    b[24] = (w - 1) & 0xff;
    b[25] = ((w - 1) >> 8) & 0xff;
    b[27] = (h - 1) & 0xff;
    b[28] = ((h - 1) >> 8) & 0xff;
    return b;
  };

  it("PNG, JPEG y WebP", () => {
    expect(dimensionesImagen(png(1080, 1350))).toEqual({ ancho: 1080, alto: 1350 });
    expect(dimensionesImagen(jpeg(2400, 1600))).toEqual({ ancho: 2400, alto: 1600 });
    expect(dimensionesImagen(webpVp8x(1200, 1800))).toEqual({ ancho: 1200, alto: 1800 });
    expect(tipoImagen(jpeg(1, 1))).toBe("image/jpeg");
    expect(tipoImagen(png(1, 1))).toBe("image/png");
    expect(tipoImagen(webpVp8x(1, 1))).toBe("image/webp");
  });

  it("lo que no es imagen no se acepta", () => {
    expect(tipoImagen(new Uint8Array(Buffer.from("<html>hola</html>")))).toBeNull();
    expect(dimensionesImagen(new Uint8Array(Buffer.from("GIF89a....")))).toBeNull();
    expect(dimensionesImagen(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
