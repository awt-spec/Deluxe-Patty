import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ID, conAlertasReales, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

// Un toque, un envío (lib/panel/una-vez.ts): un doble toque en Enviar del chat, en Agendar o en Mover la visita no
// le escribe dos veces al cliente ni crea dos visitas, y el segundo envío responde como si hubiera salido bien.
// Las marcas viven en la tabla `alertas` de la base en memoria, con `reclamar_alerta` como en Postgres.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("next/server", () => import("./mocks/servidor-next"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => import("./mocks/dependencias"));
vi.mock("@/lib/panel/acciones", () => ({
  aprobarBorrador: vi.fn(async () => ({ ok: true })),
  descartarBorrador: vi.fn(async () => ({ ok: true })),
  tomarControl: vi.fn(async () => ({ ok: true })),
  devolverControl: vi.fn(async () => ({ ok: true })),
  escribirComoCorredor: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/panel/visitas", () => ({
  crearVisita: vi.fn(async () => ({ ok: true, aviso: "Visita agendada. Le avisé por WhatsApp." })),
  moverVisita: vi.fn(async () => ({ ok: true, aviso: "Visita movida. Le avisé por WhatsApp." })),
  cambiarVisita: vi.fn(async () => ({ ok: true, aviso: "Visita confirmada. Le avisé por WhatsApp." })),
}));

const panel = await import("@/app/panel/acciones");
const agenda = await import("@/app/panel/agenda/acciones");
const backend = await import("@/lib/panel/acciones");
const visitas = await import("@/lib/panel/visitas");

const corredor = { id: ID.deluxe, activo: true, zona_horaria: "America/Costa_Rica", duracion_visita_min: 60, whatsapp_phone_number_id: "PNID" };
const ENVIO = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const OTRO_ENVIO = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const aviso = (url: string) => new URL(url, "https://x").searchParams.get("aviso");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-16T15:00:00Z")); // lunes 9:00 en Costa Rica
  const filas = {
    conversaciones: [
      { id: ID.conversacion, corredor_id: ID.deluxe },
      { id: ID.conversacionAjena, corredor_id: ID.otro },
    ],
    contactos: [
      { id: ID.cliente, corredor_id: ID.deluxe },
      { id: ID.clienteAjeno, corredor_id: ID.otro },
    ],
    citas: [
      { id: ID.cita, corredor_id: ID.deluxe, inicio: "2026-11-17T16:00:00Z", fin: "2026-11-17T17:00:00Z" },
      { id: ID.citaAjena, corredor_id: ID.otro, inicio: "2026-11-17T16:00:00Z", fin: "2026-11-17T17:00:00Z" },
    ],
    horarios_visitas: [1, 2, 3, 4, 5].map((d, i) => ({ id: `h${i}`, corredor_id: ID.deluxe, dia_semana: d, hora_inicio: "08:00:00", hora_fin: "17:00:00" })),
    bloqueos_agenda: [],
  };
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso(filas) };
  estado.admin = conAlertasReales(supabaseFalso(structuredClone(filas)));
});
afterEach(() => vi.useRealTimers());

describe("Chat: Enviar con doble toque", () => {
  const enviar = (texto: string, envio = ENVIO, conversacion = ID.conversacion) =>
    redirigeA(panel.escribir(formulario({ conversacion, texto, envio })));

  it("el mismo formulario dos veces manda un solo mensaje; el segundo dice «Enviado.» (no un error)", async () => {
    const [a, b] = await Promise.all([enviar("Prueba doble toque"), enviar("Prueba doble toque")]);
    expect(backend.escribirComoCorredor).toHaveBeenCalledTimes(1);
    expect(aviso(a)).toBe("Enviado.");
    expect(aviso(b)).toBe("Enviado.");
  });

  it("otro mensaje (o la pantalla nueva, con otro código) sí sale", async () => {
    await enviar("Hola");
    await enviar("¿Le queda bien el jueves?");
    await enviar("Hola", OTRO_ENVIO);
    expect(backend.escribirComoCorredor).toHaveBeenCalledTimes(3);
  });

  it("si WhatsApp no lo aceptó, se suelta la marca y puede reintentar con el mismo formulario", async () => {
    vi.mocked(backend.escribirComoCorredor).mockResolvedValueOnce({ ok: false, motivo: "WhatsApp no aceptó el mensaje. Inténtalo de nuevo." });
    expect(aviso(await enviar("Hola"))).toMatch(/no aceptó/);
    expect(aviso(await enviar("Hola"))).toBe("Enviado.");
    expect(backend.escribirComoCorredor).toHaveBeenCalledTimes(2);
  });

  it("la marca no guarda el texto ni el teléfono del cliente", async () => {
    await enviar("Mi número es 8888-0001");
    const claves = (estado.admin.tablas.alertas ?? []).map((a) => String(a.clave));
    expect(claves).toHaveLength(1);
    expect(claves[0]).toMatch(new RegExp(`^envio:escribir:${ID.deluxe}:${ENVIO}:[0-9a-f]{16}$`));
    expect(claves[0]).not.toMatch(/8888|número/);
  });

  it("sin código (un formulario viejo) se manda como siempre", async () => {
    await redirigeA(panel.escribir(formulario({ conversacion: ID.conversacion, texto: "Hola" })));
    await redirigeA(panel.escribir(formulario({ conversacion: ID.conversacion, texto: "Hola" })));
    expect(backend.escribirComoCorredor).toHaveBeenCalledTimes(2);
  });

  it("con la conversación de otro corredor no hace nada ni deja marca", async () => {
    expect(aviso(await enviar("Hola", ENVIO, ID.conversacionAjena))).toBe("No encontré la conversación.");
    expect(backend.escribirComoCorredor).not.toHaveBeenCalled();
    expect(estado.admin.tablas.alertas ?? []).toEqual([]);
  });
});

describe("Agenda: Agendar con doble toque", () => {
  const agendar = (extra: Record<string, string> = {}) =>
    redirigeA(agenda.agendarVisita(formulario({ cliente: ID.cliente, casa: "", fecha: "2026-11-19", hora: "13:00", minutos: "60", avisar: "on", envio: ENVIO, ...extra })));

  it("crea una sola visita y los dos envíos llegan a la agenda con «Visita agendada»", async () => {
    const [a, b] = await Promise.all([agendar(), agendar()]);
    expect(visitas.crearVisita).toHaveBeenCalledTimes(1);
    for (const url of [a, b]) {
      expect(url).toMatch(/^\/panel\/agenda\?vista=dia&fecha=2026-11-19/);
      expect(aviso(url)).toMatch(/^Visita agendada/);
    }
  });

  it("si la hora ya se ocupó, vuelve al formulario con el cliente, la duración y el aviso elegidos, y suelta la marca", async () => {
    vi.mocked(visitas.crearVisita).mockResolvedValueOnce({ ok: false, motivo: "A esa hora ya hay otra visita. Elige otra hora." });
    const url = await agendar({ minutos: "90", avisar: "" });
    const q = new URL(url, "https://x").searchParams;
    expect(q.get("aviso")).toBe("A esa hora ya hay otra visita. Elige otra hora.");
    expect(q.get("cliente")).toBe(ID.cliente);
    expect(q.get("minutos")).toBe("90");
    expect(estado.admin.tablas.alertas ?? []).toEqual([]);
    // Elige otra hora con la misma pantalla: sí agenda.
    await agendar({ hora: "14:00" });
    expect(visitas.crearVisita).toHaveBeenCalledTimes(2);
  });

  it("un aviso de la validación también conserva el cliente", async () => {
    const url = await agendar({ fecha: "2026-11-10" }); // ya pasó
    expect(new URL(url, "https://x").searchParams.get("cliente")).toBe(ID.cliente);
    expect(visitas.crearVisita).not.toHaveBeenCalled();
  });

  it("con un cliente de otro corredor no crea nada ni deja marca", async () => {
    await agendar({ cliente: ID.clienteAjeno });
    expect(visitas.crearVisita).not.toHaveBeenCalled();
    expect(estado.admin.tablas.alertas ?? []).toEqual([]);
  });
});

describe("Visita: mover con doble toque", () => {
  const mover = (id = ID.cita) => redirigeA(agenda.moverLaVisita(formulario({ id, fecha: "2026-11-18", hora: "10:00", avisar: "on", envio: ENVIO })));

  it("le avisa una sola vez al cliente", async () => {
    const [a, b] = await Promise.all([mover(), mover()]);
    expect(visitas.moverVisita).toHaveBeenCalledTimes(1);
    expect(aviso(a)).toMatch(/^Visita movida/);
    expect(aviso(b)).toMatch(/^Visita movida/);
  });

  it("la visita de otro corredor no se mueve", async () => {
    await mover(ID.citaAjena);
    expect(visitas.moverVisita).not.toHaveBeenCalled();
  });
});

describe("Revisar: Enviar / No enviar con doble toque", () => {
  beforeEach(() => {
    estado.sesion!.supabase.tablas.mensajes = [
      { id: ID.mensaje, corredor_id: ID.deluxe, conversacion_id: ID.conversacion },
      { id: ID.mensajeAjeno, corredor_id: ID.otro, conversacion_id: ID.conversacionAjena },
    ];
  });

  it("el segundo toque vuelve a Revisar con el aviso de hecho, no con «ya se resolvió»", async () => {
    vi.mocked(backend.descartarBorrador).mockResolvedValueOnce({ ok: true, aviso: "Listo, no se envió." });
    vi.mocked(backend.aprobarBorrador).mockResolvedValueOnce({ ok: true, aviso: "Enviado." });
    expect(aviso(await redirigeA(panel.descartar(formulario({ mensaje: ID.mensaje, volver: "/panel/revisar" }))))).toBe("Listo, no se envió.");
    expect(aviso(await redirigeA(panel.aprobar(formulario({ mensaje: ID.mensaje, volver: "/panel/revisar" }))))).toBe("Enviado.");
  });

  it("con el mensaje de otro corredor no hace nada", async () => {
    await redirigeA(panel.descartar(formulario({ mensaje: ID.mensajeAjeno })));
    expect(backend.descartarBorrador).not.toHaveBeenCalled();
  });
});
