import { describe, expect, it } from "vitest";
import {
  accionesDueno,
  confianzaDueno,
  embudoDuenos,
  enlaceParaDueno,
  etapaElegida,
  filtrarConocidos,
  haceCuanto,
  mensajeParaDueno,
} from "@/lib/panel/duenos";
import {
  accionHero,
  avanceBusqueda,
  duenosDeLaUltima,
  encabezadoHero,
  pasosHero,
  sumarPaso,
  textoProximaBusqueda,
  textoUltimaBusqueda,
  type EntradaHero,
} from "@/lib/panel/extension-hero";
import type { EstadoExtension } from "@/lib/panel/extension-instalar";

const DIA = 86_400_000;
const ahora = Date.parse("2026-11-18T15:00:00Z");

describe("embudo de dueños", () => {
  it("cuenta los que están y los que llegaron a cada etapa, con la conversión desde la anterior", () => {
    const e = embudoDuenos(["nuevo", "nuevo", "nuevo", "contactado", "contactado", "respondio", "visitada", "captado", "publicada", "raro"]);
    expect(e.map((p) => p.ahora)).toEqual([3, 2, 1, 1, 1, 1]);
    expect(e.map((p) => p.llegaron)).toEqual([9, 6, 4, 3, 2, 1]);
    expect(e.map((p) => p.conversion)).toEqual([null, 67, 67, 75, 67, 50]);
  });

  it("sin dueños no divide entre cero", () => {
    expect(embudoDuenos([]).every((p) => p.ahora === 0 && p.conversion === null)).toBe(true);
    expect(embudoDuenos(["publicada"]).map((p) => p.conversion)).toEqual([null, 100, 100, 100, 100, 100]);
  });

  it("abre la etapa pedida si existe; si no, la primera con dueños", () => {
    const e = embudoDuenos(["respondio"]);
    expect(etapaElegida("captado", e)).toBe("captado");
    expect(etapaElegida("<script>", e)).toBe("respondio");
    expect(etapaElegida(undefined, embudoDuenos([]))).toBe("nuevo");
  });
});

describe("tarjeta de un dueño", () => {
  const base = { url: "https://www.encuentra24.com/x", telefono: "+50688881234", propiedadId: null, mensaje: "Hola" };

  it("Encontrados: escribirle por WhatsApp (lo manda el corredor) y al lado «Ya le escribí»", () => {
    const a = accionesDueno("nuevo", base);
    expect(a.principal).toEqual({ tipo: "whatsapp", texto: "Escribirle por WhatsApp", href: "https://wa.me/50688881234?text=Hola" });
    expect(a.segunda).toEqual({ tipo: "etapa", texto: "Ya le escribí", estado: "contactado" });
  });

  it("sin teléfono, se le escribe desde el anuncio", () => {
    expect(accionesDueno("nuevo", { ...base, telefono: null }).principal).toEqual({ tipo: "anuncio", texto: "Escribirle desde el anuncio", href: base.url });
  });

  it("una acción principal por etapa", () => {
    expect(accionesDueno("contactado", base).principal).toMatchObject({ tipo: "etapa", estado: "respondio" });
    expect(accionesDueno("contactado", base).segunda).toMatchObject({ tipo: "whatsapp", texto: "Escribirle otra vez" });
    expect(accionesDueno("respondio", base).principal).toMatchObject({ estado: "visitada" });
    expect(accionesDueno("visitada", base).principal).toMatchObject({ estado: "captado" });
    expect(accionesDueno("captado", base).principal).toEqual({ tipo: "mis_casas", texto: "Pasarla a Mis casas" });
    expect(accionesDueno("publicada", { ...base, propiedadId: "p1" }).principal).toEqual({ tipo: "ver_casa", texto: "Ver en Mis casas", propiedadId: "p1" });
    expect(accionesDueno("publicada", base).principal).toBeNull();
  });

  it("el enlace de WhatsApp: número de Costa Rica sin 506, o nada si no sirve", () => {
    expect(enlaceParaDueno("8888-1234", "a b")).toBe("https://wa.me/50688881234?text=a%20b");
    expect(enlaceParaDueno("123", "x")).toBeNull();
    expect(enlaceParaDueno(null, "x")).toBeNull();
  });

  it("el primer mensaje es amable, sin cifras, y ofrece no volver a escribir", () => {
    const m = mensajeParaDueno({ nombre: "Ana María Mora", titulo: "Casa en Escazú", zona: "Escazú", corredor: "Deluxe Properties" });
    expect(m).toMatch(/^Hola, Ana, buenas\./);
    expect(m).toContain("Deluxe Properties");
    expect(m).toContain("«Casa en Escazú» en Escazú en Encuentra24");
    expect(m).toMatch(/no le vuelvo a escribir/);
    expect(m.replace("Encuentra24", "")).not.toMatch(/\d/);
    expect(mensajeParaDueno({})).toMatch(/^Hola, buenas\. Soy corredora/);
  });

  it("qué tan seguro es que sea el dueño y hace cuánto", () => {
    expect(confianzaDueno(86).tono).toBe("verde");
    expect(confianzaDueno(70).tono).toBe("azul");
    expect(confianzaDueno(40).texto).toMatch(/Quizá/);
    expect(confianzaDueno(null).texto).toBe("Sin revisar");
    expect(haceCuanto(new Date(ahora - 2 * 3600_000).toISOString(), ahora)).toBe("hoy");
    expect(haceCuanto(new Date(ahora - DIA).toISOString(), ahora)).toBe("ayer");
    expect(haceCuanto(new Date(ahora - 5 * DIA).toISOString(), ahora)).toBe("hace 5 días");
    expect(haceCuanto(new Date(ahora - 21 * DIA).toISOString(), ahora)).toBe("hace 3 semanas");
    expect(haceCuanto("no es fecha", ahora)).toBeNull();
  });
});

describe("corredores conocidos: buscar", () => {
  const lista = [
    { nombre: "María Solís", telefono: "+50688881234", empresa: "RE/MAX" },
    { nombre: "Óscar Quesada", telefono: null, empresa: "Keller Williams" },
    { nombre: null, telefono: "+50670001111", empresa: null },
  ];
  it("por nombre o empresa sin tildes ni mayúsculas, y por dígitos del teléfono", () => {
    expect(filtrarConocidos(lista, "maria")).toHaveLength(1);
    expect(filtrarConocidos(lista, "OSCAR")).toEqual([lista[1]]);
    expect(filtrarConocidos(lista, "keller")).toEqual([lista[1]]);
    expect(filtrarConocidos(lista, "7000-1111")).toEqual([lista[2]]);
    expect(filtrarConocidos(lista, "  ")).toEqual(lista);
    expect(filtrarConocidos(lista, "zzz")).toEqual([]);
  });
});

describe("tarjeta de la extensión: lo que sigue", () => {
  const conectada: EstadoExtension = { tipo: "conectada", corredor: "Deluxe", ultimaBusquedaDias: 2 };
  const e = (estado: EstadoExtension, o: Partial<EntradaHero> = {}): EntradaHero => ({
    demo: false,
    lugar: "aqui",
    estado,
    conectando: false,
    enCurso: false,
    version: "1.5.2",
    vista: true,
    ...o,
  });

  it("una sola acción según cómo está", () => {
    expect(accionHero(e({ tipo: "no_instalada" }))).toEqual({ tipo: "instalar", texto: "Instalar la extensión" });
    expect(accionHero(e({ tipo: "nueva_version", version: "1.5.2", conectada: true }))).toEqual({ tipo: "actualizar", texto: "Actualizar a 1.5.2" });
    expect(accionHero(e({ tipo: "vieja" }, { vista: false }))).toMatchObject({ tipo: "actualizar" });
    expect(accionHero(e({ tipo: "sin_conectar" }))).toEqual({ tipo: "conectar", texto: "Conectar" });
    expect(accionHero(e(conectada))).toEqual({ tipo: "buscar", texto: "Buscar dueños ahora" });
    // Conectada en el servidor, pero esta carga no ve la extensión: no le puede dar órdenes.
    expect(accionHero(e(conectada, { vista: false }))).toEqual({ tipo: "abrir_e24", texto: "Abrir Encuentra24" });
  });

  it("demo, teléfono, buscando o conectando", () => {
    expect(accionHero(e({ tipo: "no_instalada" }, { demo: true })).tipo).toBe("demo");
    expect(accionHero(e({ tipo: "sin_conectar_servidor" }, { lugar: "movil" })).tipo).toBe("en_computadora");
    expect(accionHero(e(conectada, { lugar: "movil" })).tipo).toBe("ninguna");
    expect(accionHero(e(conectada, { enCurso: true })).tipo).toBe("ninguna");
    expect(accionHero(e({ tipo: "sin_conectar" }, { conectando: true })).tipo).toBe("ninguna");
    expect(accionHero(e({ tipo: "buscando" })).tipo).toBe("ninguna");
  });

  it("los cuatro puntos: instalada, al día, conectada y la semanal", () => {
    const marcas = (estado: EstadoExtension, semanal: boolean | null, vista = true) => pasosHero({ estado, version: "1.5.2", semanal, vista }).map((p) => p.marca);
    expect(marcas(conectada, true)).toEqual(["ok", "ok", "ok", "ok"]);
    expect(marcas(conectada, false)).toEqual(["ok", "ok", "ok", "falta"]);
    expect(marcas(conectada, null, false)).toEqual(["no_se", "no_se", "ok", "no_se"]);
    expect(marcas({ tipo: "nueva_version", version: "1.5.2", conectada: true }, null)).toEqual(["ok", "falta", "ok", "no_se"]);
    expect(marcas({ tipo: "sin_conectar" }, true)).toEqual(["ok", "ok", "falta", "no_se"]);
    expect(marcas({ tipo: "no_instalada" }, null)).toEqual(["falta", "falta", "falta", "no_se"]);
    expect(pasosHero({ estado: { tipo: "vieja" }, version: "1.5.2", semanal: null, vista: false })[1].texto).toBe("Falta la 1.5.2");
    // Mientras busca la extensión no dice "Al día" (antes salía un instante y después cambiaba a "Falta").
    expect(pasosHero({ estado: { tipo: "buscando" }, version: "1.7.1", semanal: null, vista: false })[1]).toMatchObject({ texto: "Revisando la versión", marca: "no_se" });
  });

  it("el encabezado dice el estado en una palabra", () => {
    const base = { demo: false, conectando: false, enCurso: false, lugar: "aqui" as const, asistente: "Ana", version: "1.5.2" };
    expect(encabezadoHero({ ...base, estado: conectada })).toMatchObject({ palabra: "Lista", tono: "verde", titulo: "Ana está lista para buscar dueños" });
    expect(encabezadoHero({ ...base, estado: conectada, enCurso: true }).palabra).toBe("Trabajando");
    expect(encabezadoHero({ ...base, estado: { tipo: "nueva_version", version: "1.5.2", conectada: true } }).tono).toBe("ambar");
    expect(encabezadoHero({ ...base, estado: { tipo: "no_instalada" }, demo: true }).palabra).toBe("Demo");
  });

  it("última y próxima búsqueda", () => {
    const hace = (d: number) => new Date(ahora - d * DIA).toISOString();
    expect(textoUltimaBusqueda(null, ahora)).toBe("Todavía no ha buscado");
    expect(textoUltimaBusqueda(hace(0.2), ahora)).toBe("Hoy");
    expect(textoUltimaBusqueda(hace(3), ahora)).toBe("Hace 3 días");
    const prox = (ultima: string | null, o: { conectada?: boolean; semanal?: boolean | null } = {}) =>
      textoProximaBusqueda({ ultima, ahora, conectada: o.conectada ?? true, semanal: o.semanal ?? true });
    expect(prox(hace(3))).toBe("En 4 días, con Chrome abierto");
    expect(prox(hace(6))).toBe("Mañana, con Chrome abierto");
    expect(prox(hace(9))).toBe("Hoy, con Chrome abierto");
    expect(prox(null)).toBe("Hoy, con Chrome abierto");
    expect(prox(hace(3), { semanal: false })).toMatch(/^Apagada/);
    expect(prox(hace(3), { conectada: false })).toBe("Cuando la conectes");
  });

  it("los dueños de la última búsqueda: los guardados en las 12 horas antes de terminar", () => {
    const fin = "2026-11-15T14:00:00Z";
    const t = (h: number) => new Date(Date.parse(fin) + h * 3600_000).toISOString();
    expect(duenosDeLaUltima([t(-0.5), t(-2), t(-13), t(5)], fin)).toBe(2);
    expect(duenosDeLaUltima([t(-1)], null)).toBe(0);
  });
});

describe("búsqueda en vivo", () => {
  it("el anillo: avance y texto, acotado; sin total no hay número", () => {
    expect(avanceBusqueda({ pagina: 3, total: 12 })).toEqual({ pct: 25, texto: "3/12" });
    expect(avanceBusqueda({ pagina: 40, total: 12 })).toEqual({ pct: 100, texto: "12/12" });
    expect(avanceBusqueda({ pagina: 0, total: 0 })).toBeNull();
  });

  it("la línea de pasos: solo cambios, lo nuevo arriba, hasta 5 y en una línea", () => {
    let p = sumarPaso([], "Abriendo Escazú", 1);
    p = sumarPaso(p, "Abriendo Escazú", 2);
    expect(p).toHaveLength(1);
    p = sumarPaso(p, "Leí 18\nanuncios", 3);
    expect(p[0]).toEqual({ texto: "Leí 18 anuncios", en: 3 });
    p = sumarPaso(p, "", 4);
    expect(p).toHaveLength(2);
    for (let i = 0; i < 10; i++) p = sumarPaso(p, `paso ${i}`, 10 + i);
    expect(p).toHaveLength(5);
    expect(p[0].texto).toBe("paso 9");
    expect(sumarPaso([], "x".repeat(500), 1)[0].texto).toHaveLength(120);
  });
});
