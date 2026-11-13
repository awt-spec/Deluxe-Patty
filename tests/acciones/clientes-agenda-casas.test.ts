import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("next/server", () => import("./mocks/servidor-next"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => import("./mocks/dependencias"));
vi.mock("@/lib/panel/visitas", () => ({
  crearVisita: vi.fn(async () => ({ ok: true, aviso: "Agendada." })),
  moverVisita: vi.fn(async () => ({ ok: true, aviso: "Movida." })),
  cambiarVisita: vi.fn(async () => ({ ok: true, aviso: "Listo." })),
}));

const clientes = await import("@/app/panel/clientes/acciones");
const agenda = await import("@/app/panel/agenda/acciones");
const casas = await import("@/app/panel/propiedades/acciones");
const visitas = await import("@/lib/panel/visitas");

const corredor = { id: ID.deluxe, activo: true, zona_horaria: "America/Costa_Rica", comision_pct: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  const filas = {
    contactos: [
      { id: ID.cliente, corredor_id: ID.deluxe, etapa: "interesado", cierre_at: null, propiedad_interes_id: null, telefono: "+50688880001" },
      { id: ID.clienteAjeno, corredor_id: ID.otro, etapa: "interesado", cierre_at: null, propiedad_interes_id: null, telefono: "+50688880002" },
    ],
    citas: [
      { id: ID.cita, corredor_id: ID.deluxe },
      { id: ID.citaAjena, corredor_id: ID.otro },
    ],
    bloqueos_agenda: [
      { id: "70000000-0000-4000-8000-000000000001", corredor_id: ID.deluxe },
      { id: "70000000-0000-4000-8000-000000000002", corredor_id: ID.otro },
    ],
    propiedades: [
      { id: ID.casa, corredor_id: ID.deluxe, codigo: "DP-1", fotos: [], estado: "activa" },
      { id: ID.casaAjena, corredor_id: ID.otro, codigo: "OT-1", fotos: [], estado: "activa" },
    ],
  };
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso(filas) };
  // El backend ve lo mismo (en producción, sin RLS): las acciones tienen que filtrar igual.
  estado.admin = supabaseFalso(structuredClone(filas));
});

const escrituras = () => [...estado.sesion!.supabase.escrituras, ...estado.admin.escrituras];

describe("Clientes: anotar en la Historia", () => {
  const anotaciones = () => estado.admin.tablas.actividades ?? [];

  it("un doble toque idéntico crea una sola anotación", async () => {
    await redirigeA(clientes.anotarActividad(formulario({ id: ID.cliente, tipo: "llamada" })));
    await redirigeA(clientes.anotarActividad(formulario({ id: ID.cliente, tipo: "llamada" })));
    expect(anotaciones()).toHaveLength(1);
    expect(anotaciones()[0]).toMatchObject({ corredor_id: ID.deluxe, contacto_id: ID.cliente, tipo: "llamada" });
  });

  it("otro tipo o texto distinto sí se anota", async () => {
    await redirigeA(clientes.anotarActividad(formulario({ id: ID.cliente, tipo: "llamada" })));
    await redirigeA(clientes.anotarActividad(formulario({ id: ID.cliente, tipo: "mensaje" })));
    expect(anotaciones()).toHaveLength(2);
  });

  it("con un cliente de otro corredor no escribe nada", async () => {
    await redirigeA(clientes.anotarActividad(formulario({ id: ID.clienteAjeno, tipo: "llamada" })));
    expect(escrituras()).toEqual([]);
  });
});

describe("Clientes: solo los del propio corredor", () => {
  it("cambiar la etapa de un cliente ajeno no escribe nada", async () => {
    await redirigeA(clientes.cambiarEtapa(formulario({ id: ID.clienteAjeno, etapa: "perdido" })));
    expect(escrituras()).toEqual([]);
  });

  it("mover en el tablero un cliente ajeno devuelve false y no escribe; una etapa inventada tampoco", async () => {
    expect(await clientes.moverEtapa(ID.clienteAjeno, "cerrado")).toBe(false);
    expect(await clientes.moverEtapa(ID.cliente, "vendido-a-mi-primo")).toBe(false);
    expect(await clientes.moverEtapa("1 or 1=1", "cerrado")).toBe(false);
    expect(escrituras()).toEqual([]);
  });

  it("mover el propio guarda la etapa (filtrando por corredor) y anota la historia", async () => {
    expect(await clientes.moverEtapa(ID.cliente, "visita")).toBe(true);
    const cambio = estado.sesion!.supabase.escrituras[0];
    expect(cambio).toMatchObject({ tabla: "contactos", op: "update", filtros: [["corredor_id", ID.deluxe], ["id", ID.cliente]] });
    expect(cambio.valores).toMatchObject({ etapa: "visita" });
    expect(estado.admin.escrituras.some((e) => e.tabla === "actividades")).toBe(true);
  });

  it("cerrar desde el tablero un cliente ajeno no registra el cierre", async () => {
    const r = await clientes.cerrarDesdeTablero(ID.clienteAjeno, { precio: "450000", moneda: "USD", comision: "22500" });
    expect(r).toEqual({ ok: false, motivo: "No se encontró el cliente." });
    expect(escrituras()).toEqual([]);
  });

  it("cerrar sin precio pide el precio", async () => {
    expect(await clientes.cerrarDesdeTablero(ID.cliente, { precio: "", moneda: "USD", comision: "" })).toEqual({ ok: false, motivo: "Escribe el precio final." });
  });

  it("unir con un cliente de otro corredor no llama a la unión", async () => {
    await redirigeA(clientes.unirCliente(formulario({ id: ID.cliente, otro: ID.clienteAjeno })));
    expect(estado.admin.rpcs).toEqual([]);
  });

  it("agregar un cliente con teléfono inválido no lo crea", async () => {
    const url = await redirigeA(clientes.agregarCliente(formulario({ telefono: "123", nombre: "Ana" })));
    expect(url).toMatch(/^\/panel\/clientes\/nuevo\?aviso=/);
    expect(escrituras()).toEqual([]);
  });
});

describe("Agenda: visitas y bloqueos propios", () => {
  it("mover o cambiar una visita ajena no la toca", async () => {
    await redirigeA(agenda.moverLaVisita(formulario({ id: ID.citaAjena, fecha: "2026-12-01", hora: "10:00" })));
    await redirigeA(agenda.cambiarLaVisita(formulario({ id: ID.citaAjena, estado: "cancelada" })));
    expect(visitas.moverVisita).not.toHaveBeenCalled();
    expect(visitas.cambiarVisita).not.toHaveBeenCalled();
  });

  it("un estado de visita inventado no llega a cambiarla", async () => {
    await redirigeA(agenda.cambiarLaVisita(formulario({ id: ID.cita, estado: "borrada" })));
    expect(visitas.cambiarVisita).not.toHaveBeenCalled();
  });

  it("agendar con un cliente de otro corredor no crea la visita", async () => {
    const url = await redirigeA(agenda.agendarVisita(formulario({ cliente: ID.clienteAjeno, fecha: "2026-12-01", hora: "10:00", volver: "/panel/agenda" })));
    expect(decodeURIComponent(url)).toMatch(/No encontré ese cliente/);
    expect(visitas.crearVisita).not.toHaveBeenCalled();
  });

  it("quitar un bloqueo filtra siempre por el corredor de la sesión", async () => {
    await redirigeA(agenda.quitarBloqueoAgenda(formulario({ id: "70000000-0000-4000-8000-000000000002" })));
    const borrado = estado.sesion!.supabase.escrituras[0];
    expect(borrado).toMatchObject({ op: "delete", filtros: [["corredor_id", ID.deluxe], ["id", "70000000-0000-4000-8000-000000000002"]] });
    // El bloqueo del otro corredor sigue ahí.
    expect(estado.sesion!.supabase.tablas.bloqueos_agenda.map((b) => b.corredor_id)).toContain(ID.otro);
  });
});

describe("Mis casas: solo las propias, y fotos solo en su carpeta", () => {
  it("cambiar el estado de una casa ajena no escribe", async () => {
    const url = await redirigeA(casas.cambiarEstado(formulario({ id: ID.casaAjena, estado: "vendida" })));
    expect(decodeURIComponent(url)).toMatch(/No encontré la propiedad/);
    expect(escrituras()).toEqual([]);
  });

  it("no da permisos de subida para una casa ajena", async () => {
    await expect(casas.pedirSubidas(ID.casaAjena, ["a.jpg"])).rejects.toMatchObject({ url: expect.stringMatching(/No%20encontr/) });
  });

  it("los permisos de subida van a la carpeta del corredor y la casa, y tienen límite", async () => {
    const subidas = await casas.pedirSubidas(ID.casa, ["sala.JPG", "cocina.png"]);
    expect(Array.isArray(subidas) && subidas.every((s) => s.camino.startsWith(`${ID.deluxe}/${ID.casa}/originales/`))).toBe(true);
    expect(await casas.pedirSubidas(ID.casa, Array.from({ length: 13 }, (_, i) => `${i}.jpg`))).toMatchObject({ error: expect.stringMatching(/hasta 30 fotos/) });
  });

  it("registrar fotos rechaza rutas fuera de la carpeta de la casa (otro corredor, otra casa, ../)", async () => {
    const bueno = `${ID.deluxe}/${ID.casa}/originales/1700000000-abc123.jpg`;
    for (const malo of [
      `${ID.otro}/${ID.casa}/originales/1700000000-abc123.jpg`,
      `${ID.deluxe}/${ID.casaAjena}/originales/1700000000-abc123.jpg`,
      `${ID.deluxe}/${ID.casa}/originales/../../x.jpg`,
      `${ID.deluxe}/${ID.casa}/originales/1700000000-abc123.exe`,
    ]) {
      expect(await casas.registrarFotos(ID.casa, [bueno, malo]), malo).toEqual({ error: "Alguna foto no se reconoció." });
    }
    expect(estado.admin.escrituras).toEqual([]);
    expect(await casas.registrarFotos(ID.casa, [bueno])).toEqual({ guardadas: 1, descartadas: 0 });
    expect(estado.admin.escrituras[0]).toMatchObject({ tabla: "propiedades", filtros: [["corredor_id", ID.deluxe], ["id", ID.casa]] });
  });

  it("con la casa en 28 fotos y 5 nuevas guarda 2 y dice que descartó 3", async () => {
    const fotos = Array.from({ length: 28 }, (_, i) => ({ url: `https://fotos.publicas/x/${i}.jpg`, orden: i + 1 }));
    const filas = { propiedades: [{ id: ID.casa, corredor_id: ID.deluxe, codigo: "DP-1", fotos, estado: "activa" }] };
    estado.sesion!.supabase = supabaseFalso(filas);
    estado.admin = supabaseFalso(structuredClone(filas));
    const caminos = Array.from({ length: 5 }, (_, i) => `${ID.deluxe}/${ID.casa}/originales/170000000${i}-abc123.jpg`);
    expect(await casas.registrarFotos(ID.casa, caminos)).toEqual({ guardadas: 2, descartadas: 3 });
    const e = estado.admin.escrituras[0] as { datos?: { fotos?: unknown[] } };
    expect(JSON.stringify(e)).toContain("170000000");
  });

  it("registrar fotos de una casa ajena no escribe", async () => {
    const caminos = [`${ID.otro}/${ID.casaAjena}/originales/1700000000-abc123.jpg`];
    await expect(casas.registrarFotos(ID.casaAjena, caminos)).rejects.toMatchObject({ url: expect.stringMatching(/No%20encontr/) });
    expect(estado.admin.escrituras).toEqual([]);
  });

  it("la cuenta de demostración no sube archivos", async () => {
    estado.sesion!.corredor = { ...corredor, activo: false };
    expect(await casas.pedirSubidas(ID.casa, ["a.jpg"])).toMatchObject({ error: expect.any(String) });
  });
});
