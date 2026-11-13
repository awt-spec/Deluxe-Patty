import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, supabaseFalso } from "./entorno";

// "Dímelo con tus palabras" en Apartar tiempo: entender no guarda nada; guardar escribe solo en el corredor de la
// sesión (una inserción, la misma del formulario); quitar y deshacer no tocan lo de otro corredor; la demo no gasta.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

const presupuesto = { gastoDia: 0, gastoMes: 0, topeDia: 10, topeMes: 150 };
const registrarUso = vi.fn(async () => {});
const CONSUMO = { tokensEntrada: 10, tokensSalida: 5, costoUsd: 0.001 };
const entenderApartado = vi.fn(async () => ({ operaciones: [] as unknown[], consumo: CONSUMO }));
vi.mock("@/lib/asistente/dependencias", () => ({
  dependenciasPara: () => ({ repo: { presupuestoIA: async () => presupuesto, registrarUso, datosAgenda: async () => ({ horarios: [], bloqueos: [], citas: [] }) }, cerebro: { entenderApartado } }),
}));

const acciones = await import("@/app/panel/agenda/bloquear/acciones");
const { empacarPropuesta } = await import("@/lib/agenda/apartar-ia");

// Viernes 13 de noviembre de 2026, 9:00 a. m. en Costa Rica.
const AHORA = new Date("2026-11-13T15:00:00Z");
const corredor = { id: ID.deluxe, activo: true, nombre: "Deluxe", nombre_contacto: "Patricia", zona_horaria: "America/Costa_Rica" };
const BL_PROPIO = "70000000-0000-4000-8000-000000000001";
const BL_AJENO = "70000000-0000-4000-8000-000000000002";

function tablas() {
  return {
    citas: [
      { id: ID.cita, corredor_id: ID.deluxe, estado: "confirmada", inicio: "2026-11-17T21:00:00Z", fin: "2026-11-17T22:00:00Z", contactos: { nombre: "Ana" } },
      { id: ID.citaAjena, corredor_id: ID.otro, estado: "confirmada", inicio: "2026-11-17T21:00:00Z", fin: "2026-11-17T22:00:00Z", contactos: { nombre: "Otro" } },
    ],
    bloqueos_agenda: [
      { id: BL_PROPIO, corredor_id: ID.deluxe, inicio: "2026-11-20T06:00:00Z", fin: "2026-11-21T06:00:00Z", motivo: null },
      { id: BL_AJENO, corredor_id: ID.otro, inicio: "2026-11-20T06:00:00Z", fin: "2026-11-21T06:00:00Z", motivo: null },
    ],
    horarios_visitas: [{ corredor_id: ID.deluxe, dia_semana: 2, hora_inicio: "08:00:00", hora_fin: "17:00:00" }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  Object.assign(presupuesto, { gastoDia: 0, gastoMes: 0 });
  estado.sesion = { corredor: { ...corredor }, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso(tablas()) };
  estado.admin = supabaseFalso();
  estado.admin.respuestasRpc.reclamar_alerta = true;
});

describe("Entender (no guarda nada)", () => {
  it("con IA: renglones, choque solo con visitas propias, y lo que se quitaría solo del corredor", async () => {
    entenderApartado.mockResolvedValueOnce({
      operaciones: [
        { tipo: "apartar", desde: "2026-11-17", rato: "tarde", motivo: "Dentista" },
        { tipo: "quitar", desde: "2026-11-20" },
      ],
      consumo: CONSUMO,
    });
    const r = await acciones.entenderApartadoPanel("el martes en la tarde dentista y quita lo del viernes");
    if (!r.ok) throw new Error(r.motivo);
    expect(r.propuesta.fuente).toBe("ia");
    expect(r.propuesta.apartados.map((a) => a.texto)).toEqual(["Martes 17 de noviembre · En la tarde (12 a 6) · Dentista"]);
    expect(r.propuesta.apartados[0].choques).toEqual([{ id: ID.cita, texto: "Ojo: tienes una visita con Ana a las 3:00 p. m." }]);
    expect(r.propuesta.quitar.map((q) => q.id)).toEqual([BL_PROPIO]);
    expect(estado.sesion!.supabase.escrituras).toEqual([]);
    expect(registrarUso).toHaveBeenCalledWith(ID.deluxe, expect.objectContaining({ llamadasClaude: 1 }));
    expect(estado.admin.rpcs[0]).toMatchObject({ nombre: "reclamar_alerta", args: { p_clave: `apartar_ia:${ID.deluxe}:0` } });
  });

  it("en la demo lo entiende el código, sin IA ni gasto", async () => {
    estado.sesion!.corredor.activo = false;
    const r = await acciones.entenderApartadoPanel("el martes de 2 a 4 y el viernes todo el día");
    expect(r.ok && r.propuesta.fuente).toBe("demo");
    expect(r.ok && r.propuesta.apartados).toHaveLength(2);
    expect(entenderApartado).not.toHaveBeenCalled();
    expect(registrarUso).not.toHaveBeenCalled();
  });

  it("sin presupuesto: solo frases simples, sin llamar a la IA", async () => {
    presupuesto.gastoDia = 99;
    const r = await acciones.entenderApartadoPanel("el martes de 2 a 4 y el viernes no trabajo");
    expect(r.ok && r.propuesta.aviso).toContain("Hoy solo entiendo frases simples");
    expect(entenderApartado).not.toHaveBeenCalled();
  });

  it("muy rápido: frena antes de gastar", async () => {
    estado.admin.respuestasRpc.reclamar_alerta = false;
    const r = await acciones.entenderApartadoPanel("la otra semana estoy de vacaciones");
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("muy rápido") });
    expect(entenderApartado).not.toHaveBeenCalled();
  });

  it("con la propuesta de Patty en el enlace: se revisa sin volver a llamar a la IA", async () => {
    const p = empacarPropuesta("el viernes no trabajo", [{ tipo: "apartar", desde: "2026-11-20", rato: "todo" }, { tipo: "apartar", desde: "2026-02-01", rato: "todo" }]);
    const r = await acciones.entenderApartadoPanel("", p);
    expect(r.ok && r.propuesta).toMatchObject({ fuente: "patty", texto: "el viernes no trabajo" });
    expect(r.ok && r.propuesta.apartados).toHaveLength(1);
    expect(entenderApartado).not.toHaveBeenCalled();
  });
});

describe("Guardar y deshacer", () => {
  const renglon = { desde: "2026-11-18", hasta: "2026-11-18", rato: "manana", hora_inicio: null, hora_fin: null, motivo: "Banco" };

  it("guarda en una sola inserción con el corredor de la sesión y quita solo lo propio", async () => {
    const r = await acciones.guardarApartadosPanel([renglon, { ...renglon, desde: "2026-11-19", hasta: "2026-11-19", corredor_id: ID.otro }], [BL_PROPIO, BL_AJENO, "no-es-id"]);
    if (!r.ok) throw new Error(r.motivo);
    const db = estado.sesion!.supabase;
    const inserciones = db.escrituras.filter((e) => e.op === "insert");
    expect(inserciones).toHaveLength(1);
    expect((inserciones[0].valores as { corredor_id: string }[]).map((v) => v.corredor_id)).toEqual([ID.deluxe, ID.deluxe]);
    expect(db.tablas.bloqueos_agenda.some((b) => b.id === BL_AJENO)).toBe(true);
    expect(db.tablas.bloqueos_agenda.some((b) => b.id === BL_PROPIO)).toBe(false);
    expect(r.texto).toBe("Aparté 2 ratos y quité 1 rato apartado.");
    expect(r.quitados).toHaveLength(1);
  });

  it("con datos de otro corredor no hace nada", async () => {
    const r = await acciones.guardarApartadosPanel([], [BL_AJENO]);
    expect(r.ok).toBe(true);
    expect(estado.sesion!.supabase.tablas.bloqueos_agenda.some((b) => b.id === BL_AJENO)).toBe(true);
    const d = await acciones.deshacerApartadosPanel([BL_AJENO], []);
    expect(d.ok).toBe(true);
    expect(estado.sesion!.supabase.tablas.bloqueos_agenda.some((b) => b.id === BL_AJENO)).toBe(true);
    expect(estado.sesion!.supabase.escrituras.every((e) => e.filtros.some(([c, v]) => c === "corredor_id" && v === ID.deluxe))).toBe(true);
  });

  it("lo que llega del navegador se vuelve a revisar: una fecha pasada o inventada no se guarda", async () => {
    const r = await acciones.guardarApartadosPanel([{ ...renglon, desde: "2026-11-01", hasta: "2026-11-01" }], []);
    expect(r.ok).toBe(false);
    expect(estado.sesion!.supabase.escrituras).toEqual([]);
    const raro = await acciones.guardarApartadosPanel([{ ...renglon, rato: "horas", hora_inicio: "09:07", hora_fin: "10:00" }], []);
    expect(raro.ok).toBe(false);
  });

  it("deshacer quita justo lo apartado y vuelve a poner lo quitado, en el corredor de la sesión", async () => {
    const g = await acciones.guardarApartadosPanel([renglon], [BL_PROPIO]);
    if (!g.ok) throw new Error(g.motivo);
    // En la base los ids son uuid; el Supabase en memoria pone "nuevo-N".
    const fila = estado.sesion!.supabase.tablas.bloqueos_agenda.find((b) => b.id === g.ids[0])!;
    fila.id = "70000000-0000-4000-8000-000000000009";
    const d = await acciones.deshacerApartadosPanel([fila.id], g.quitados);
    expect(d.ok).toBe(true);
    const filas = estado.sesion!.supabase.tablas.bloqueos_agenda.filter((b) => b.corredor_id === ID.deluxe);
    expect(filas.map((b) => b.inicio)).toEqual(["2026-11-20T06:00:00.000Z"]);
  });
});
