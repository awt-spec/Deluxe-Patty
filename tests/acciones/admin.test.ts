import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, NoEncontrado, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/admin/superadmin", () => import("./mocks/superadmin"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

const acciones = await import("@/app/admin/acciones");

const SUPER = "dueno@ejemplo.com";

beforeEach(() => {
  estado.superadmin = SUPER;
  estado.admin = supabaseFalso({
    corredores: [{ id: ID.deluxe, activo: true, whatsapp_phone_number_id: "1351409154732533" }],
    superadmins: [{ correo: SUPER }, { correo: "patricia@ejemplo.com" }],
    miembros: [],
    plataforma: [{ id: true, tope_ia_dia_usd: 10, tope_ia_mes_usd: 150 }],
  });
  estado.admin.usuarios = [{ id: ID.usuario, email: "patricia@ejemplo.com" }];
  vi.unstubAllEnvs();
});

const mensaje = (url: string) => new URL(url, "https://x").searchParams.get("m");

describe("/admin: solo el superadministrador", () => {
  it("cada acción responde 404 a quien no es superadmin y no escribe nada", async () => {
    estado.superadmin = null;
    const f = formulario({ id: ID.deluxe, correo: "x@ejemplo.com", hacer: "1", contrasena: "una-clave-larga", telefono: "+50688888888", pin: "123456", waba: "12345", app_id: "12345", corredor_id: ID.deluxe, user_id: ID.usuario, tope_dia: "1", tope_mes: "1", tope_mensajes: "10", aviso_mensajes: "5" });
    const nombres = Object.keys(acciones) as (keyof typeof acciones)[];
    expect(nombres.length).toBeGreaterThanOrEqual(12);
    for (const n of nombres) {
      await expect(acciones[n](f), n).rejects.toBeInstanceOf(NoEncontrado);
    }
    expect(estado.admin.escrituras).toEqual([]);
    expect(estado.admin.usuariosCreados).toEqual([]);
    expect(estado.admin.contrasenas).toEqual([]);
  });
});

describe("Datos y WhatsApp de un corredor", () => {
  it("guarda los números normalizados y las casillas", async () => {
    const url = await redirigeA(
      acciones.guardarDatosCorredor(
        formulario({ id: ID.deluxe, phone_number_id: "1351409154732533", whatsapp_numero: "8888 8888", whatsapp_corredor: "506 6347-3842", activo: "on" }),
      ),
    );
    expect(mensaje(url)).toBe("Datos guardados.");
    expect(estado.admin.escrituras[0]).toMatchObject({
      tabla: "corredores",
      op: "update",
      filtros: [["id", ID.deluxe]],
      valores: { whatsapp_numero: "+50688888888", whatsapp_corredor: "+50663473842", activo: true, respuesta_automatica: false },
    });
  });

  it("rechaza un Phone number ID que no es número y un celular inválido, sin escribir", async () => {
    expect(mensaje(await redirigeA(acciones.guardarDatosCorredor(formulario({ id: ID.deluxe, phone_number_id: "abc" }))))).toMatch(/solo números/);
    expect(mensaje(await redirigeA(acciones.guardarDatosCorredor(formulario({ id: ID.deluxe, whatsapp_corredor: "123" }))))).toMatch(/celular del corredor no es válido/);
    expect(estado.admin.escrituras).toEqual([]);
  });

  it("un número que ya usa otro corredor da un mensaje claro", async () => {
    estado.admin.errorEn.corredores = { code: "23505" };
    const url = await redirigeA(acciones.guardarDatosCorredor(formulario({ id: ID.deluxe, phone_number_id: "1351409154732533" })));
    expect(mensaje(url)).toBe("Ese número ya lo usa otro corredor.");
  });

  it("un id que no es un uuid no llega a la base", async () => {
    await redirigeA(acciones.guardarDatosCorredor(formulario({ id: "1 or 1=1" })));
    expect(estado.admin.escrituras).toEqual([]);
  });
});

describe("Topes", () => {
  it("guarda topes de IA y de mensajes del corredor", async () => {
    const url = await redirigeA(acciones.guardarTopesCorredor(formulario({ id: ID.deluxe, tope_dia: "2,5", tope_mes: "", tope_mensajes: "1500", aviso_mensajes: "1200", imagenes: "on" })));
    expect(mensaje(url)).toBe("Topes guardados.");
    expect(estado.admin.escrituras[0].valores).toEqual({ tope_ia_dia_usd: 2.5, tope_ia_mes_usd: null, imagenes_activas: true, tope_mensajes_mes: 1500, aviso_mensajes_mes: 1200 });
  });

  it("el aviso no puede pasar el tope y los montos fuera de rango no se guardan", async () => {
    expect(mensaje(await redirigeA(acciones.guardarTopesCorredor(formulario({ id: ID.deluxe, tope_mensajes: "100", aviso_mensajes: "200" }))))).toMatch(/aviso no puede ser mayor/);
    expect(mensaje(await redirigeA(acciones.guardarTopesCorredor(formulario({ id: ID.deluxe, tope_dia: "-3", tope_mensajes: "100", aviso_mensajes: "90" }))))).toMatch(/Revisa los montos/);
    expect(mensaje(await redirigeA(acciones.guardarTopesPlataforma(formulario({ tope_dia: "", tope_mes: "150" }))))).toMatch(/Revisa los montos/);
    expect(estado.admin.escrituras).toEqual([]);
  });
});

describe("Accesos", () => {
  it("crea un usuario con contraseña y lo enlaza al corredor elegido", async () => {
    const url = await redirigeA(acciones.crearUsuario(formulario({ correo: "Nuevo@Ejemplo.com", contrasena: "clave-de-diez", corredor_id: ID.deluxe, rol: "corredor" })));
    expect(mensaje(url)).toMatch(/Usuario creado/);
    expect(estado.admin.usuariosCreados).toEqual([{ email: "nuevo@ejemplo.com", password: "clave-de-diez" }]);
    expect(estado.admin.escrituras[0]).toMatchObject({ tabla: "miembros", op: "upsert", valores: { corredor_id: ID.deluxe, rol: "corredor" } });
  });

  it("una contraseña corta o un correo incompleto no crean nada", async () => {
    expect(mensaje(await redirigeA(acciones.crearUsuario(formulario({ correo: "a@b.co", contrasena: "corta" }))))).toMatch(/entre 10 y 72/);
    expect(mensaje(await redirigeA(acciones.crearUsuario(formulario({ correo: "sin-arroba", contrasena: "clave-de-diez" }))))).toMatch(/incompleto/);
    expect(estado.admin.usuariosCreados).toEqual([]);
  });

  it("dar acceso a un correo sin usuario lo dice, sin escribir", async () => {
    const url = await redirigeA(acciones.darAcceso(formulario({ corredor_id: ID.deluxe, correo: "nadie@ejemplo.com" })));
    expect(mensaje(url)).toMatch(/todavía no tiene usuario/);
    expect(estado.admin.escrituras).toEqual([]);
  });

  it("nadie se quita a sí mismo el superadmin ni se deja la plataforma sin ninguno", async () => {
    expect(mensaje(await redirigeA(acciones.alternarSuperadmin(formulario({ correo: SUPER, hacer: "0" }))))).toMatch(/a ti mismo/);
    estado.admin.tablas.superadmins = [{ correo: SUPER }];
    estado.superadmin = "otro@ejemplo.com";
    expect(mensaje(await redirigeA(acciones.alternarSuperadmin(formulario({ correo: SUPER, hacer: "0" }))))).toMatch(/al menos un superadministrador/);
    expect(estado.admin.escrituras).toEqual([]);
  });

  it("quita el permiso a otro superadmin cuando quedan más", async () => {
    const url = await redirigeA(acciones.alternarSuperadmin(formulario({ correo: "patricia@ejemplo.com", hacer: "0" })));
    expect(mensaje(url)).toBe("Ya no es superadministrador.");
    expect(estado.admin.escrituras[0]).toMatchObject({ tabla: "superadmins", op: "delete", filtros: [["correo", "patricia@ejemplo.com"]] });
  });
});

describe("El resultado se ve", () => {
  it("con ancla (#accesos, #probar) el mensaje va antes del #, donde la página lo lee", async () => {
    const url = await redirigeA(acciones.darAcceso(formulario({ corredor_id: ID.deluxe, correo: "nadie@ejemplo.com" })));
    expect(url).toMatch(new RegExp(`^/admin/corredores/${ID.deluxe}\\?m=.+&ok=0#accesos$`));
    const prueba = await redirigeA(acciones.probarWhatsApp(formulario({ id: ID.deluxe, telefono: "123" })));
    expect(prueba).toMatch(/\?m=.+#probar$/);
    expect(mensaje(prueba)).toMatch(/código de país/);
  });
});

describe("Conexión con Meta", () => {
  it("el PIN tiene que ser de 6 números y el webhook pide las llaves antes de llamar a Meta", async () => {
    const fetchEspia = vi.spyOn(globalThis, "fetch");
    expect(mensaje(await redirigeA(acciones.registrarNumeroWhatsApp(formulario({ id: ID.deluxe, pin: "12ab" }))))).toMatch(/6 números/);
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "");
    expect(mensaje(await redirigeA(acciones.conectarWebhook(formulario({ app_id: "123456789" }))))).toMatch(/Faltan WHATSAPP_APP_SECRET/);
    expect(fetchEspia).not.toHaveBeenCalled();
    fetchEspia.mockRestore();
  });
});
