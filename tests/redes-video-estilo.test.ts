import { describe, expect, it } from "vitest";
import { cifrasInventadas } from "../lib/redes/cifras";
import {
  CURVAS,
  ESTILOS_LISTA,
  ESTILOS_VIDEO,
  SCRIM_ACENTO,
  SCRIM_TEXTO,
  acentoSobreFoto,
  cifraEn,
  coloresDelVideo,
  COLORES_NEUTROS,
  contraste,
  dentroDeZona,
  duracionTransicion,
  encuadre,
  estiloPorDefecto,
  hexARgb,
  marcoFoto,
  movimientoFoto,
  peorFondo,
  textoEscena,
  textoSobre,
  textosDelVideo,
  tiempoTexto,
  transicionDe,
  tratamientoFoto,
  zonaSegura,
} from "../lib/redes/estilo-video";
import { cifrasDeCasa, datosDelVideo, guionPorDefecto } from "../lib/redes/video";

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
const datos = datosDelVideo(casa as never, "+506 8888 7777", "Deluxe Properties");
const fotos = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://x/f${i + 1}.jpg`, ilustrativa: i === 1 }));

describe("estilos del video", () => {
  it("hay tres estilos; con marca sale Elegante y sin marca Moderno con colores neutros", () => {
    expect(ESTILOS_LISTA).toEqual(["elegante", "moderno", "limpio"]);
    expect(estiloPorDefecto(true)).toBe("elegante");
    expect(estiloPorDefecto(false)).toBe("moderno");
    const deluxe = { principal: "#D4AF6A", soporte: "#B89968", profundo: "#1A1308", base: "#F5F0E8" };
    expect(coloresDelVideo(true, deluxe)).toBe(deluxe);
    expect(coloresDelVideo(false, { ...deluxe, principal: "#00A884" })).toBe(COLORES_NEUTROS);
    // Elegante es más lento y sobrio que Moderno; Limpio no lleva barra ni marca de agua.
    expect(ESTILOS_VIDEO.elegante.transicion).toBeGreaterThan(ESTILOS_VIDEO.moderno.transicion);
    expect(ESTILOS_VIDEO.limpio.barra || ESTILOS_VIDEO.limpio.marcaAgua).toBe(false);
  });

  it("las curvas van de 0 a 1 sin pasarse y no son lineales", () => {
    for (const c of Object.values(CURVAS)) {
      expect(c(0)).toBeCloseTo(0);
      expect(c(1)).toBeCloseTo(1);
      expect(c(-3)).toBeCloseTo(0);
      expect(c(9)).toBeCloseTo(1);
    }
    expect(CURVAS.entra(0.5)).toBeGreaterThan(0.5);
    expect(CURVAS.sale(0.5)).toBeLessThan(0.5);
  });
});

describe("tratamiento de las fotos", () => {
  it("elige por proporción: llena, paneo o completa sobre fondo desenfocado", () => {
    // Vertical 1080×1920.
    expect(tratamientoFoto(1600, 1066, 1080, 1920)).toBe("enmarcada"); // 3:2 horizontal
    expect(tratamientoFoto(1600, 1200, 1080, 1920)).toBe("enmarcada"); // 4:3 horizontal
    expect(tratamientoFoto(1200, 1600, 1080, 1920)).toBe("paneo"); // 3:4 vertical
    expect(tratamientoFoto(1080, 1920, 1080, 1920)).toBe("llenar");
    // La portada nunca se enmarca: lleva el título encima.
    expect(tratamientoFoto(1600, 1066, 1080, 1920, "portada")).toBe("paneo");
    // Cuadrado 1080×1080.
    expect(tratamientoFoto(1600, 1066, 1080, 1080)).toBe("paneo");
    expect(tratamientoFoto(1000, 1000, 1080, 1080)).toBe("llenar");
    expect(tratamientoFoto(600, 2000, 1080, 1080)).toBe("enmarcada");
  });

  it("el movimiento cambia de escena a escena y el paneo va hacia el lado que sobra", () => {
    const movs = [0, 1, 2, 3].map((i) => movimientoFoto(i, "llenar", 1080, 1920, 1080, 1920));
    expect(new Set(movs).size).toBe(4);
    expect(movimientoFoto(0, "paneo", 1600, 1066, 1080, 1080)).toMatch(/^paneo-/);
    expect(movimientoFoto(0, "paneo", 1000, 1600, 1080, 1080)).toMatch(/^(subir|bajar)$/);
  });

  it("la foto que llena el cuadro siempre lo cubre, de principio a fin", () => {
    for (const mov of ["acercar", "alejar", "paneo-izq", "paneo-der", "subir", "bajar"] as const)
      for (const a of [0, 0.3, 0.5, 0.9, 1]) {
        const r = encuadre(mov, a, 1600, 1066, 1080, 1920, 0.1);
        expect(r.x).toBeLessThanOrEqual(0.001);
        expect(r.y).toBeLessThanOrEqual(0.001);
        expect(r.x + r.w).toBeGreaterThanOrEqual(1079.999);
        expect(r.y + r.h).toBeGreaterThanOrEqual(1919.999);
      }
    const ini = encuadre("paneo-der", 0, 1600, 1066, 1080, 1920, 0.1);
    const fin = encuadre("paneo-der", 1, 1600, 1066, 1080, 1920, 0.1);
    expect(fin.x).toBeLessThan(ini.x);
  });

  it("la foto enmarcada se ve completa, sin deformarse y dentro de las zonas seguras", () => {
    for (const estilo of ESTILOS_LISTA) {
      const m = marcoFoto(1600, 1066, 1080, 1920, estilo);
      expect(m.w / m.h).toBeCloseTo(1600 / 1066, 3);
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.w).toBeLessThanOrEqual(1080);
      const z = zonaSegura(1080, 1920);
      expect(m.y).toBeGreaterThanOrEqual(z.arriba);
      expect(m.y + m.h).toBeLessThanOrEqual(1920 - z.abajo);
    }
  });
});

describe("zonas seguras", () => {
  it("en vertical deja libre ~14 % arriba y ~20 % abajo; en cuadrado, un margen parejo", () => {
    expect(zonaSegura(1080, 1920)).toMatchObject({ arriba: 269, abajo: 384 });
    const c = zonaSegura(1080, 1080);
    expect(c.arriba).toBe(c.abajo);
    expect(dentroDeZona({ x: 81, y: 269, w: 900, h: 1200 }, 1080, 1920)).toBe(true);
    expect(dentroDeZona({ x: 81, y: 200, w: 900, h: 100 }, 1080, 1920)).toBe(false);
    expect(dentroDeZona({ x: 81, y: 1500, w: 900, h: 100 }, 1080, 1920)).toBe(false);
  });
});

describe("transiciones y tiempos del texto", () => {
  it("la primera escena no tiene transición; datos y cierre entran con algo sobrio", () => {
    const e = guionPorDefecto(fotos(5), datos);
    expect(transicionDe("elegante", e, 0)).toBeNull();
    expect(transicionDe("elegante", e, e.length - 1)).toBe("fundido");
    expect(transicionDe("moderno", e, e.length - 2)).toBe("deslizar");
    // Las fotos varían.
    const fotosElegante = e.map((_, i) => transicionDe("elegante", e, i)).filter((t, i) => t && e[i].tipo === "foto");
    expect(new Set(fotosElegante).size).toBeGreaterThan(1);
    // Nunca dura más de un tercio de la escena más corta.
    expect(duracionTransicion("elegante", 2, 6)).toBeCloseTo(2 / 3);
  });

  it("el texto entra después de empezar, escalonado, y sale antes del corte (menos en la última escena)", () => {
    expect(tiempoTexto("elegante", 0, 4, 0).entrada).toBe(0);
    expect(tiempoTexto("elegante", 1.5, 4, 0).entrada).toBeGreaterThan(tiempoTexto("elegante", 1.5, 4, 3).entrada);
    expect(tiempoTexto("elegante", 2.5, 4, 0)).toEqual({ entrada: 1, salida: 0 });
    expect(tiempoTexto("elegante", 4, 4, 0).salida).toBe(1);
    expect(tiempoTexto("moderno", 4.3, 4, 0).salida).toBe(1);
    expect(tiempoTexto("elegante", 4, 4, 0, { ultima: true }).salida).toBe(0);
  });
});

describe("contraste sobre la foto", () => {
  it("el blanco cumple AA (4,5:1) sobre el peor fondo del degradado; el precio, 3:1 como texto grande", () => {
    expect(contraste([255, 255, 255], peorFondo(SCRIM_TEXTO))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hexARgb("#D4AF6A"), peorFondo(SCRIM_ACENTO))).toBeGreaterThanOrEqual(3);
  });

  it("un acento oscuro de marca se cambia por blanco sobre la foto; el texto sobre un bloque elige el que más se lea", () => {
    expect(acentoSobreFoto("#D4AF6A")).toBe("#D4AF6A");
    expect(acentoSobreFoto("#1B2A4A")).toBe("#FFFFFF");
    expect(textoSobre("#D4AF6A", "#1A1308")).toBe("#1A1308");
    expect(textoSobre("#1B2A4A", "#0B0B0B")).toBe("#FFFFFF");
  });
});

describe("datos y textos del video: nada fuera de la ficha", () => {
  it("las cifras salen solo de lo que trae la ficha", () => {
    expect(datos.cifras.map((c) => [c.icono, c.valor, c.unidad])).toEqual([
      ["cuartos", 4, ""],
      ["banos", 3.5, ""],
      ["construccion", 380, "m²"],
      ["terreno", 900, "m²"],
    ]);
    expect(cifrasDeCasa({ habitaciones: null, banos: 0, m2_construccion: null, m2_terreno: 450 })).toEqual([
      { icono: "terreno", valor: 450, decimales: 0, unidad: "m²", etiqueta: "Terreno" },
    ]);
    expect(datos.operacionCorta).toBe("En venta");
    expect(datos.lugar).toBe("Escazú");
  });

  it("las cifras cuentan hasta su valor exacto", () => {
    expect(cifraEn(4, 0, 0)).toBe("0");
    expect(cifraEn(4, 0, 1)).toBe("4");
    expect(cifraEn(3.5, 1, 1)).toBe("3,5");
    expect(Number(cifraEn(380, 0, 0.5))).toBeLessThanOrEqual(380);
  });

  it("un texto de escena con una cifra que no está en la ficha no llega al video", () => {
    const [portada, foto] = guionPorDefecto(fotos(2), datos);
    expect(textoEscena({ ...foto, texto: "A 5 minutos de la playa" }, datos)).toBe("");
    expect(textoEscena({ ...foto, texto: "Sala para 4 personas" }, datos)).toBe("Sala para 4 personas");
    expect(textoEscena({ ...portada, texto: "" }, datos)).toBe(casa.titulo);
    const escenas = guionPorDefecto(fotos(3), datos).map((e, i) => (i === 1 ? { ...e, texto: "Solo $990.000 y a 10 minutos" } : e));
    const todo = textosDelVideo(escenas, datos);
    expect(todo).toContain("$1.250.000");
    expect(todo).toContain("Imagen ilustrativa");
    for (const t of todo) expect(cifrasInventadas(t, new Set(datos.permitidas))).toEqual([]);
  });
});
