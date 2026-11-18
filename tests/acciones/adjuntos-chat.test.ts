import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, conAlertasReales, estado, supabaseFalso } from "./entorno";

// Adjuntar en el chat con un cliente: solo en chats propios, solo caminos de la carpeta de ese chat, la demo no manda
// nada y un doble toque no repite el envío.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => ({ dependenciasPara: () => ({}) }));
const enviar = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, aviso: "Enviado." }));
vi.mock("@/lib/panel/acciones", () => ({ enviarAdjuntosComoCorredor: (...a: unknown[]) => enviar(...a) }));

const acciones = await import("@/app/panel/conversaciones/[id]/adjuntos-acciones");

const FOTO = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ENVIO = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const caminoFoto = (conv = ID.conversacion, corredor = ID.deluxe) => `${corredor}/chats/${conv}/${FOTO}.jpg`;

function preparar(activo = true) {
  const filas = () => ({
    conversaciones: [
      { id: ID.conversacion, corredor_id: ID.deluxe },
      { id: ID.conversacionAjena, corredor_id: ID.otro },
    ],
  });
  estado.sesion = {
    corredor: { id: ID.deluxe, activo, whatsapp_phone_number_id: "PNID" },
    usuario: { id: ID.usuario, email: "patricia@ejemplo.com" },
    supabase: conAlertasReales(supabaseFalso(filas())),
  };
  estado.admin = conAlertasReales(supabaseFalso(filas()));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://portal.supabase.co";
  preparar();
});

describe("prepararAdjuntos", () => {
  it("da un permiso por archivo en la carpeta de ese chat", async () => {
    const r = await acciones.prepararAdjuntos(ID.conversacion, [
      { clase: "imagen", nombre: "a.jpg" },
      { clase: "pdf", nombre: "Plano.pdf" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.subidas[0].camino).toMatch(new RegExp(`^${ID.deluxe}/chats/${ID.conversacion}/[0-9a-f-]{36}\\.jpg$`));
    expect(r.subidas[1].camino).toMatch(new RegExp(`^${ID.deluxe}/chats/${ID.conversacion}/[0-9a-f-]{36}/Plano\\.pdf$`));
  });

  it("con un chat de otro corredor no prepara nada", async () => {
    const r = await acciones.prepararAdjuntos(ID.conversacionAjena, [{ clase: "imagen", nombre: "a.jpg" }]);
    expect(r).toEqual({ ok: false, motivo: "No encontré ese chat." });
  });

  it("rechaza tipos que no son foto o PDF y más de 5 archivos", async () => {
    expect((await acciones.prepararAdjuntos(ID.conversacion, [{ clase: "video", nombre: "a.mp4" }])).ok).toBe(false);
    const seis = Array.from({ length: 6 }, () => ({ clase: "imagen", nombre: "a.jpg" }));
    expect((await acciones.prepararAdjuntos(ID.conversacion, seis)).ok).toBe(false);
  });

  it("en la demo no se sube nada", async () => {
    preparar(false);
    const r = await acciones.prepararAdjuntos(ID.conversacion, [{ clase: "imagen", nombre: "a.jpg" }]);
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/demostración/) });
  });
});

describe("enviarAdjuntos", () => {
  it("manda lo subido con su dirección pública", async () => {
    const r = await acciones.enviarAdjuntos({ conversacion: ID.conversacion, caminos: [caminoFoto()], texto: "Mire", envio: ENVIO });
    expect(r).toEqual({ ok: true, aviso: "Enviado." });
    expect(enviar.mock.calls[0][3]).toEqual([
      { clase: "imagen", url: `https://portal.supabase.co/storage/v1/object/public/fotos/${caminoFoto()}`, nombre: "foto.jpg" },
    ]);
    expect(enviar.mock.calls[0][4]).toBe("Mire");
  });

  it("con un chat de otro corredor, o un archivo de otro chat, no manda nada", async () => {
    expect((await acciones.enviarAdjuntos({ conversacion: ID.conversacionAjena, caminos: [caminoFoto(ID.conversacionAjena, ID.otro)], texto: "", envio: ENVIO })).ok).toBe(false);
    expect((await acciones.enviarAdjuntos({ conversacion: ID.conversacion, caminos: [caminoFoto(ID.conversacionAjena)], texto: "", envio: ENVIO })).ok).toBe(false);
    expect((await acciones.enviarAdjuntos({ conversacion: ID.conversacion, caminos: [caminoFoto(ID.conversacion, ID.otro)], texto: "", envio: ENVIO })).ok).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("un doble toque no manda los archivos dos veces", async () => {
    const p = { conversacion: ID.conversacion, caminos: [caminoFoto()], texto: "", envio: ENVIO };
    await acciones.enviarAdjuntos(p);
    const r = await acciones.enviarAdjuntos(p);
    expect(r.ok).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("en la demo no manda nada", async () => {
    preparar(false);
    const r = await acciones.enviarAdjuntos({ conversacion: ID.conversacion, caminos: [caminoFoto()], texto: "", envio: ENVIO });
    expect(r.ok).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });
});
