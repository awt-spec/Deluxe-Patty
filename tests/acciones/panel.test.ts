import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
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

const acciones = await import("@/app/panel/acciones");
const backend = await import("@/lib/panel/acciones");

const corredor = { id: ID.deluxe, activo: true, whatsapp_phone_number_id: "1351409154732533", nombre: "Deluxe" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // La sesión del corredor ve filas de los dos corredores: cada acción tiene que filtrar por el suyo.
  estado.sesion = {
    corredor,
    usuario: { id: ID.usuario, email: "patricia@ejemplo.com" },
    supabase: supabaseFalso({
      mensajes: [
        { id: ID.mensaje, corredor_id: ID.deluxe, conversacion_id: ID.conversacion, estado_borrador: "pendiente" },
        { id: ID.mensajeAjeno, corredor_id: ID.otro, conversacion_id: ID.conversacionAjena, estado_borrador: "pendiente" },
      ],
      conversaciones: [
        { id: ID.conversacion, corredor_id: ID.deluxe, contactos: { telefono: "+506 8888-0001" } },
        { id: ID.conversacionAjena, corredor_id: ID.otro, contactos: { telefono: "+506 8888-0002" } },
      ],
    }),
  };
  estado.admin = supabaseFalso();
});

const aviso = (url: string) => new URL(url, "https://x").searchParams.get("aviso");

describe("Respuestas propuestas: solo las del propio corredor", () => {
  it("aprobar una respuesta de otro corredor no hace nada", async () => {
    const url = await redirigeA(acciones.aprobar(formulario({ mensaje: ID.mensajeAjeno, texto: "hola" })));
    expect(aviso(url)).toBe("No encontré el mensaje.");
    expect(backend.aprobarBorrador).not.toHaveBeenCalled();
  });

  it("aprobar la propia la manda con el texto corregido y vuelve a la conversación", async () => {
    const url = await redirigeA(acciones.aprobar(formulario({ mensaje: ID.mensaje, texto: "Hola, sí está disponible" })));
    expect(backend.aprobarBorrador).toHaveBeenCalledWith(expect.anything(), corredor, ID.mensaje, "Hola, sí está disponible");
    expect(url).toBe(`/panel/conversaciones/${ID.conversacion}?aviso=Enviado.`);
  });

  it("solo vuelve a Inicio o a Revisar; cualquier otra dirección se ignora (nada de redirigir afuera)", async () => {
    expect(await redirigeA(acciones.aprobar(formulario({ mensaje: ID.mensaje, volver: "/panel/revisar" })))).toMatch(/^\/panel\/revisar\?/);
    expect(await redirigeA(acciones.aprobar(formulario({ mensaje: ID.mensaje, volver: "https://malo.example" })))).toMatch(/^\/panel\/conversaciones\//);
  });

  it("descartar una ajena tampoco hace nada", async () => {
    await redirigeA(acciones.descartar(formulario({ mensaje: ID.mensajeAjeno })));
    expect(backend.descartarBorrador).not.toHaveBeenCalled();
  });

  it("sin sesión, a la entrada", async () => {
    estado.sesion = null;
    expect(await redirigeA(acciones.aprobar(formulario({ mensaje: ID.mensaje })))).toBe("/entrar");
    expect(backend.aprobarBorrador).not.toHaveBeenCalled();
  });
});

describe("Chats: tomar, devolver y escribir solo en los propios", () => {
  it("con un chat de otro corredor no se toma, no se devuelve ni se escribe", async () => {
    for (const accion of [acciones.tomar, acciones.devolver, acciones.escribir]) {
      const url = await redirigeA(accion(formulario({ conversacion: ID.conversacionAjena, texto: "hola" })));
      expect(aviso(url)).toBe("No encontré la conversación.");
    }
    expect(backend.tomarControl).not.toHaveBeenCalled();
    expect(backend.devolverControl).not.toHaveBeenCalled();
    expect(backend.escribirComoCorredor).not.toHaveBeenCalled();
  });

  it("escribir en el propio manda el texto como el corredor", async () => {
    await redirigeA(acciones.escribir(formulario({ conversacion: ID.conversacion, texto: "Paso a las 3" })));
    expect(backend.escribirComoCorredor).toHaveBeenCalledWith(expect.anything(), corredor, ID.conversacion, "Paso a las 3");
  });

  it("«Le escribo yo» en un chat ajeno no descarta ni toma nada", async () => {
    const url = await redirigeA(acciones.yoLeEscribo(formulario({ conversacion: ID.conversacionAjena })));
    expect(aviso(url)).toBe("No encontré el chat.");
    expect(backend.descartarBorrador).not.toHaveBeenCalled();
    expect(backend.tomarControl).not.toHaveBeenCalled();
  });

  it("«Le escribo yo» en el propio descarta lo pendiente de ese chat, lo toma y abre WhatsApp con el cliente", async () => {
    const url = await redirigeA(acciones.yoLeEscribo(formulario({ conversacion: ID.conversacion })));
    expect(backend.descartarBorrador).toHaveBeenCalledTimes(1);
    expect(backend.descartarBorrador).toHaveBeenCalledWith(expect.anything(), corredor, ID.mensaje);
    expect(backend.tomarControl).toHaveBeenCalledWith(expect.anything(), corredor, ID.conversacion);
    expect(url).toBe("https://wa.me/50688880001");
  });
});

describe("Probar WhatsApp desde Ajustes", () => {
  const prueba = (url: string) => new URL(url, "https://x").searchParams.get("prueba");

  it("pide el celular con código de país", async () => {
    expect(prueba(await redirigeA(acciones.probarWhatsApp(formulario({ telefono: "12" }))))).toMatch(/código de país/);
  });

  it("la cuenta de demostración nunca manda nada", async () => {
    estado.sesion!.corredor = { ...corredor, activo: false };
    expect(prueba(await redirigeA(acciones.probarWhatsApp(formulario({ telefono: "+50663473842" }))))).toMatch(/demostración/);
  });

  it("una prueba cada 5 minutos: si ya hubo una, no manda otra", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-de-prueba");
    const enviar = vi.spyOn(globalThis, "fetch");
    estado.admin.respuestasRpc.reclamar_alerta = false;
    const url = await redirigeA(acciones.probarWhatsApp(formulario({ telefono: "+50663473842" })));
    expect(prueba(url)).toMatch(/Espera 5 minutos/);
    expect(estado.admin.rpcs[0]).toEqual({ nombre: "reclamar_alerta", args: { p_clave: `prueba_whatsapp:${ID.deluxe}`, p_minutos: 5 } });
    expect(enviar).not.toHaveBeenCalled();
    enviar.mockRestore();
  });

  it("el resultado vuelve a la tarjeta (antes del ancla #probar-whatsapp)", async () => {
    const url = await redirigeA(acciones.probarWhatsApp(formulario({ telefono: "12" })));
    expect(url).toMatch(/^\/panel\/ajustes\?prueba=.+&ok=0#probar-whatsapp$/);
  });
});

describe("Ajustes desde las guías paso a paso (guardarAjustes con solo y volver)", () => {
  const filas = () => [
    { id: ID.deluxe, corredor_id: ID.deluxe, tono: "", reglas_escalamiento: ["Quejas"], respuesta_automatica: false, hora_plan_dia: "06:30" },
    { id: ID.otro, corredor_id: ID.otro, tono: "del otro", reglas_escalamiento: [], respuesta_automatica: false, hora_plan_dia: "08:00" },
  ];

  it("solo=tono cambia solo el tono del propio corredor y vuelve a la puesta en marcha", async () => {
    const db = supabaseFalso({ corredores: filas() });
    estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: db };
    const url = await redirigeA(acciones.guardarAjustes(formulario({ solo: "tono", tono: "  Cordial, de usted  ", volver: "/panel/empezar" })));
    expect(url).toBe("/panel/empezar?aviso=Guardado.");
    const [w] = db.escrituras;
    expect(w).toMatchObject({ tabla: "corredores", op: "update", valores: { tono: "Cordial, de usted" } });
    expect(Object.keys(w.valores as object)).toEqual(["tono"]);
    expect(w.filtros).toContainEqual(["id", ID.deluxe]);
  });

  it("solo=respuesta_automatica la enciende sin tocar el horario del plan ni los temas", async () => {
    const db = supabaseFalso({ corredores: filas() });
    estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: db };
    await redirigeA(acciones.guardarAjustes(formulario({ solo: "respuesta_automatica", respuesta_automatica: "on", volver: "/panel/empezar/sola" })));
    expect(db.escrituras[0].valores).toEqual({ respuesta_automatica: true });
  });

  it("con datos de otro corredor no hace nada: el id del formulario se ignora y la fila ajena queda igual", async () => {
    const db = supabaseFalso({ corredores: filas() });
    estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: db };
    await redirigeA(acciones.guardarAjustes(formulario({ solo: "tono", tono: "hackeado", id: ID.otro, corredor_id: ID.otro })));
    expect(db.escrituras.every((w) => w.filtros.some(([c, v]) => c === "id" && v === ID.deluxe))).toBe(true);
    expect(db.escrituras.some((w) => w.filtros.some(([, v]) => v === ID.otro))).toBe(false);
  });

  it("solo con un campo desconocido guarda el formulario completo, y volver solo acepta rutas de la lista", async () => {
    const db = supabaseFalso({ corredores: filas() });
    estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: db };
    const url = await redirigeA(acciones.guardarAjustes(formulario({ solo: "token_calendario", tono: "x", volver: "https://malo.example" })));
    expect(url).toMatch(/^\/panel\/ajustes\?/);
    expect(Object.keys(db.escrituras[0].valores as object)).toContain("hora_plan_dia");
    expect(Object.keys(db.escrituras[0].valores as object)).not.toContain("token_calendario");
  });
});
