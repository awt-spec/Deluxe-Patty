import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { anchosColumnas, cifrasClave, columnasNumericas, contarPaginas, esCifra, MAX_FOTOS_GALERIA, reticulaGaleria, tamanoTitulo } from "@/lib/fichas/diseno";
import { cifrasFicha, parrafosDescripcion, precioFicha } from "@/lib/fichas/ficha";
import { fotosDeFicha, generarFicha } from "@/lib/fichas/generar";
import { MARCA_DELUXE, marcaNeutra } from "@/lib/fichas/marca";
import { fichaDePropiedad } from "@/lib/fichas/comando";
import { generarPdfPatty } from "@/lib/panel/pdf-patty";
import { bloques } from "@/lib/panel/markdown";
import type { PropiedadConFotos } from "@/lib/datos/tipos";

const casa = (cambios: Partial<PropiedadConFotos> = {}): PropiedadConFotos => ({
  id: "p1", codigo: "DLX-1", titulo: "Casa en condominio en Escazú", tipo: "casa", operacion: "venta",
  precio: 450000, moneda: "USD", provincia: "San José", canton: "Escazú", distrito: "San Rafael", zona: null,
  habitaciones: 3, banos: 2.5, m2_construccion: 320, m2_terreno: null, descripcion: "Casa de prueba.",
  amenidades: ["piscina", "terraza"], url_e24: null, estado: "activa", fotos: [], ...cambios,
});

describe("cifras clave del documento de Patty", () => {
  it("reconoce cifras escritas, no frases", () => {
    for (const v of ["3", "$450.000", "₡1.200.000", "12 %", "320 m²", "45 min", "**2**"]) expect(esCifra(v), v).toBe(true);
    for (const v of ["tres", "Escazú", "$450.000 si baja el precio", "", "2 casas en Escazú y 1 en Santa Ana"]) expect(esCifra(v), v).toBe(false);
  });

  it("toma la lista corta de 'Etiqueta: cifra' que va justo después del resumen", () => {
    const b = bloques("Resumen de la semana.\n\n- Casas comparadas: 3\n- Precio más bajo: **$450.000**\n- Visitas: 2\n\n## Detalle\n\nTexto.");
    expect(cifrasClave(b)).toEqual({
      indice: 1,
      cifras: [
        { etiqueta: "Casas comparadas", valor: "3" },
        { etiqueta: "Precio más bajo", valor: "$450.000" },
        { etiqueta: "Visitas", valor: "2" },
      ],
    });
  });

  it("toma una tabla de 2 columnas y hasta 4 filas con cifras al comienzo", () => {
    const b = bloques("| Dato | Valor |\n|---|---|\n| Clientes | 12 |\n| Visitas | 5 |");
    expect(cifrasClave(b)?.cifras).toEqual([
      { etiqueta: "Clientes", valor: "12" },
      { etiqueta: "Visitas", valor: "5" },
    ]);
  });

  it("es conservadora: un punto que no encaja, una lista numerada, larga o más abajo no se vuelven tarjetas", () => {
    expect(cifrasClave(bloques("Resumen.\n\n- Casas: 3\n- Zona: Escazú"))).toBeNull();
    expect(cifrasClave(bloques("Resumen.\n\n1. Casas: 3\n2. Visitas: 2"))).toBeNull();
    expect(cifrasClave(bloques("Resumen.\n\n- A: 1\n- B: 2\n- C: 3\n- D: 4\n- E: 5"))).toBeNull();
    expect(cifrasClave(bloques("Resumen.\n\n- Casas: 3"))).toBeNull();
    expect(cifrasClave(bloques("Resumen.\n\nOtro párrafo.\n\n- Casas: 3\n- Visitas: 2"))).toBeNull();
    expect(cifrasClave(bloques("| A | B | C |\n|---|---|---|\n| x | 1 | 2 |\n| y | 3 | 4 |"))).toBeNull();
  });
});

describe("tablas del PDF", () => {
  it("da más ancho a la columna con más texto y los anchos suman 100", () => {
    const anchos = anchosColumnas(
      ["Casa", "Zona", "Hab.", "Precio"],
      [
        ["Casa con jardín amplio y vista al valle central", "Bello Horizonte", "4", "$615.000"],
        ["Townhouse", "Guachipelín", "3", "$498.000"],
      ],
    );
    expect(anchos.reduce((s, a) => s + a, 0)).toBeCloseTo(100, 5);
    expect(anchos[0]).toBeGreaterThan(anchos[1]);
    expect(anchos[1]).toBeGreaterThan(anchos[2]);
    expect(Math.min(...anchos)).toBeGreaterThanOrEqual(8);
  });

  it("columnas iguales reparten por igual y una sola columna ocupa todo", () => {
    expect(anchosColumnas(["A", "B"], [["xx", "yy"]])).toEqual([50, 50]);
    expect(anchosColumnas(["Solo"], [["uno"]])).toEqual([100]);
    expect(anchosColumnas([], [])).toEqual([]);
  });

  it("alinea a la derecha solo las columnas de cifras", () => {
    expect(columnasNumericas([["Escazú", "3", "$450.000", "—"], ["Belén", "4", "$615.000", "$1"]], 4)).toEqual([false, true, true, true]);
    expect(columnasNumericas([["", ""]], 2)).toEqual([false, false]);
  });
});

describe("galería de la ficha", () => {
  it("las filas suman exactamente las fotos y su alto suma 1", () => {
    for (let n = 1; n <= MAX_FOTOS_GALERIA; n++) {
      const filas = reticulaGaleria(n);
      expect(filas.reduce((s, f) => s + f.columnas, 0), `n=${n}`).toBe(n);
      expect(filas.reduce((s, f) => s + f.alto, 0)).toBeCloseTo(1, 5);
    }
    expect(reticulaGaleria(0)).toEqual([]);
    expect(reticulaGaleria(20).reduce((s, f) => s + f.columnas, 0)).toBe(MAX_FOTOS_GALERIA);
    expect(reticulaGaleria(3)).toEqual([{ columnas: 1, alto: 0.58 }, { columnas: 2, alto: 0.42 }]);
  });

  it("usa la mejorada si existe, en orden, nunca una variante y a lo sumo 7 fotos", () => {
    const fotos = Array.from({ length: 20 }, (_, i) => ({
      url: `https://x/f${i}.jpg`,
      orden: 20 - i,
      ...(i === 19 ? { mejorada_url: "https://x/mejor.jpg", variantes: [{ tipo: "amueblada" as const, url: "https://x/v.jpg", detalle: "", creada_at: "" }] } : {}),
    }));
    const elegidas = fotosDeFicha(casa({ fotos }));
    expect(elegidas).toHaveLength(7);
    expect(elegidas[0]).toEqual({ src: "https://x/mejor.jpg", ilustrativa: false });
    expect(elegidas[1].src).toBe("https://x/f18.jpg");
    expect(elegidas.some((f) => f.src.includes("/v.jpg"))).toBe(false);
  });
});

describe("datos de la ficha", () => {
  it("solo muestra las cifras que la casa tiene (sin N/D de relleno)", () => {
    expect(cifrasFicha(casa()).map((c) => c.etiqueta)).toEqual(["Habitaciones", "Baños", "Construcción"]);
    expect(cifrasFicha(casa({ habitaciones: null, banos: null, m2_construccion: null, m2_terreno: 1200 }))).toEqual([
      { valor: "1200 m²", etiqueta: "Terreno", icono: "terreno" },
    ]);
  });

  it("precio en dólares, colones y alquiler al mes; sin precio no hay cifra", () => {
    expect(precioFicha(casa())).toBe("$450.000");
    expect(precioFicha(casa({ moneda: "CRC", precio: 245000000 }))).toBe("CRC 245.000.000");
    expect(precioFicha(casa({ operacion: "alquiler", precio: 3200 }))).toBe("$3.200 al mes");
    expect(precioFicha(casa({ precio: null }))).toBeNull();
  });

  it("parte la descripción en párrafos y destaca el primero", () => {
    expect(parrafosDescripcion(null)).toEqual([]);
    expect(parrafosDescripcion("  ")).toEqual([]);
    expect(parrafosDescripcion("Uno.\n\nDos.\nTres.")).toEqual(["Uno.", "Dos.", "Tres."]);
    const largo = `Primera frase de la casa con suficiente largo para ser la entrada. ${"Más texto. ".repeat(30)}`;
    expect(parrafosDescripcion(largo)[0]).toBe("Primera frase de la casa con suficiente largo para ser la entrada.");
  });

  it("el título largo achica la letra de la portada", () => {
    expect(tamanoTitulo("Casa")).toBeGreaterThan(tamanoTitulo("x".repeat(80)));
    expect(tamanoTitulo("x".repeat(200))).toBeGreaterThanOrEqual(18);
  });
});

describe("PDF armados (casos borde)", () => {
  it("con 0, 1 y 20 fotos y textos largos no revienta y tiene sus páginas", async () => {
    const foto = await QRCode.toDataURL("foto de prueba", { width: 200 });
    const fotos = (n: number) => Array.from({ length: n }, (_, i) => ({ url: foto, orden: i }));
    const sinFotos = await generarFicha({ marca: MARCA_DELUXE, whatsappAsistente: null, propiedad: casa({ descripcion: null, precio: null, amenidades: [] }) });
    const una = await generarFicha({
      marca: marcaNeutra("Inmobiliaria Ejemplo"),
      whatsappAsistente: "+50660000000",
      propiedad: casa({ fotos: fotos(1), titulo: "Residencia ".repeat(20), operacion: "alquiler", moneda: "CRC", precio: 950000 }),
    });
    const veinte = await generarFicha({
      marca: MARCA_DELUXE,
      whatsappAsistente: "+50660000000",
      propiedad: casa({ fotos: fotos(20), descripcion: "Texto largo de la casa. ".repeat(220), amenidades: Array.from({ length: 30 }, (_, i) => `detalle ${i}`) }),
    });
    expect(contarPaginas(sinFotos)).toBe(3); // portada, datos y contacto
    expect(contarPaginas(una)).toBe(3);
    expect(contarPaginas(veinte)).toBeGreaterThanOrEqual(4); // + galería (la descripción larga sigue en otra página)
    expect(contarPaginas(veinte)).toBeLessThanOrEqual(6);
  }, 60_000);

  it("sin marca, el comando arma la ficha neutra con el nombre del corredor", async () => {
    const { corredorBase, repoEnMemoria } = await import("./dobles");
    const corredor = { ...corredorBase(), marca: null };
    const db = repoEnMemoria(corredor);
    db.propiedades.push(casa());
    const r = await fichaDePropiedad({ repo: db.repo } as never, corredor, "DLX-1");
    expect(r).toMatchObject({ tipo: "pdf", nombreArchivo: "Ficha DLX-1 · Deluxe Properties.pdf" });
    expect(db.subidas[0].datos.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);

  it("el documento de Patty: corto con portada ligera, largo con portada completa", async () => {
    const base = { titulo: "Informe", diagramas: [], marca: MARCA_DELUXE, corredor: "Deluxe Properties", fecha: "13 de noviembre de 2026", asistente: "Patty" };
    const corto = await generarPdfPatty({ ...base, texto: "Resumen.\n\n- Casas: 3\n- Visitas: 2\n\n| Casa | Precio |\n|---|---:|\n| Escazú | $1 |\n\nVer [la ficha](/panel/propiedades/x)." });
    expect(contarPaginas(corto)).toBe(1);
    const filas = Array.from({ length: 120 }, (_, i) => `| Cliente ${i} | Casa en Escazú | $${i}.000 |`).join("\n");
    const largo = await generarPdfPatty({ ...base, marca: null, texto: `Resumen.\n\n## Visitas\n\n| Cliente | Casa | Oferta |\n|---|---|---:|\n${filas}` });
    // Portada completa + al menos 3 páginas de tabla.
    expect(contarPaginas(largo)).toBeGreaterThanOrEqual(4);
  }, 60_000);
});
