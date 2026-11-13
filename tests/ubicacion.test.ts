import { describe, expect, it } from "vitest";
import { horariosLibres, type ParametrosAgenda } from "../lib/agenda/disponibilidad";
import { ZONAS_CONOCIDAS, cerca, minutosEntre, normalizarZona, zonaConocida } from "../lib/agenda/zonas";
import { ordenarCasas } from "../lib/panel/orden-casas";
import { leerTemaUbicacion, resolverZona, temaUbicacion, zonaDeRespuesta, zonaParaGuardar, type EntradaUbicacion } from "../lib/sitio/ubicacion";

// Casos tomados de la exportación real del sitio de Deluxe (78 casas): cantón, distrito, ubicación y título tal
// como vienen. [código, entrada, zona esperada, ¿segura?]
const CASOS: [string, EntradaUbicacion, string | null, boolean][] = [
  ["DP-H829ZV", { canton: "Santa Ana", distrito: "Pozos", ubicacion: "Bosques de Lindora, frente a Forum 2", titulo: "Casa de lujo en Bosques de Lindora" }, "Lindora", true],
  ["DP-DXHXSD", { canton: null, distrito: null, ubicacion: "Bosques de Lindora", titulo: "Casa en alquiler en Bosques de Lindora" }, "Lindora", true],
  ["DP-9FQI61", { canton: "Santa Ana", distrito: "Pozos", ubicacion: "Parque Valle del Sol", titulo: "Residencia de lujo a estrenar en Parque Valle del Sol" }, "Lindora", true],
  ["DP-L2G8AF", { canton: "Santa Ana", distrito: "Pozos", ubicacion: "Residencial con campo de golf", titulo: "Espectacular casa moderna en residencial de golf" }, "Pozos", true],
  ["DP-8VDNDW", { canton: "Carrillo", distrito: "Sardinal", ubicacion: "Residencial Pacífico, Playas del Coco", titulo: "Residencia de lujo en Pacífico, Playas del Coco" }, "Playas del Coco", true],
  // Lindora queda dentro del distrito Pozos: no es contradicción, gana el barrio.
  ["DP-V0VPJW", { canton: "Santa Ana", distrito: "Pozos", ubicacion: "Pozos, Santa Ana", titulo: "SANTA ANA LINDORA CONDOMINIO MODERNO X SAINT JUDE" }, "Lindora", true],
  ["DP-B0Y0MY", { canton: "Santa Ana", distrito: "Pozos", ubicacion: "Pozos, Santa Ana", titulo: "VENTA SANTA ANA POZOS CONDOMINIO CASA CON PISCINA" }, "Pozos", true],
  ["DP-01IP03", { canton: "Bagaces", distrito: "Bagaces", ubicacion: "Bagaces, Bagaces", titulo: "VENTA BAGACES GUANACASTE QUINTA CON 100 M FRENTE INTERAMERICANA" }, "Bagaces", true],
  ["DP-IO1MLG", { canton: "Escazu", distrito: "San Antonio (Bello Horizonte)", ubicacion: "San Antonio (Bello Horizonte), Escazu", titulo: "ALQUILO ESCAZU BELLO HORIZONTE" }, "Bello Horizonte", true],
  ["DP-F32C9Q", { canton: "Escazu", distrito: "Escazu", ubicacion: "Escazu, Escazu", titulo: "Alquiler Apartamento Amueblado Distrito 4 Escazu" }, "Guachipelín", true],
  ["DP-BGOKEY", { canton: "Escazu", distrito: "San Rafael", ubicacion: "San Rafael, Escazu", titulo: "ESCAZU GUACHIPELIN AMPLIA CASA CON PISCINA EN RESIDENCIAL" }, "Guachipelín", true],
  ["DP-MLSSRC", { canton: "Escazu", distrito: "San Rafael", ubicacion: "San Rafael, Escazu", titulo: "VENTA SAN RAFAEL ESCAZU LOTE COMERCIAL POR POPS" }, "San Rafael de Escazú", true],
  ["DP-E970NO", { canton: "Escazu", distrito: "Escazu", ubicacion: "Escazu, Escazu", titulo: "Venta ESCAZU CASA CON PISCINA EN CONDOMINIO DE LUJO" }, "Escazú", true],
  ["DP-3TU3I4", { canton: "Escazu", distrito: "Escazu", ubicacion: "Escazu, Escazu", titulo: "VENTA ESCAZU JABONCILLOS EN CONDOMINIO CON PISCINA" }, "San Antonio de Escazú", true],
  ["DP-E8KN66", { canton: "San Jose", distrito: "Rohrmoser", ubicacion: "Rohrmoser, San Jose", titulo: "ALQUILER ROHRMOSER OFICINAS PREMIUM EN EDIFICIO TORRE CORDILLERA" }, "Rohrmoser", true],
  ["DP-GXNX7N", { canton: "San Jose", distrito: "Pavas", ubicacion: "Pavas, San Jose", titulo: "ALQUILER PAVAS ROHRMOSER OFICINAS RECEPCION Y SALA DE JUNTAS" }, "Rohrmoser", true],
  ["DP-3WT1BX", { canton: "Belen", distrito: "La Ribera", ubicacion: "La Ribera, Belen", titulo: "VENDO HEREDIA BELEN CASA EN CONDOMINIO DE LUJO 5 CUARTOS" }, "La Ribera", true],
  ["DP-U663CY", { canton: "Belen", distrito: "Belen", ubicacion: "Belen, Belen", titulo: "VENDO HEREDIA BELEN OPORTUNIDAD!" }, "Belén", true],
  ["DP-KTDNWJ", { canton: "La Guácima", distrito: "La Guácima", ubicacion: "Hacienda Los Reyes, Alajuela", titulo: "Residencia de Lujo Frente al Campo de Golf – Hacienda Los Reyes" }, "La Guácima", true],
  ["DP-LE0XMP", { canton: "Alajuela", distrito: "Guacima", ubicacion: "Guacima, Alajuela", titulo: "ALAJUELA GUACIMA LOS REYES 6 DR +Oficina" }, "La Guácima", true],
  ["DP-Q1VYAH", { canton: "Santa Cruz", distrito: "Santa Cruz", ubicacion: "Santa Cruz, Santa Cruz", titulo: "VENTA DE LOTE EN PLAYA NEGRA GUANACASTE GANGA $50 metro cerca al mar" }, "Playa Negra", true],
  ["DP-KFDHII", { canton: "Garabito", distrito: "Jaco", ubicacion: "Jaco, Garabito", titulo: "SE ALQUILA EN JACO POR NOCHE CASA DE LUJO" }, "Jacó", true],
  ["DP-UZNKTH", { canton: "Barva", distrito: "Barva", ubicacion: "Barva, Barva", titulo: "VENDO HEREDIA BARVA con piscina y mucho jardin" }, "Barva", true],
  ["DP-PJLA8Y", { canton: "Flores", distrito: "San Joaquin", ubicacion: "San Joaquin, Flores", titulo: "HEREDIA SAN JOAQUIN MAS DE 4000 METROS DE TERRENO" }, "San Joaquín de Flores", true],
  ["DP-09S537", { canton: "Santa Ana", distrito: "Piedades", ubicacion: "Piedades, Santa Ana", titulo: "VENDO PROPIEDAD CON VISTA PARA REMODELAR O DESARROLLAR" }, "Piedades", true],
  ["DP-J924SM", { canton: "Santa Ana", distrito: "Santa Ana Centro", ubicacion: "Santa Ana Centro, Santa Ana", titulo: "Venta Santa Ana - Lomas del Valle, apartamento" }, "Santa Ana", true],
  // Dudosas: Lindora está en Pozos, no en Santa Ana centro; "Playa Hermosa" hay en Garabito y en Guanacaste.
  ["DP-LHD6L0", { canton: "Santa Ana", distrito: "Santa Ana Centro", ubicacion: "Santa Ana Centro, Santa Ana", titulo: "VENTA LINDORA SANTA ANA CONDOMINIO LA ESCONDIDA DE 1 PLANTA" }, "Lindora", false],
  ["DP-9J6ZTE", { canton: "Garabito", distrito: "Jaco", ubicacion: "Jaco, Garabito", titulo: "VENTA PLAYA HERMOSA IMPRESIONANTE CASA MODERNA CON TODOS LOS MUEBLES" }, "Playa Hermosa de Garabito", false],
];

describe("resolverZona con las casas reales del sitio", () => {
  it.each(CASOS)("%s", (_codigo, entrada, zona, segura) => {
    const r = resolverZona(entrada);
    expect(r.zona).toBe(zona);
    expect(r.segura).toBe(segura);
    if (!segura) expect(r.opciones!.length).toBeGreaterThanOrEqual(2);
    // Toda zona que sale de aquí la conoce la agenda (para el traslado).
    expect(zonaConocida(r.zona)).toBe(true);
  });

  it("las dudosas traen las dos opciones, la conjetura primero", () => {
    expect(resolverZona(CASOS.find((c) => c[0] === "DP-LHD6L0")![1]).opciones).toEqual(["Lindora", "Santa Ana"]);
    expect(resolverZona(CASOS.find((c) => c[0] === "DP-9J6ZTE")![1]).opciones).toEqual(["Playa Hermosa de Garabito", "Playa Hermosa de Guanacaste"]);
  });

  it("contradicciones de verdad y zonas genéricas se preguntan", () => {
    // Lindora y Piedades son distritos distintos de Santa Ana.
    expect(resolverZona({ canton: "Santa Ana", distrito: "Piedades", titulo: "VENTA LINDORA CASA" })).toMatchObject({ segura: false, opciones: ["Lindora", "Piedades"] });
    // Un barrio de otro cantón en el título.
    expect(resolverZona({ canton: "Escazú", distrito: "Escazú", titulo: "CASA EN LINDORA" })).toMatchObject({ segura: false });
    // San José a secas: muy general; con un barrio en la descripción, el barrio.
    expect(resolverZona({ canton: "San José", titulo: "Oficina céntrica" })).toMatchObject({ zona: "San José", segura: false });
    expect(resolverZona({ canton: "San José", titulo: "Oficina", descripcion: "A dos cuadras del Parque de La Sabana." })).toEqual({ zona: "Sabana", segura: true });
    expect(resolverZona({ ubicacion: "Costa Rica", titulo: "Lote" })).toMatchObject({ segura: false });
    // Cantón que la agenda no conoce.
    expect(resolverZona({ canton: "Nicoya", titulo: "Finca" })).toMatchObject({ zona: "Nicoya", segura: false });
    expect(resolverZona({ titulo: "Casa" })).toMatchObject({ zona: null, segura: false });
  });

  it("todas las zonas nuevas están en la lista y se normalizan", () => {
    for (const z of ["Playas del Coco", "Jacó", "Playa Hermosa de Garabito", "Bagaces", "Playa Negra", "Barva", "San Joaquín de Flores", "La Guácima", "Rohrmoser", "Pavas"]) {
      expect(ZONAS_CONOCIDAS).toContain(z);
    }
    expect(normalizarZona("guacima")).toBe("La Guácima");
    expect(normalizarZona("JACO")).toBe("Jacó");
    expect(normalizarZona("Valle del Sol")).toBe("Lindora");
    expect(normalizarZona("Un lugar raro ")).toBe("Un lugar raro");
  });

  it("la casa hecha en el portal solo normaliza lo escrito (no adivina sobre lo que puso el corredor)", () => {
    expect(zonaParaGuardar({ zona: "escazu", titulo: "Casa en Lindora" })).toBe("Escazú");
    expect(zonaParaGuardar({ zona: null, canton: "Santa Ana", distrito: "Pozos", titulo: "Casa en Valle del Sol" })).toBe("Lindora");
    expect(zonaParaGuardar({ zona: null, canton: null, distrito: null })).toBeNull();
  });
});

describe("la pregunta al corredor", () => {
  it("se escribe y se lee de vuelta; la respuesta se vuelve una zona de la lista", () => {
    const tema = temaUbicacion("DP-LHD6L0", "VENTA LINDORA SANTA ANA CONDOMINIO LA ESCONDIDA", "Santa Ana Centro, Santa Ana", ["Lindora", "Santa Ana"]);
    expect(tema.length).toBeLessThanOrEqual(300);
    expect(leerTemaUbicacion(tema)).toEqual({ codigo: "DP-LHD6L0", titulo: "VENTA LINDORA SANTA ANA CONDOMINIO LA ESCONDIDA", sitio: "Santa Ana Centro, Santa Ana", opciones: ["Lindora", "Santa Ana"] });
    expect(leerTemaUbicacion("¿Aceptan mascotas?")).toBeNull();
    expect(zonaDeRespuesta("Queda en Lindora, cerca del Forum")).toBe("Lindora");
    expect(zonaDeRespuesta("piedades")).toBe("Piedades");
    expect(zonaDeRespuesta("")).toBeNull();
  });
});

describe("traslados lejos del Valle Central", () => {
  it("dan tiempos de carretera razonables", () => {
    const coco = minutosEntre("Escazú", "Playas del Coco")!;
    expect(coco).toBeGreaterThanOrEqual(210);
    expect(coco).toBeLessThanOrEqual(240);
    const jaco = minutosEntre("Escazú", "Jacó")!;
    expect(jaco).toBeGreaterThanOrEqual(80);
    expect(jaco).toBeLessThanOrEqual(110);
    // En la ciudad no cambia: Lindora y Santa Ana siguen cerca; Lindora y Piedades ya no son "la misma zona".
    expect(minutosEntre("Lindora", "Santa Ana")).toBeLessThanOrEqual(15);
    expect(cerca("Lindora", "Piedades")).toBe(true);
    expect(minutosEntre("Lindora", "Piedades")).toBeGreaterThan(10);
  });

  it("una casa en Playas del Coco igual recibe horarios (al final de cada franja) y tapa el resto del día", () => {
    const CR = "America/Costa_Rica";
    const base: ParametrosAgenda = {
      ahora: new Date("2026-10-19T12:00:00Z"), // lunes 6:00 a. m.
      zona: CR,
      horarios: [1, 2].flatMap((d) => [
        { dia_semana: d, hora_inicio: "08:00", hora_fin: "12:00" },
        { dia_semana: d, hora_inicio: "13:00", hora_fin: "17:00" },
      ]),
      bloqueos: [],
      citas: [],
      duracionMin: 60,
      margenMin: 30,
      anticipacionHoras: 0,
      horizonteDias: 1,
      zonaBase: "Lindora",
      zonaVisita: "Playas del Coco",
    };
    const libres = horariosLibres(base);
    const hora = (d: Date) => d.toISOString().slice(11, 16);
    expect(libres.length).toBeGreaterThan(0);
    // 11:00 y 16:00 hora de Costa Rica (17:00 y 22:00 UTC): la última hora de cada franja.
    expect([...new Set(libres.map((l) => hora(l.inicio)))]).toEqual(["17:00", "22:00"]);
    // Con una visita en Lindora a la 1:00 p. m. del lunes, ese día ya no da para ir y volver de Guanacaste.
    const conCita = horariosLibres({ ...base, citas: [{ inicio: new Date("2026-10-19T19:00:00Z"), fin: new Date("2026-10-19T20:00:00Z"), zona: "Lindora" }] });
    expect(conCita.filter((l) => l.inicio.toISOString().startsWith("2026-10-19"))).toEqual([]);
    expect(conCita.some((l) => l.inicio.toISOString().startsWith("2026-10-20"))).toBe(true);
  });
});

describe("Mis casas: las pausadas siempre al final", () => {
  const casas = [
    { id: "p1", estado: "inactiva", operacion: "venta", titulo: "Pausada venta" },
    { id: "a1", estado: "activa", operacion: "venta", titulo: "Activa venta" },
    { id: "v1", estado: "vendida", operacion: "venta", titulo: "Vendida" },
    { id: "r1", estado: "reservada", operacion: "alquiler", titulo: "Reservada alquiler" },
    { id: "p2", estado: "inactiva", operacion: "alquiler", titulo: "Pausada alquiler" },
    { id: "l1", estado: "alquilada", operacion: "alquiler", titulo: "Alquilada" },
  ];
  const ids = (r: { principales: { id: string }[]; pausadas: { id: string }[] }) => [r.principales.map((c) => c.id), r.pausadas.map((c) => c.id)];

  it("en oferta: activas y reservadas en su orden; pausadas aparte, al final", () => {
    expect(ids(ordenarCasas(casas, ""))).toEqual([["a1", "r1"], ["p1", "p2"]]);
  });
  it("por venta o alquiler, cada una con sus pausadas", () => {
    expect(ids(ordenarCasas(casas, "venta"))).toEqual([["a1"], ["p1"]]);
    expect(ids(ordenarCasas(casas, "alquiler"))).toEqual([["r1"], ["p2"]]);
  });
  it("«Otras»: vendidas y alquiladas, y las pausadas al final", () => {
    expect(ids(ordenarCasas(casas, "todas"))).toEqual([["v1", "l1"], ["p1", "p2"]]);
  });
  it("la búsqueda filtra los dos grupos", () => {
    expect(ids(ordenarCasas(casas, "", (c) => c.titulo.includes("alquiler")))).toEqual([["r1"], ["p2"]]);
  });
});
