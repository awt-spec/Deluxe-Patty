import { describe, expect, it } from "vitest";
import {
  agregarFotos,
  leerBloqueo,
  leerCorredoresConocidos,
  leerFranja,
  leerNumero,
  leerPropiedad,
  moverFoto,
  normalizarTelefono,
  rutaDePropiedad,
  rutaFotoOriginal,
  siguienteCodigo,
} from "../lib/panel/formularios";

const campos = (datos: Record<string, string>) => ({ get: (k: string) => datos[k] ?? null });

const casa = {
  codigo: "dlx 014",
  titulo: "Casa en Escazú",
  tipo: "casa",
  operacion: "venta",
  precio: "$450.000",
  habitaciones: "3",
  banos: "3,5",
  m2_construccion: "320",
  m2_terreno: "",
  amenidades: "piscina, seguridad 24/7\njardín",
  url_e24: "https://www.encuentra24.com/costa-rica-es/bienes-raices/123",
};

describe("formulario de propiedad", () => {
  it("lee precios y medidas como se escriben en Costa Rica", () => {
    expect(leerNumero("450.000")).toBe(450000);
    expect(leerNumero("USD 2,200")).toBe(2200);
    expect(leerNumero("₡ 95.000.000")).toBe(95000000);
    expect(leerNumero("2,5")).toBe(2.5);
    expect(leerNumero("")).toBeNull();
    expect(leerNumero("mucho")).toBe("invalido");
  });

  it("arma la propiedad con el código normalizado y las amenidades en lista", () => {
    const r = leerPropiedad(campos(casa));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toMatchObject({
      codigo: "DLX-014",
      precio: 450000,
      moneda: "USD",
      banos: 3.5,
      m2_terreno: null,
      amenidades: ["piscina", "seguridad 24/7", "jardín"],
      estado: "activa",
    });
  });

  it("rechaza lo que la base no aceptaría, con un motivo claro", () => {
    const motivo = (extra: Record<string, string>) => {
      const r = leerPropiedad(campos({ ...casa, ...extra }));
      return r.ok ? null : r.motivo;
    };
    expect(motivo({ codigo: "" })).toMatch(/código/);
    expect(motivo({ titulo: "" })).toMatch(/título/);
    expect(motivo({ tipo: "castillo" })).toMatch(/tipo/);
    expect(motivo({ precio: "abc" })).toMatch(/precio/);
    expect(motivo({ precio: "0" })).toMatch(/cero/);
    expect(motivo({ habitaciones: "2,5" })).toMatch(/habitaciones/);
    expect(motivo({ banos: "2,3" })).toMatch(/baños/);
    expect(motivo({ url_e24: "https://otro-sitio.com/x" })).toMatch(/encuentra24/);
  });

  it("propone el siguiente código libre", () => {
    expect(siguienteCodigo([])).toBe("P-001");
    expect(siguienteCodigo(["P-001", "P-003"])).toBe("P-004");
    expect(siguienteCodigo(["EJEMPLO-001", "P-002"])).toBe("P-003");
  });
});

describe("fotos de una propiedad", () => {
  const fotos = [
    { url: "b", orden: 2, mejorada_url: "b2" },
    { url: "a", orden: 1 },
  ];

  it("agrega al final sin repetir y renumera", () => {
    expect(agregarFotos(fotos, ["c", "a"])).toEqual([
      { url: "a", orden: 1 },
      { url: "b", orden: 2, mejorada_url: "b2" },
      { url: "c", orden: 3 },
    ]);
  });

  it("cambia la principal, reordena y quita sin perder la mejorada", () => {
    const tres = agregarFotos(fotos, ["c"]);
    expect(moverFoto(tres, "c", "principal").map((f) => f.url)).toEqual(["c", "a", "b"]);
    expect(moverFoto(tres, "b", "subir").map((f) => f.url)).toEqual(["b", "a", "c"]);
    expect(moverFoto(tres, "c", "bajar").map((f) => f.url)).toEqual(["a", "b", "c"]);
    expect(moverFoto(tres, "a", "quitar")).toEqual([
      { url: "b", orden: 1, mejorada_url: "b2" },
      { url: "c", orden: 2 },
    ]);
  });

  it("solo acepta rutas dentro de la carpeta de la propiedad", () => {
    const ruta = rutaFotoOriginal("p1", "IMG_1234.JPEG", 1700000000000);
    expect(ruta).toMatch(/^p1\/originales\/1700000000000-[a-z0-9]+\.jpg$/);
    expect(rutaDePropiedad(ruta, "p1")).toBe(true);
    expect(rutaDePropiedad(ruta, "p2")).toBe(false);
    expect(rutaDePropiedad("p1/originales/../../otro/x.jpg", "p1")).toBe(false);
  });
});

describe("horario y bloqueos", () => {
  const lunes = [{ dia_semana: 1, hora_inicio: "08:00", hora_fin: "12:00" }];

  it("acepta una franja y rechaza las encimadas o al revés", () => {
    expect(leerFranja(campos({ dia: "1", desde: "13:00", hasta: "17:00" }), lunes)).toEqual({
      ok: true,
      valor: { dia_semana: 1, hora_inicio: "13:00", hora_fin: "17:00" },
    });
    expect(leerFranja(campos({ dia: "1", desde: "11:00", hasta: "14:00" }), lunes)).toMatchObject({ ok: false });
    expect(leerFranja(campos({ dia: "2", desde: "11:00", hasta: "14:00" }), lunes)).toMatchObject({ ok: true });
    expect(leerFranja(campos({ dia: "2", desde: "14:00", hasta: "11:00" }), lunes)).toMatchObject({ ok: false });
    expect(leerFranja(campos({ dia: "9", desde: "08:00", hasta: "09:00" }), lunes)).toMatchObject({ ok: false });
  });

  const ahora = new Date("2026-10-19T15:00:00Z");
  const zona = "America/Costa_Rica";

  it("un bloqueo sin horas cubre los días completos en hora de Costa Rica", () => {
    const r = leerBloqueo(campos({ fecha_desde: "2026-12-24", fecha_hasta: "2026-12-26", motivo: "Navidad" }), zona, ahora);
    expect(r).toEqual({
      ok: true,
      valor: { inicio: new Date("2026-12-24T06:00:00Z"), fin: new Date("2026-12-27T06:00:00Z"), motivo: "Navidad" },
    });
  });

  it("un bloqueo con horas en un solo día", () => {
    const r = leerBloqueo(campos({ fecha_desde: "2026-10-21", hora_desde: "14:00", hora_hasta: "16:30" }), zona, ahora);
    expect(r).toMatchObject({ ok: true, valor: { inicio: new Date("2026-10-21T20:00:00Z"), fin: new Date("2026-10-21T22:30:00Z") } });
  });

  it("rechaza bloqueos al revés, pasados o con fechas inválidas", () => {
    expect(leerBloqueo(campos({ fecha_desde: "2026-10-21", hora_desde: "16:00", hora_hasta: "14:00" }), zona, ahora)).toMatchObject({ ok: false });
    expect(leerBloqueo(campos({ fecha_desde: "2026-10-01" }), zona, ahora)).toMatchObject({ ok: false, motivo: "Ese bloqueo ya pasó." });
    expect(leerBloqueo(campos({ fecha_desde: "2026-02-31" }), zona, ahora)).toMatchObject({ ok: false });
  });
});

describe("corredores conocidos", () => {
  it("normaliza teléfonos de Costa Rica e internacionales", () => {
    expect(normalizarTelefono("8888-1234")).toBe("+50688881234");
    expect(normalizarTelefono("+506 8888 1234")).toBe("+50688881234");
    expect(normalizarTelefono("506 2222-3333")).toBe("+50622223333");
    expect(normalizarTelefono("+1 305 555 0101")).toBe("+13055550101");
    expect(normalizarTelefono("1234")).toBeNull();
  });

  it("lee una lista pegada en cualquier orden y avisa lo que no entendió", () => {
    const r = leerCorredoresConocidos(
      [
        "María Solís, 8888-1234, RE/MAX",
        "7000 1111 - Carlos Mora",
        "Inmobiliaria Sol",
        "Juan, 12-34",
        "+50688881234, María otra vez",
        "",
      ].join("\n"),
    );
    expect(r.corredores).toEqual([
      { nombre: "María Solís", telefono: "+50688881234", empresa: "RE/MAX" },
      { nombre: "Carlos Mora", telefono: "+50670001111", empresa: null },
      { nombre: "Inmobiliaria Sol", telefono: null, empresa: null },
    ]);
    expect(r.ignoradas).toEqual(["Juan, 12-34"]);
  });
});

describe("horario sencillo", () => {
  it("lee mañana y tarde de las franjas y arma las franjas de lo marcado", async () => {
    const { turnosDelDia, franjasDeTurnos, esHorarioSencillo } = await import("../lib/panel/formularios");
    const franjas = [
      { dia_semana: 1, hora_inicio: "08:00:00", hora_fin: "17:00:00" },
      { dia_semana: 6, hora_inicio: "09:00:00", hora_fin: "12:00:00" },
    ];
    expect(turnosDelDia(franjas, 1)).toEqual({ manana: true, tarde: true });
    expect(turnosDelDia(franjas, 6)).toEqual({ manana: true, tarde: false });
    expect(turnosDelDia(franjas, 0)).toEqual({ manana: false, tarde: false });
    expect(franjasDeTurnos(campos({ m1: "on", t1: "on", t3: "on" }))).toEqual([
      { dia_semana: 1, hora_inicio: "08:00", hora_fin: "12:00" },
      { dia_semana: 1, hora_inicio: "13:00", hora_fin: "17:00" },
      { dia_semana: 3, hora_inicio: "13:00", hora_fin: "17:00" },
    ]);
    expect(esHorarioSencillo(franjas)).toBe(false);
    expect(esHorarioSencillo([{ dia_semana: 2, hora_inicio: "13:00:00", hora_fin: "17:00:00" }])).toBe(true);
  });
});
