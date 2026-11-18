import { describe, expect, it, vi } from "vitest";
import {
  caminoAdjunto,
  claseDeArchivo,
  contenidoAdjunto,
  leerCaminoAdjunto,
  leerContenidoAdjunto,
  leerMedioCliente,
  leerNotaDeVoz,
  nombreSeguro,
  problemaDeArchivo,
  urlAdjunto,
} from "../lib/panel/adjuntos-chat";
import { enviarAdjuntosComoCorredor } from "../lib/panel/acciones";
import type { Dependencias } from "../lib/asistente/contexto";
import type { Corredor } from "../lib/datos/tipos";

// Fotos y PDF que el corredor le manda a un cliente desde el chat del panel.

const C = "00000000-0000-4000-8000-000000000001";
const CONV = "30000000-0000-4000-8000-000000000001";
const OTRA = "30000000-0000-4000-8000-000000000002";
const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("reglas de adjuntos del chat", () => {
  it("acepta fotos y PDF; Word, Excel y video no", () => {
    expect(claseDeArchivo("image/jpeg", "a.jpg")).toBe("imagen");
    expect(claseDeArchivo("image/heic", "a.heic")).toBe("imagen");
    expect(claseDeArchivo("application/pdf", "a.pdf")).toBe("pdf");
    expect(claseDeArchivo("", "plano.PDF")).toBe("pdf");
    for (const [t, n] of [
      ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx"],
      ["video/mp4", "a.mp4"],
      ["image/gif", "a.gif"],
      ["text/html", "a.pdf"],
    ]) {
      expect(claseDeArchivo(t, n)).toBeNull();
    }
    expect(problemaDeArchivo("application/msword", "a.doc", 10)).toMatch(/fotos y PDF/);
    expect(problemaDeArchivo("application/pdf", "a.pdf", 16 * 1024 * 1024)).toMatch(/15 MB/);
    expect(problemaDeArchivo("application/pdf", "a.pdf", 1000)).toBeNull();
  });

  it("el nombre del PDF queda limpio y siempre termina en .pdf", () => {
    expect(nombreSeguro("Contrato de Arrendamiento – Escazú.pdf")).toBe("Contrato de Arrendamiento Escazu.pdf");
    expect(nombreSeguro("../../etc/passwd")).toBe("passwd.pdf");
    expect(nombreSeguro("")).toBe("documento.pdf");
    expect(nombreSeguro("x".repeat(200)).length).toBeLessThanOrEqual(64);
  });

  it("solo reconoce caminos de la carpeta de ESE chat de ESE corredor", () => {
    const foto = caminoAdjunto(C, CONV, "imagen", ID);
    const pdf = caminoAdjunto(C, CONV, "pdf", ID, "Plano casa.pdf");
    expect(foto).toBe(`${C}/chats/${CONV}/${ID}.jpg`);
    expect(leerCaminoAdjunto(foto, C, CONV)).toEqual({ clase: "imagen", nombre: "foto.jpg" });
    expect(leerCaminoAdjunto(pdf, C, CONV)).toEqual({ clase: "pdf", nombre: "Plano casa.pdf" });
    expect(leerCaminoAdjunto(foto, C, OTRA)).toBeNull();
    expect(leerCaminoAdjunto(foto, "00000000-0000-4000-8000-000000000002", CONV)).toBeNull();
    expect(leerCaminoAdjunto(`${C}/chats/${CONV}/../${OTRA}/${ID}.jpg`, C, CONV)).toBeNull();
    expect(leerCaminoAdjunto(`${C}/chats/${CONV}/cualquier.jpg`, C, CONV)).toBeNull();
    expect(leerCaminoAdjunto(`${C}/chats/${CONV}/${ID}/a.exe`, C, CONV)).toBeNull();
    expect(leerCaminoAdjunto(42, C, CONV)).toBeNull();
  });

  it("guarda dirección y pie en el mensaje y los vuelve a leer", () => {
    const url = urlAdjunto("https://x.supabase.co/", "pdf", `${C}/chats/${CONV}/${ID}/Plano-casa.pdf`);
    expect(url).toBe(`https://x.supabase.co/storage/v1/object/public/fichas/${C}/chats/${CONV}/${ID}/Plano-casa.pdf`);
    expect(leerContenidoAdjunto(contenidoAdjunto(url, "Aquí el plano"))).toEqual({ url, leyenda: "Aquí el plano", nombre: "Plano casa.pdf" });
    expect(leerContenidoAdjunto("http://inseguro/x.pdf")).toBeNull();
    expect(leerContenidoAdjunto("javascript:alert(1)")).toBeNull();
    expect(leerContenidoAdjunto("hola")).toBeNull();
  });

  it("separa la nota de voz y lo que se vio en la foto del cliente", () => {
    expect(leerNotaDeVoz("Nota de voz: Hola, buenas")).toBe("Hola, buenas");
    expect(leerNotaDeVoz(null)).toBeNull();
    expect(leerNotaDeVoz("Hola")).toBeNull();
    expect(leerMedioCliente("¿Sigue disponible?\n[El cliente mandó una foto. Lo que se ve: Fachada blanca.]")).toEqual({
      pie: "¿Sigue disponible?",
      visto: "Fachada blanca.",
    });
    expect(leerMedioCliente("[El cliente mandó un PDF. Lo que se ve: Un plano.]")).toEqual({ pie: null, visto: "Un plano." });
    expect(leerMedioCliente(null)).toEqual({ pie: null, visto: null });
  });
});

describe("enviarAdjuntosComoCorredor", () => {
  const AHORA = new Date("2026-11-18T22:00:00Z");
  const corredor = { id: C, whatsapp_phone_number_id: "PNID" } as Corredor;
  function armar(ultimo = "2026-11-18T21:00:00Z", control = "asistente") {
    const guardados: Record<string, unknown>[] = [];
    const whatsapp = {
      imagen: vi.fn(async () => "wamid.img"),
      documento: vi.fn(async () => "wamid.doc"),
      texto: vi.fn(),
      plantilla: vi.fn(),
    };
    const repo = {
      conversacionConContacto: vi.fn(async () => ({ telefono: "+50688880001", ultimo_mensaje_cliente_at: ultimo, control })),
      guardarMensaje: vi.fn(async (m: Record<string, unknown>) => {
        guardados.push(m);
        return "m1";
      }),
      registrarUso: vi.fn(async () => {}),
      actualizarConversacion: vi.fn(async () => {}),
    };
    const deps = { repo, whatsapp, ahora: () => AHORA } as unknown as Dependencias;
    return { deps, whatsapp, repo, guardados };
  }
  const foto = { clase: "imagen" as const, url: "https://x/f.jpg", nombre: "foto.jpg" };
  const pdf = { clase: "pdf" as const, url: "https://x/Plano.pdf", nombre: "Plano.pdf" };

  it("manda foto y PDF en orden, el texto como pie del primero, y el chat pasa al corredor", async () => {
    const t = armar();
    const r = await enviarAdjuntosComoCorredor(t.deps, corredor, CONV, [foto, pdf], "Le comparto esto");
    expect(r).toEqual({ ok: true, aviso: "Enviados los 2 archivos." });
    expect(t.whatsapp.imagen).toHaveBeenCalledWith("PNID", "+50688880001", "https://x/f.jpg", "Le comparto esto");
    expect(t.whatsapp.documento).toHaveBeenCalledWith("PNID", "+50688880001", "https://x/Plano.pdf", "Plano.pdf", "");
    expect(t.guardados.map((g) => [g.tipo, g.contenido, g.autor])).toEqual([
      ["imagen", "https://x/f.jpg\nLe comparto esto", "corredor"],
      ["documento", "https://x/Plano.pdf", "corredor"],
    ]);
    expect(t.repo.registrarUso).toHaveBeenCalledWith(C, { mensajesSalientes: 2 });
    expect(t.repo.actualizarConversacion).toHaveBeenCalledWith(C, CONV, { control: "corredor" });
  });

  it("con la ventana de 24 h cerrada no manda nada", async () => {
    const t = armar("2026-11-16T10:00:00Z");
    const r = await enviarAdjuntosComoCorredor(t.deps, corredor, CONV, [foto], "");
    expect(r.ok).toBe(false);
    expect(t.whatsapp.imagen).not.toHaveBeenCalled();
  });

  it("si WhatsApp rechaza el segundo, dice cuántos salieron", async () => {
    const t = armar();
    t.whatsapp.documento.mockRejectedValueOnce(new Error("131053"));
    const r = await enviarAdjuntosComoCorredor(t.deps, corredor, CONV, [foto, pdf], "");
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/Salieron 1 de 2/) });
    expect(t.guardados).toHaveLength(1);
  });

  it("un pie demasiado largo se rechaza antes de mandar", async () => {
    const t = armar();
    const r = await enviarAdjuntosComoCorredor(t.deps, corredor, CONV, [foto], "a".repeat(1100));
    expect(r.ok).toBe(false);
    expect(t.whatsapp.imagen).not.toHaveBeenCalled();
  });
});
