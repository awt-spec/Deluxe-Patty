import { afterEach, describe, expect, it, vi } from "vitest";
import {
  choquesConVisitas,
  codigoLoEntiende,
  contextoFechas,
  desempacarPropuesta,
  empacarPropuesta,
  interpretarApartadoDemo,
  pideApartarLibre,
  revisarOperaciones,
  type OperacionApartarCruda,
} from "../lib/agenda/apartar-ia";
import { RechazoModelo } from "../lib/asistente/cerebro";
import { esRutaDelPanel } from "../lib/panel/markdown";

vi.mock("server-only", () => ({}));

// "Apartar tiempo" con IA: la revisión en código de lo que devuelve el modelo (reloj fijo), la regla que decide si un
// mensaje es de la agenda propia, y los tres lugares (pantalla vía el orquestador, chat de Patty y WhatsApp) con el
// modelo simulado.

const CR = "America/Costa_Rica";
// Viernes 13 de noviembre de 2026, 9:00 a. m. en Costa Rica.
const AHORA = new Date("2026-11-13T15:00:00Z");
const ctx = (texto = "") => ({ ahora: AHORA, zona: CR, texto });
const apartar = (o: Partial<OperacionApartarCruda>): OperacionApartarCruda => ({ tipo: "apartar", rato: "todo", ...o });

afterEach(() => vi.restoreAllMocks());

describe("revisar lo que devuelve el modelo", () => {
  it("unas horas con motivo: el texto lo arma el código", () => {
    const r = revisarOperaciones([apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "14:00", hora_fin: "16:00", motivo: "Dentista" })], ctx("el martes dentista"));
    expect(r.apartados).toHaveLength(1);
    expect(r.apartados[0]).toMatchObject({ texto: "Martes 17 de noviembre · 2:00 a 4:00 p. m. · Dentista", inicio: "2026-11-17T20:00:00.000Z", fin: "2026-11-17T22:00:00.000Z" });
    expect(r.notas).toEqual([]);
  });

  it("día entero, una parte del día y horas que cruzan el mediodía", () => {
    const r = revisarOperaciones(
      [apartar({ desde: "2026-11-20" }), apartar({ desde: "2026-11-18", rato: "manana" }), apartar({ desde: "2026-11-19", rato: "horas", hora_inicio: "11:00", hora_fin: "13:30" })],
      ctx(),
    );
    expect(r.apartados.map((a) => a.texto)).toEqual([
      "Miércoles 18 de noviembre · En la mañana (7 a 12)",
      "Jueves 19 de noviembre · 11:00 a. m. a 1:30 p. m.",
      "Viernes 20 de noviembre · Todo el día",
    ]);
    expect(r.apartados[2]).toMatchObject({ inicio: "2026-11-20T06:00:00.000Z", fin: "2026-11-21T06:00:00.000Z" });
  });

  it("varios días enteros son un solo rato; la tarde de varios días es uno por día", () => {
    const vac = revisarOperaciones([apartar({ desde: "2026-11-16", hasta: "2026-11-22", motivo: "Vacaciones" })], ctx());
    expect(vac.apartados).toHaveLength(1);
    expect(vac.apartados[0].texto).toBe("Del lunes 16 de noviembre al domingo 22 de noviembre · Días enteros · Vacaciones");
    expect(vac.apartados[0].fin).toBe("2026-11-23T06:00:00.000Z");
    const tardes = revisarOperaciones([apartar({ desde: "2026-11-16", hasta: "2026-11-18", rato: "tarde" })], ctx());
    expect(tardes.apartados.map((a) => a.desde)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });

  it("repetición: todos los jueves en la mañana de este mes, expandidos a días concretos", () => {
    const r = revisarOperaciones(
      [apartar({ desde: "2026-11-13", rato: "manana", repetir: { dias_semana: [4], hasta: "2026-11-30" }, motivo: "Llevar a mi mamá al médico" })],
      ctx("todos los jueves en la mañana llevo a mi mamá al médico este mes"),
    );
    expect(r.apartados.map((a) => a.texto)).toEqual([
      "Jueves 19 de noviembre · En la mañana (7 a 12) · Llevar a mi mamá al médico",
      "Jueves 26 de noviembre · En la mañana (7 a 12) · Llevar a mi mamá al médico",
    ]);
  });

  it("repetición más allá de 90 días se recorta, y nunca más de 40 apartados por pedido", () => {
    const largo = revisarOperaciones([apartar({ desde: "2026-11-16", rato: "manana", repetir: { dias_semana: [1], hasta: "2027-06-01" } })], ctx());
    expect(largo.notas.join(" ")).toContain("máximo 90 días");
    expect(largo.apartados.at(-1)!.desde <= "2027-02-11").toBe(true);
    const diario = revisarOperaciones([apartar({ desde: "2026-11-14", rato: "tarde", repetir: { dias_semana: [1, 2, 3, 4, 5, 6, 7], hasta: "2027-02-01" } })], ctx());
    expect(diario.apartados).toHaveLength(40);
    expect(diario.notas.join(" ")).toContain("hasta 40 ratos");
  });

  it("repetición sin días o sin final válido se descarta con nota", () => {
    const r = revisarOperaciones([apartar({ desde: "2026-11-16", repetir: { dias_semana: [9], hasta: "2026-11-30" } }), apartar({ desde: "2026-11-16", repetir: { dias_semana: [1], hasta: "2026-11-01" } })], ctx());
    expect(r.apartados).toEqual([]);
    expect(r.notas[0]).toContain("hasta cuándo se repite");
  });

  it("lo pasado no se aparta: un día de ayer y la mañana de hoy cuando ya es de tarde", () => {
    const ayer = revisarOperaciones([apartar({ desde: "2026-11-12" })], ctx());
    expect(ayer.apartados).toEqual([]);
    expect(ayer.notas[0]).toContain("ya pasó");
    const tarde = new Date("2026-11-13T20:00:00Z"); // 2:00 p. m.
    const r = revisarOperaciones([apartar({ desde: "2026-11-13", rato: "manana" }), apartar({ desde: "2026-11-13", rato: "noche" })], { ahora: tarde, zona: CR, texto: "" });
    expect(r.apartados.map((a) => a.rato)).toEqual(["noche"]);
    expect(r.notas.join(" ")).toContain("ya pasó");
  });

  it("vacaciones que empezaron ayer: se aparta desde hoy", () => {
    const r = revisarOperaciones([apartar({ desde: "2026-11-11", hasta: "2026-11-15" })], ctx());
    expect(r.apartados[0]).toMatchObject({ desde: "2026-11-13", hasta: "2026-11-15" });
  });

  it("más de 60 días adelante sin repetición se descarta", () => {
    const r = revisarOperaciones([apartar({ desde: "2027-01-20" })], ctx());
    expect(r.apartados).toEqual([]);
    expect(r.notas[0]).toContain("60 días");
  });

  it("fechas que no existen, al revés o basura", () => {
    const r = revisarOperaciones(
      [apartar({ desde: "2026-11-31" }), apartar({ desde: "2026-11-20", hasta: "2026-11-18" }), apartar({ desde: "mañana" }), null, "x", { tipo: "borrar_todo" }],
      ctx(),
    );
    expect(r.apartados).toEqual([]);
    expect(r.notas.join(" ")).toContain("fecha que no existe");
    expect(revisarOperaciones("no es una lista", ctx())).toEqual({ apartados: [], quitar: [], dudas: [], notas: [] });
  });

  it("horas raras: fuera de cuartos de hora, al revés o sin rato válido se descartan; de madrugada es duda", () => {
    const r = revisarOperaciones(
      [
        apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "14:10", hora_fin: "16:00" }),
        apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "16:00", hora_fin: "14:00" }),
        apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "25:00", hora_fin: "26:00" }),
        apartar({ desde: "2026-11-17", rato: "horas" }),
        apartar({ desde: "2026-11-17", rato: "siesta" as never }),
        apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "02:00", hora_fin: "04:00" }),
      ],
      ctx(),
    );
    expect(r.apartados).toEqual([]);
    expect(r.notas.join(" ")).toContain("no cuadran");
    expect(r.notas.join(" ")).toContain("qué parte del día");
    expect(r.dudas).toEqual([{ pregunta: "¿Las 2:00 del martes 17 de noviembre son de la mañana o de la tarde?", opciones: ["A las 2:00 de la mañana", "A las 2:00 de la tarde"] }]);
  });

  it("el día de la semana que no coincide con lo que dijo el corredor es duda", () => {
    const r = revisarOperaciones([apartar({ desde: "2026-11-18", rato: "tarde" })], ctx("el martes en la tarde tengo dentista"));
    expect(r.apartados).toEqual([]);
    expect(r.dudas[0].pregunta).toBe("Dijiste martes, pero el 18 de noviembre es miércoles. ¿Qué día es?");
    expect(r.dudas[0].opciones).toEqual(["El martes 17 de noviembre"]);
    // Si coincide, pasa; si además dijo "mañana" (otro día) o un número de día, no se puede saber cuál es cuál.
    expect(revisarOperaciones([apartar({ desde: "2026-11-17", rato: "tarde" })], ctx("el martes en la tarde")).apartados).toHaveLength(1);
    expect(revisarOperaciones([apartar({ desde: "2026-11-14" })], ctx("mañana y el martes")).apartados).toHaveLength(1);
    expect(revisarOperaciones([apartar({ desde: "2026-11-18" })], ctx("el martes 18")).apartados).toHaveLength(1);
  });

  it("las dudas pasan limpias; el motivo se recorta y no lleva etiquetas", () => {
    const r = revisarOperaciones(
      [
        { tipo: "duda", pregunta: "¿Este martes <b>o el otro</b>?", opciones: ["Este martes 17", "El martes 24", "x", "y", "z"] },
        { tipo: "duda", pregunta: "   " },
        apartar({ desde: "2026-11-20", motivo: `<script>alert(1)</script>${"m".repeat(100)}` }),
      ],
      ctx(),
    );
    expect(r.dudas).toEqual([{ pregunta: "¿Este martes bo el otro/b?", opciones: ["Este martes 17", "El martes 24", "x", "y"] }]);
    expect(r.apartados[0].motivo!.length).toBe(60);
    expect(r.apartados[0].motivo).not.toMatch(/[<>]/);
  });

  it("quitar: un día o varios, lo pasado no", () => {
    const r = revisarOperaciones([{ tipo: "quitar", desde: "2026-11-20" }, { tipo: "quitar", desde: "2026-11-23", hasta: "2026-11-27" }, { tipo: "quitar", desde: "2026-11-01" }], ctx());
    expect(r.quitar.map((q) => q.texto)).toEqual(["Viernes 20 de noviembre", "Del lunes 23 de noviembre al viernes 27 de noviembre"]);
    expect(r.quitar[0]).toMatchObject({ inicio: "2026-11-20T06:00:00.000Z", fin: "2026-11-21T06:00:00.000Z" });
    expect(r.notas[0]).toContain("ya pasó");
  });

  it("lo repetido no se duplica y sale en orden", () => {
    const r = revisarOperaciones([apartar({ desde: "2026-11-20" }), apartar({ desde: "2026-11-17" }), apartar({ desde: "2026-11-20" })], ctx());
    expect(r.apartados.map((a) => a.desde)).toEqual(["2026-11-17", "2026-11-20"]);
  });
});

describe("¿es un pedido de la agenda propia?", () => {
  it.each([
    "no puedo el viernes",
    "No puedo mañana en la tarde",
    "la otra semana estoy de vacaciones",
    "mañana llego tarde, después de las 10",
    "el martes tengo dentista de 2 a 4 y el viernes no trabajo",
    "todos los jueves en la mañana llevo a mi mamá al médico este mes",
    "quita lo del viernes",
    "Quítame lo apartado del martes",
    "desbloquea el viernes",
    "estoy ocupada el 20",
  ])("sí: %s", (t) => expect(pideApartarLibre(t)).toBe(true));

  it.each([
    "¿Qué tengo hoy?",
    "no puedo abrir el enlace",
    "el viernes tengo cita con un cliente en Escazú",
    "mañana tengo visita con Juan",
    "quita la foto 3",
    "estoy ocupada",
    "no puedo el viernes https://www.encuentra24.com/x",
    "todos los jueves me escriben",
    "Analiza esta casa en Santa Ana",
    `no puedo el viernes ${"x".repeat(400)}`,
  ])("no: %s", (t) => expect(pideApartarLibre(t)).toBe(false));
});

describe("¿lo entiende entero el código?", () => {
  it.each(["apartar mañana en la tarde", "apartar el viernes de 2 a 4 por una cita médica", "bloquear del 20 al 25 por vacaciones", "no puedo el viernes", "apartar hoy todo el día"])(
    "sí: %s",
    (t) => expect(codigoLoEntiende(t, AHORA, CR)).not.toBeNull(),
  );
  it.each([
    "apartar el martes de 2 a 4 y el viernes todo el día",
    "apartar la otra semana",
    "mañana llego tarde, después de las 10",
    "apartar todos los jueves en la mañana",
    "quita lo del viernes",
    "apartar mañana o el lunes",
    "apartar el martes de 2 y media a 4",
    "apartar algún día",
  ])("no: %s", (t) => expect(codigoLoEntiende(t, AHORA, CR)).toBeNull());
});

describe("choques, demo y enlace", () => {
  it("choques con visitas por renglón (no se cancela nada)", () => {
    const [a] = revisarOperaciones([apartar({ desde: "2026-11-17", rato: "tarde" })], ctx()).apartados;
    const c = choquesConVisitas([a], [
      { id: "v1", inicio: "2026-11-17T21:00:00Z", fin: "2026-11-17T22:00:00Z", nombre: "Ana" },
      { id: "v2", inicio: "2026-11-17T15:00:00Z", fin: "2026-11-17T16:00:00Z" },
    ]);
    expect(c[a.clave].map((v) => v.id)).toEqual(["v1"]);
    expect(choquesConVisitas([a], [])).toEqual({});
  });

  it("la demo lo entiende con el código, pedazo por pedazo", () => {
    const ops = interpretarApartadoDemo("el martes de 2 a 4 y el viernes todo el día", AHORA, CR);
    expect(revisarOperaciones(ops, ctx()).apartados.map((a) => a.texto)).toEqual(["Martes 17 de noviembre · 2:00 a 4:00 p. m.", "Viernes 20 de noviembre · Todo el día"]);
    expect(interpretarApartadoDemo("la otra semana estoy de vacaciones", AHORA, CR)[0]).toMatchObject({ desde: "2026-11-16", hasta: "2026-11-22" });
    expect(interpretarApartadoDemo("quita lo del viernes", AHORA, CR)[0]).toMatchObject({ tipo: "quitar", desde: "2026-11-20" });
    expect(interpretarApartadoDemo("cuando pueda", AHORA, CR)[0].tipo).toBe("duda");
  });

  it("la propuesta viaja en un enlace del panel y vuelve igual; lo raro no se acepta", () => {
    const ops = [apartar({ desde: "2026-11-20", motivo: "Dentista ñ" })];
    const p = empacarPropuesta("el viernes dentista", ops);
    expect(esRutaDelPanel(`/panel/agenda/bloquear?p=${p}`)).toBe(true);
    expect(desempacarPropuesta(p)).toEqual({ texto: "el viernes dentista", ops });
    expect(desempacarPropuesta("no válido!")).toBeNull();
    expect(desempacarPropuesta(Buffer.from("{}").toString("base64url"))).toBeNull();
    expect(desempacarPropuesta(42)).toBeNull();
  });

  it("al modelo le llega el calendario con el día de la semana y el horario", () => {
    const c = contextoFechas(AHORA, CR, [{ dia_semana: 2, hora_inicio: "08:00:00", hora_fin: "12:00:00" }]);
    expect(c).toContain("2026-11-13 viernes (hoy)");
    expect(c).toContain("2026-11-17 martes");
    expect(c).toContain("martes: 08:00-12:00");
    expect(c).toContain("domingo: no enseña casas");
  });
});

// --- El orquestador (pantalla), Patty y WhatsApp con el modelo simulado -----------------------------------------

const CONSUMO = { tokensEntrada: 100, tokensSalida: 20, costoUsd: 0.0002 };

async function preparar(ops: OperacionApartarCruda[] = [], extra: { tope?: boolean } = {}) {
  const { corredorBase, repoEnMemoria } = await import("./dobles");
  const corredor = corredorBase();
  const db = repoEnMemoria(corredor);
  if (extra.tope) db.costoDia.usd = 99;
  const entenderApartado = vi.fn(async () => ({ operaciones: ops, consumo: CONSUMO }));
  return { corredor, db, entenderApartado, deps: { repo: db.repo, cerebro: { entenderApartado } } };
}

describe("entender: código, demo, tope e IA", () => {
  it("lo simple lo entiende el código, sin modelo ni gasto", async () => {
    const { entenderPedidoApartado } = await import("../lib/agenda/entender-apartado");
    const { corredor, db, entenderApartado, deps } = await preparar();
    const r = await entenderPedidoApartado(deps, corredor, "apartar el viernes de 2 a 4", AHORA);
    expect(r).toMatchObject({ ok: true, fuente: "codigo" });
    expect(r.ok && r.revisado.apartados[0].texto).toBe("Viernes 20 de noviembre · 2:00 a 4:00 p. m.");
    expect(entenderApartado).not.toHaveBeenCalled();
    expect(db.costoDia.usd).toBe(0);
  });

  it("lo que no entiende el código va al modelo con el calendario, como dato recortado, y suma el costo", async () => {
    const { entenderPedidoApartado } = await import("../lib/agenda/entender-apartado");
    const ops = [apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "14:00", hora_fin: "16:00", motivo: "Dentista" }), apartar({ desde: "2026-11-20" })];
    const { corredor, db, entenderApartado, deps } = await preparar(ops);
    const largo = `el martes tengo dentista de 2 a 4 y el viernes no trabajo ${"x".repeat(800)}`;
    const r = await entenderPedidoApartado(deps, corredor, largo, AHORA);
    expect(r).toMatchObject({ ok: true, fuente: "ia" });
    expect(r.ok && r.revisado.apartados).toHaveLength(2);
    const pedido = (entenderApartado.mock.calls[0] as unknown as [unknown, { texto: string; contexto: string }])[1];
    expect(pedido.texto.length).toBe(500);
    expect(pedido.contexto).toContain("2026-11-17 martes");
    expect(db.costoDia.usd).toBeCloseTo(0.0002);
  });

  it("sin presupuesto cae al código y avisa que hoy solo entiende frases simples", async () => {
    const { entenderPedidoApartado, SOLO_SIMPLES } = await import("../lib/agenda/entender-apartado");
    const { corredor, entenderApartado, deps } = await preparar([], { tope: true });
    const r = await entenderPedidoApartado(deps, corredor, "el martes de 2 a 4 y el viernes no trabajo", AHORA);
    expect(r).toMatchObject({ ok: true, fuente: "simple", aviso: SOLO_SIMPLES });
    expect(r.ok && r.revisado.apartados.map((a) => a.desde)).toEqual(["2026-11-17"]);
    expect(entenderApartado).not.toHaveBeenCalled();
  });

  it("en la demo (corredor inactivo) lo entiende el código, sin modelo ni gasto", async () => {
    const { entenderPedidoApartado } = await import("../lib/agenda/entender-apartado");
    const { corredor, db, entenderApartado, deps } = await preparar();
    const r = await entenderPedidoApartado(deps, { ...corredor, activo: false }, "el martes de 2 a 4 y el viernes todo el día", AHORA);
    expect(r).toMatchObject({ ok: true, fuente: "demo" });
    expect(r.ok && r.revisado.apartados).toHaveLength(2);
    expect(entenderApartado).not.toHaveBeenCalled();
    expect(db.costoDia.usd).toBe(0);
  });

  it("muchos pedidos por minuto frenan antes de gastar", async () => {
    const { entenderPedidoApartado, MUY_RAPIDO } = await import("../lib/agenda/entender-apartado");
    const { corredor, entenderApartado, deps } = await preparar();
    const r = await entenderPedidoApartado(deps, corredor, "la otra semana estoy de vacaciones", AHORA, { turno: async () => false });
    expect(r).toEqual({ ok: false, motivo: MUY_RAPIDO });
    expect(entenderApartado).not.toHaveBeenCalled();
  });

  it("si el modelo falla: el código, el aviso y nada del texto en los registros; si se niega, se cobra igual", async () => {
    const { entenderPedidoApartado } = await import("../lib/agenda/entender-apartado");
    const { corredor, db, entenderApartado, deps } = await preparar();
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    entenderApartado.mockRejectedValueOnce(new Error("se cayó leyendo: dentista de Patricia"));
    const r = await entenderPedidoApartado(deps, corredor, "el martes dentista y el viernes no trabajo", AHORA);
    expect(r).toMatchObject({ ok: true, fuente: "simple", aviso: expect.stringContaining("No pude usar la inteligencia artificial") });
    expect(JSON.stringify(errores.mock.calls)).not.toContain("dentista");
    entenderApartado.mockRejectedValueOnce(new RechazoModelo(CONSUMO));
    await entenderPedidoApartado(deps, corredor, "el martes dentista y el viernes no trabajo", AHORA);
    expect(db.costoDia.usd).toBeCloseTo(0.0002);
  });
});

describe("por WhatsApp", () => {
  async function porWhatsApp(texto: string, ops: OperacionApartarCruda[], antes?: (db: Awaited<ReturnType<typeof preparar>>["db"]) => Promise<void>) {
    const { procesarMensaje } = await import("../lib/asistente/procesar");
    const { PATRICIA, entrante } = await import("./dobles");
    const p = await preparar(ops);
    if (antes) await antes(p.db);
    const enviados: string[] = [];
    const deps = {
      repo: p.db.repo,
      cerebro: { entenderApartado: p.entenderApartado } as never,
      whatsapp: { texto: async (_p: string, _a: string, t: string) => (enviados.push(t), "wamid.x"), plantilla: async () => "wamid.p" } as never,
      plantillaAviso: "aviso",
      plantillaRecordatorio: "rec",
      registrar: () => {},
      ahora: () => AHORA,
    };
    const r = await procesarMensaje(deps, entrante(texto, { telefono: PATRICIA, timestamp: AHORA }));
    return { r, enviados, ...p };
  }

  it("sin dudas ni choques lo guarda directo y dice cómo quitarlo", async () => {
    const ops = [apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "14:00", hora_fin: "16:00", motivo: "Dentista" }), apartar({ desde: "2026-11-20" })];
    const { r, enviados, db, entenderApartado } = await porWhatsApp("el martes tengo dentista de 2 a 4 y el viernes no trabajo", ops);
    expect(r).toEqual({ tipo: "corredor", accion: "bloqueo" });
    expect(entenderApartado).toHaveBeenCalledOnce();
    expect(db.bloqueos).toHaveLength(2);
    expect(enviados.at(-1)).toContain("Aparté 2 ratos");
    expect(enviados.at(-1)).toContain("Martes 17 de noviembre · 2:00 a 4:00 p. m. · Dentista");
    expect(enviados.at(-1)).toContain("quitar lo del");
  });

  it("con una duda no guarda nada y pregunta", async () => {
    const { r, enviados, db } = await porWhatsApp("apartar el martes temprano y el viernes", [{ tipo: "duda", pregunta: "¿De 6 a 8 de la mañana o de la noche?" }]);
    expect(r).toEqual({ tipo: "corredor", accion: "ayuda" });
    expect(db.bloqueos).toHaveLength(0);
    expect(enviados.at(-1)).toContain("¿De 6 a 8 de la mañana o de la noche?");
  });

  it("si choca con una visita no lo aparta y lo manda al panel", async () => {
    const { r, enviados, db } = await porWhatsApp("no puedo el martes en la tarde ni el viernes", [apartar({ desde: "2026-11-17", rato: "tarde" })], async (d) => {
      await d.repo.crearCita({ corredor_id: "c1", contacto_id: "ct", conversacion_id: null, propiedad_id: null, inicio: new Date("2026-11-17T21:00:00Z"), fin: new Date("2026-11-17T22:00:00Z") } as never);
    });
    expect(r).toEqual({ tipo: "corredor", accion: "ayuda" });
    expect(db.bloqueos).toHaveLength(0);
    expect(enviados.at(-1)).toContain("No lo aparté");
    expect(enviados.at(-1)).toContain("3:00 p. m.");
  });

  it("«quita lo del viernes» quita lo apartado ese día y nada más", async () => {
    const { r, enviados, db } = await porWhatsApp("quita lo del viernes", [{ tipo: "quitar", desde: "2026-11-20" }], async (d) => {
      await d.repo.crearBloqueo("c1", new Date("2026-11-20T06:00:00Z"), new Date("2026-11-21T06:00:00Z"), null);
      await d.repo.crearBloqueo("c1", new Date("2026-11-24T06:00:00Z"), new Date("2026-11-25T06:00:00Z"), null);
    });
    expect(r).toEqual({ tipo: "corredor", accion: "bloqueo" });
    expect(db.bloqueos.map((b) => b.inicio.toISOString())).toEqual(["2026-11-24T06:00:00.000Z"]);
    expect(enviados.at(-1)).toContain("Quité 1 rato apartado");
  });

  it("lo simple sigue sin modelo; lo que nadie entiende pide otra forma", async () => {
    const simple = await porWhatsApp("no puedo el viernes", []);
    expect(simple.r).toEqual({ tipo: "corredor", accion: "bloqueo" });
    expect(simple.entenderApartado).not.toHaveBeenCalled();
    expect(simple.db.bloqueos).toHaveLength(1);
    const nada = await porWhatsApp("bloquear cuando se pueda la otra vez", []);
    expect(nada.enviados.at(-1)).toContain("No entendí qué día");
    expect(nada.db.bloqueos).toHaveLength(0);
  });
});

describe("en el chat de Patty", () => {
  it("lo que el código no entiende: resumen armado por código y botón a la pantalla, sin guardar", async () => {
    const { hablarConPatty } = await import("../lib/panel/patty");
    const ops = [apartar({ desde: "2026-11-17", rato: "horas", hora_inicio: "14:00", hora_fin: "16:00", motivo: "Dentista" }), apartar({ desde: "2026-11-20" })];
    const { corredor, db, entenderApartado } = await preparar(ops);
    const conversar = vi.fn();
    const deps = { repo: db.repo, cerebro: { entenderApartado, conversarConCorredor: conversar }, whatsapp: {}, plantillaAviso: "a", plantillaRecordatorio: "r", registrar: () => {} };
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const r = await hablarConPatty(deps as never, { rpc } as never, corredor, [], "el martes tengo dentista de 2 a 4 y el viernes no trabajo");
    expect(r.ok).toBe(true);
    const texto = r.ok ? r.texto : "";
    expect(texto).toContain("- Martes 17 de noviembre · 2:00 a 4:00 p. m. · Dentista");
    expect(texto).toContain("Todavía no lo aparté");
    const enlace = /\]\((\/panel\/agenda\/bloquear\?p=[^)]+)\)/.exec(texto)![1];
    expect(esRutaDelPanel(enlace)).toBe(true);
    expect(db.bloqueos).toHaveLength(0);
    expect(conversar).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("reclamar_alerta", expect.objectContaining({ p_clave: `apartar_ia:${corredor.id}:0` }));
  });
});
