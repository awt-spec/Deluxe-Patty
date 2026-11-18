import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crcOgg, leerWebmOpus, muestrasOpus, oggDesdePaquetes, webmAOgg, ErrorOgg } from "../lib/medios/ogg-opus";
import { duracionCorta, enviarNotaDeVozComoCorredor, esNotaDeVozValida } from "../lib/panel/acciones";
import { crearEnviadorWhatsApp } from "../lib/whatsapp/enviar";
import type { Dependencias } from "../lib/asistente/contexto";
import type { Corredor } from "../lib/datos/tipos";

// Nota de voz del corredor al cliente: la grabación de Chrome (WebM/Opus) se pasa a Ogg/Opus sin recodificar, se sube
// a WhatsApp y sale como nota de voz. La grabación de prueba es real (MediaRecorder de Chromium, 2,5 s).

const WEBM = new Uint8Array(readFileSync(new URL("./fixtures/nota-voz-chrome.webm", import.meta.url)));

/** Lee las páginas de un Ogg y revisa la firma y el CRC de cada una. */
function paginasOgg(b: Uint8Array) {
  const out: { tipo: number; granulo: number; numero: number; crcBien: boolean; paquetes: number }[] = [];
  let p = 0;
  while (p < b.length) {
    expect(String.fromCharCode(...b.subarray(p, p + 4))).toBe("OggS");
    const v = new DataView(b.buffer, b.byteOffset + p);
    const nseg = b[p + 26];
    const segs = b.subarray(p + 27, p + 27 + nseg);
    const largo = 27 + nseg + segs.reduce((s, x) => s + x, 0);
    const copia = b.slice(p, p + largo);
    new DataView(copia.buffer).setUint32(22, 0, true);
    out.push({
      tipo: b[p + 5],
      granulo: v.getUint32(6, true) + v.getUint32(10, true) * 2 ** 32,
      numero: v.getUint32(18, true),
      crcBien: crcOgg(copia) === v.getUint32(22, true),
      paquetes: [...segs].filter((x) => x < 255).length,
    });
    p += largo;
  }
  return out;
}

describe("WebM/Opus → Ogg/Opus", () => {
  it("saca los paquetes y la cabecera de la grabación de Chrome", () => {
    const r = leerWebmOpus(WEBM);
    expect(r.paquetes.length).toBeGreaterThan(30);
    expect(new TextDecoder().decode(r.cabecera!.subarray(0, 8))).toBe("OpusHead");
    expect(r.canales).toBe(1);
  });

  it("arma un Ogg válido: cabeceras, CRC bien, todos los paquetes y la duración", () => {
    const ogg = webmAOgg(WEBM);
    const pags = paginasOgg(ogg);
    expect(String.fromCharCode(...ogg.subarray(28, 36))).toBe("OpusHead");
    expect(pags.every((x) => x.crcBien)).toBe(true);
    expect(pags[0].tipo).toBe(0x02);
    expect(pags.at(-1)!.tipo & 0x04).toBe(0x04);
    expect(pags.map((x) => x.numero)).toEqual(pags.map((_, i) => i));
    const { paquetes } = leerWebmOpus(WEBM);
    expect(pags.slice(2).reduce((s, x) => s + x.paquetes, 0)).toBe(paquetes.length);
    const preskip = new DataView(ogg.buffer, ogg.byteOffset + 28).getUint16(10, true);
    const segundos = (pags.at(-1)!.granulo - preskip) / 48000;
    expect(segundos).toBeGreaterThan(2);
    expect(segundos).toBeLessThan(3);
    expect(esNotaDeVozValida(ogg, "audio/ogg")).toBe(true);
  });

  it("sin cabecera arma una por defecto; un paquete de más de 255 bytes usa varios segmentos", () => {
    const grande = new Uint8Array(600).fill(1);
    grande[0] = 0xfc; // CELT 20 ms, 1 marco
    const ogg = oggDesdePaquetes(null, 2, [grande, grande]);
    const pags = paginasOgg(ogg);
    expect(pags.every((x) => x.crcBien)).toBe(true);
    expect(ogg[28 + 9]).toBe(2);
    expect(pags[2].paquetes).toBe(2);
  });

  it("lo que no es WebM con Opus se rechaza (entonces no se manda)", () => {
    expect(() => webmAOgg(new Uint8Array([1, 2, 3, 4]))).toThrow(ErrorOgg);
    expect(() => webmAOgg(new TextEncoder().encode("hola, esto no es audio"))).toThrow(ErrorOgg);
  });

  it("calcula las muestras de cada paquete por su byte TOC", () => {
    expect(muestrasOpus(new Uint8Array([0xfc]))).toBe(960); // CELT 20 ms
    expect(muestrasOpus(new Uint8Array([0x7c]))).toBe(960); // Hybrid 20 ms (config 15)
    expect(muestrasOpus(new Uint8Array([0x1a]))).toBe(2880 * 2); // SILK 60 ms, 2 marcos (código 2)
    expect(muestrasOpus(new Uint8Array([0xfb, 0x03]))).toBe(2880); // CELT 20 ms, 3 marcos (código 3)
  });
});

describe("enviarNotaDeVozComoCorredor", () => {
  const AHORA = new Date("2026-11-18T22:00:00Z");
  const corredor = { id: "c1", whatsapp_phone_number_id: "PNID" } as Corredor;
  const OGG = webmAOgg(WEBM);
  function armar(ultimo = "2026-11-18T21:00:00Z") {
    const whatsapp = { audio: vi.fn(async () => "wamid.voz") };
    const repo = {
      conversacionConContacto: vi.fn(async () => ({ telefono: "+50688880001", ultimo_mensaje_cliente_at: ultimo, control: "asistente" })),
      guardarMensaje: vi.fn(async () => "m1"),
      registrarUso: vi.fn(async () => {}),
      actualizarConversacion: vi.fn(async () => {}),
    };
    return { deps: { repo, whatsapp, ahora: () => AHORA } as unknown as Dependencias, whatsapp, repo };
  }

  it("manda la nota y deja 'Nota de voz enviada (0:03)' en el chat, sin guardar el audio", async () => {
    const t = armar();
    const r = await enviarNotaDeVozComoCorredor(t.deps, corredor, "conv", OGG, "audio/ogg", 2.6);
    expect(r).toEqual({ ok: true, aviso: "Nota de voz enviada." });
    expect(t.whatsapp.audio).toHaveBeenCalledWith("PNID", "+50688880001", OGG, "audio/ogg");
    expect(t.repo.guardarMensaje).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "audio", direccion: "saliente", autor: "corredor", contenido: "Nota de voz enviada (0:03)" }),
    );
    expect(t.repo.actualizarConversacion).toHaveBeenCalledWith("c1", "conv", { control: "corredor" });
  });

  it("rechaza un formato que no es audio, un archivo disfrazado y la ventana cerrada", async () => {
    const t = armar();
    expect((await enviarNotaDeVozComoCorredor(t.deps, corredor, "conv", OGG, "audio/webm", 3)).ok).toBe(false);
    const falso = new Uint8Array(500).fill(65);
    expect((await enviarNotaDeVozComoCorredor(t.deps, corredor, "conv", falso, "audio/ogg", 3)).ok).toBe(false);
    const t2 = armar("2026-11-10T10:00:00Z");
    expect((await enviarNotaDeVozComoCorredor(t2.deps, corredor, "conv", OGG, "audio/ogg", 3)).ok).toBe(false);
    expect(t.whatsapp.audio).not.toHaveBeenCalled();
    expect(t2.whatsapp.audio).not.toHaveBeenCalled();
  });

  it("si WhatsApp no la acepta, lo dice y no anota nada", async () => {
    const t = armar();
    t.whatsapp.audio.mockRejectedValueOnce(new Error("x"));
    const r = await enviarNotaDeVozComoCorredor(t.deps, corredor, "conv", OGG, "audio/ogg", 3);
    expect(r.ok).toBe(false);
    expect(t.repo.guardarMensaje).not.toHaveBeenCalled();
  });

  it("duración corta legible", () => {
    expect(duracionCorta(0.2)).toBe("0:01");
    expect(duracionCorta(65)).toBe("1:05");
  });
});

describe("enviador: audio", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sube el archivo a WhatsApp y manda la nota por su id", async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        llamadas.push({ url, init });
        return url.endsWith("/media")
          ? new Response(JSON.stringify({ id: "MEDIA1" }), { status: 200 })
          : new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
      }),
    );
    const w = crearEnviadorWhatsApp("token", { dormir: async () => {} });
    const id = await w.audio!("PNID", "+50688880001", new Uint8Array([1, 2, 3]), "audio/ogg");
    expect(id).toBe("wamid.1");
    expect(llamadas[0].url).toMatch(/\/PNID\/media$/);
    const form = llamadas[0].init.body as FormData;
    expect(form.get("type")).toBe("audio/ogg");
    expect((form.get("file") as File).name).toBe("nota-de-voz.ogg");
    expect(JSON.parse(llamadas[1].init.body as string)).toMatchObject({ to: "50688880001", type: "audio", audio: { id: "MEDIA1" } });
  });

  it("si la subida falla no manda el mensaje", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: 131053 } }), { status: 400 }));
    vi.stubGlobal("fetch", f);
    const w = crearEnviadorWhatsApp("token", { dormir: async () => {} });
    await expect(w.audio!("PNID", "+50688880001", new Uint8Array([1]), "audio/ogg")).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
