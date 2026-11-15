import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// --- Correcciones de QA: dinero, agenda y horario ------------------------------------------------------

const horario = await import("@/app/panel/agenda/horario/acciones");

describe("Clientes: una oferta que no se entiende no borra la que había", () => {
  const conOferta = () => {
    for (const db of [estado.sesion!.supabase, estado.admin]) Object.assign(db.tablas.contactos[0], { oferta_monto: 450_000, oferta_moneda: "USD" });
  };
  const oferta = () => estado.admin.tablas.contactos[0].oferta_monto;

  it("'-5', 'abc', '12 millones' y '0' avisan y no escriben nada", async () => {
    conOferta();
    for (const malo of ["-5", "abc", "12 millones", "0"]) {
      const url = decodeURIComponent(await redirigeA(clientes.guardarOportunidad(formulario({ id: ID.cliente, oferta: malo, oferta_moneda: "USD" }))));
      expect(url, malo).toMatch(/Revisa la oferta|mayor que cero/);
      expect(url, malo).not.toMatch(/Guardado/);
    }
    expect(escrituras()).toEqual([]);
    expect(oferta()).toBe(450_000);
  });

  it("'1.250.000,50' se entiende y se guarda", async () => {
    conOferta();
    await redirigeA(clientes.guardarOportunidad(formulario({ id: ID.cliente, oferta: "1.250.000,50", oferta_moneda: "USD" })));
    expect(oferta()).toBe(1_250_000.5);
  });

  it("vacía, a propósito, quita la oferta", async () => {
    conOferta();
    await redirigeA(clientes.guardarOportunidad(formulario({ id: ID.cliente, oferta: "", oferta_moneda: "USD" })));
    expect(oferta()).toBeNull();
  });

  it("con un cliente de otro corredor no hace nada", async () => {
    await redirigeA(clientes.guardarOportunidad(formulario({ id: ID.clienteAjeno, oferta: "500000", oferta_moneda: "USD" })));
    expect(escrituras()).toEqual([]);
  });
});

describe("Clientes: el cierre valida precio y comisión", () => {
  it("una comisión mayor que el precio no se guarda (ficha y tablero)", async () => {
    const url = decodeURIComponent(await redirigeA(clientes.guardarCierre(formulario({ id: ID.cliente, precio: "300000", comision: "150000000", moneda: "USD" }))));
    expect(url).toMatch(/no puede ser mayor que el precio/);
    expect(await clientes.cerrarDesdeTablero(ID.cliente, { precio: "300000", moneda: "USD", comision: "150000000" })).toMatchObject({ ok: false, motivo: expect.stringMatching(/mayor que el precio/) });
    expect(await clientes.cerrarDesdeTablero(ID.cliente, { precio: "-3", moneda: "USD", comision: "" })).toMatchObject({ ok: false });
    expect(escrituras()).toEqual([]);
  });

  it("comisión 0 se guarda como 0; vacía se estima con el 5 %", async () => {
    estado.admin.tablas.contactos[0].busca = { operacion: "venta" };
    await redirigeA(clientes.guardarCierre(formulario({ id: ID.cliente, precio: "300.000", comision: "0", moneda: "USD" })));
    expect(estado.admin.tablas.contactos[0]).toMatchObject({ etapa: "cerrado", cierre_precio: 300_000, cierre_comision: 0 });
    expect(await clientes.cerrarDesdeTablero(ID.cliente, { precio: "300000", moneda: "USD", comision: "" })).toEqual({ ok: true });
    expect(estado.admin.tablas.contactos[0].cierre_comision).toBe(15_000);
  });

  it("guardar o corregir el cierre de un cliente de otro corredor no escribe nada", async () => {
    estado.admin.tablas.contactos[1] = { ...estado.admin.tablas.contactos[1], etapa: "cerrado", cierre_precio: 400_000, cierre_at: "2026-10-01T15:00:00Z" };
    await redirigeA(clientes.guardarCierre(formulario({ id: ID.clienteAjeno, precio: "1", comision: "", moneda: "USD" })));
    expect(escrituras()).toEqual([]);
    expect(estado.admin.tablas.contactos[1]).toMatchObject({ cierre_precio: 400_000 });
  });

  it("corregir un cierre ya anotado cambia las cifras pero no la fecha del cierre ni la de la etapa", async () => {
    Object.assign(estado.admin.tablas.contactos[0], {
      etapa: "cerrado",
      etapa_at: "2026-10-01T15:00:00Z",
      cierre_at: "2026-10-01T15:00:00Z",
      cierre_precio: 300_000,
      cierre_comision: 15_000,
      cierre_moneda: "USD",
      busca: { operacion: "venta" },
    });
    const url = decodeURIComponent(await redirigeA(clientes.guardarCierre(formulario({ id: ID.cliente, precio: "290.000", comision: "14500", moneda: "USD" }))));
    expect(url).toMatch(/cierre corregido/);
    expect(estado.admin.tablas.contactos[0]).toMatchObject({
      etapa: "cerrado",
      etapa_at: "2026-10-01T15:00:00Z",
      cierre_at: "2026-10-01T15:00:00Z",
      cierre_precio: 290_000,
      cierre_comision: 14_500,
    });
    const cambio = estado.admin.escrituras.find((e) => e.tabla === "contactos" && e.op === "update");
    expect(cambio?.filtros).toEqual([["corredor_id", ID.deluxe], ["id", ID.cliente]]);
    expect(estado.admin.tablas.actividades?.at(-1)).toMatchObject({ tipo: "cierre", texto: expect.stringMatching(/^Cierre corregido/) });
  });

  it("guardar las notas con caracteres de dirección los quita; notas muy largas avisan sin guardar", async () => {
    await redirigeA(clientes.guardarNotas(formulario({ id: ID.cliente, notas: `abc${String.fromCodePoint(0x202e)}def`, nombre: "Ana" })));
    expect(estado.sesion!.supabase.tablas.contactos[0].notas).toBe("abcdef");
    const antes = escrituras().length;
    const url = decodeURIComponent(await redirigeA(clientes.guardarNotas(formulario({ id: ID.cliente, notas: "x".repeat(4001), nombre: "Ana" }))));
    expect(url).toMatch(/muy largo/);
    expect(escrituras()).toHaveLength(antes);
  });
});

describe("Agenda: visitas a mano revisadas en el servidor", () => {
  const lunes = [1, 2, 3, 4, 5].map((d, i) => ({ id: `h${i}`, corredor_id: ID.deluxe, dia_semana: d, hora_inicio: "08:00:00", hora_fin: "12:00:00" }));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T15:00:00Z")); // lunes 9:00 en Costa Rica
    estado.sesion!.supabase.tablas.horarios_visitas = structuredClone(lunes);
    estado.sesion!.supabase.tablas.citas[0] = { id: ID.cita, corredor_id: ID.deluxe, inicio: "2026-11-17T16:00:00Z", fin: "2026-11-17T17:00:00Z" };
  });
  afterEach(() => vi.useRealTimers());

  const agendar = (extra: Record<string, string>) => redirigeA(agenda.agendarVisita(formulario({ cliente: ID.cliente, minutos: "60", ...extra })));

  it("una hora en el pasado o una fecha que no existe no crea la visita", async () => {
    expect(decodeURIComponent(await agendar({ fecha: "2026-11-10", hora: "10:00" }))).toMatch(/ya pasó/);
    expect(decodeURIComponent(await agendar({ fecha: "2026-02-31", hora: "10:00" }))).toMatch(/Revisa el día y la hora/);
    expect(decodeURIComponent(await agendar({ fecha: "2026-11-17", hora: "25:00" }))).toMatch(/Revisa el día y la hora/);
    expect(visitas.crearVisita).not.toHaveBeenCalled();
  });

  it("fuera del horario pregunta antes; con la confirmación de esa misma hora la agenda", async () => {
    const url = decodeURIComponent(await agendar({ fecha: "2026-11-21", hora: "10:00" }));
    expect(url).toMatch(/fuera de tu horario de visitas\. ¿Agendar igual\?/);
    expect(url).toContain("confirmar=2026-11-21T10:00");
    expect(url).toContain(`cliente=${ID.cliente}`);
    expect(visitas.crearVisita).not.toHaveBeenCalled();
    // Confirmó otra hora (cambió el formulario después de la pregunta): se revisa otra vez.
    await agendar({ fecha: "2026-11-21", hora: "11:00", confirmar: "2026-11-21T10:00" });
    expect(visitas.crearVisita).not.toHaveBeenCalled();
    await agendar({ fecha: "2026-11-21", hora: "10:00", confirmar: "2026-11-21T10:00" });
    expect(visitas.crearVisita).toHaveBeenCalledTimes(1);
  });

  it("dentro del horario agenda sin preguntar", async () => {
    await agendar({ fecha: "2026-11-17", hora: "09:00" });
    expect(visitas.crearVisita).toHaveBeenCalledTimes(1);
  });

  it("mover una visita sobre un rato apartado pregunta '¿Moverla igual?'", async () => {
    estado.sesion!.supabase.tablas.bloqueos_agenda.push({ id: "b-nuevo", corredor_id: ID.deluxe, inicio: "2026-11-18T15:00:00Z", fin: "2026-11-18T17:00:00Z" });
    const url = decodeURIComponent(await redirigeA(agenda.moverLaVisita(formulario({ id: ID.cita, fecha: "2026-11-18", hora: "10:00", avisar: "on" }))));
    expect(url).toMatch(/en un rato que apartaste\. ¿Moverla igual\?/);
    expect(url).toContain("confirmar=2026-11-18T10:00");
    expect(visitas.moverVisita).not.toHaveBeenCalled();
    await redirigeA(agenda.moverLaVisita(formulario({ id: ID.cita, fecha: "2026-11-18", hora: "10:00", avisar: "on", confirmar: "2026-11-18T10:00" })));
    expect(visitas.moverVisita).toHaveBeenCalledTimes(1);
  });

  it("los ratos apartados de otro corredor no cuentan", async () => {
    estado.sesion!.supabase.tablas.bloqueos_agenda.push({ id: "b-ajeno", corredor_id: ID.otro, inicio: "2026-11-18T15:00:00Z", fin: "2026-11-18T17:00:00Z" });
    await redirigeA(agenda.moverLaVisita(formulario({ id: ID.cita, fecha: "2026-11-18", hora: "10:00" })));
    expect(visitas.moverVisita).toHaveBeenCalledTimes(1);
  });
});

describe("Agenda: apartar tiempo con fechas vacías o imposibles", () => {
  it("'Horas exactas' con la fecha vacía avisa en vez de dar error 500", async () => {
    for (const fecha of ["", "2026-02-31", "9999-99-99"]) {
      const url = decodeURIComponent(await redirigeA(agenda.bloquearDesdeAgenda(formulario({ rato: "horas", fecha, hora_desde: "10:00", hora_hasta: "11:00" }))));
      expect(url, fecha).toMatch(/Revisa las fechas/);
    }
    expect(escrituras()).toEqual([]);
  });

  it("la hora de fin antes del inicio avisa y no guarda", async () => {
    const url = decodeURIComponent(await redirigeA(agenda.bloquearDesdeAgenda(formulario({ rato: "horas", fecha: "2030-01-10", hora_desde: "11:00", hora_hasta: "10:00" }))));
    expect(url).toMatch(/después del inicio/);
    expect(escrituras()).toEqual([]);
  });
});

describe("Horario: guardar los turnos nunca deja la agenda vacía por una falla a medias", () => {
  const viejas = () => [
    { id: "v1", corredor_id: ID.deluxe, dia_semana: 1, hora_inicio: "08:00", hora_fin: "12:00" },
    { id: "v2", corredor_id: ID.deluxe, dia_semana: 2, hora_inicio: "08:00", hora_fin: "12:00" },
    { id: "ajena", corredor_id: ID.otro, dia_semana: 1, hora_inicio: "08:00", hora_fin: "17:00" },
  ];

  it("si la inserción falla, el horario de antes queda intacto", async () => {
    const db = estado.sesion!.supabase;
    db.tablas.horarios_visitas = viejas();
    db.errorEn.horarios_visitas = { code: "XX000", message: "falla" };
    const url = decodeURIComponent(await redirigeA(horario.guardarTurnos(formulario({ m3: "on", t3: "on" }))));
    expect(url).toMatch(/quedó el de antes/);
    expect(db.tablas.horarios_visitas.map((h) => h.id)).toEqual(["v1", "v2", "ajena"]);
  });

  it("si sale bien: inserta lo nuevo, borra solo lo viejo del corredor (por id) y no toca lo de otro", async () => {
    const db = estado.sesion!.supabase;
    db.tablas.horarios_visitas = viejas();
    await redirigeA(horario.guardarTurnos(formulario({ m3: "on" })));
    const ops = db.escrituras.map((e) => e.op);
    expect(ops).toEqual(["insert", "delete"]);
    expect(db.escrituras[1].filtros).toContainEqual(["corredor_id", ID.deluxe]);
    expect(db.tablas.horarios_visitas.map((h) => [h.corredor_id, h.dia_semana])).toEqual([
      [ID.otro, 1],
      [ID.deluxe, 3],
    ]);
  });
});
