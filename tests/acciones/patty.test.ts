import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, supabaseFalso } from "./entorno";

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => import("./mocks/dependencias"));
vi.mock("@/lib/panel/patty", () => ({ hablarConPatty: vi.fn(async () => ({ ok: true, texto: "Listo" })) }));
const transcribir = vi.fn(async () => ({ texto: "Bloquear mañana en la tarde", segundos: 4, costoUsd: 0.0004 }));
vi.mock("@/lib/medios/transcribir", () => ({ crearTranscriptor: () => transcribir }));

const acciones = await import("@/app/panel/patty-acciones");
const { hablarConPatty } = await import("@/lib/panel/patty");
const deps = await import("./mocks/dependencias");

const corredor = { id: ID.deluxe, activo: true, nombre_asistente: "Patty" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  Object.assign(deps.presupuesto, { gastoDia: 0, gastoMes: 0 });
  estado.sesion = { corredor, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso() };
  estado.admin = supabaseFalso();
});

const adjuntosEnviados = () => (vi.mocked(hablarConPatty).mock.calls[0] as unknown[])[6];

describe("Adjuntos del chat de Patty", () => {
  it("deja pasar fotos y PDF en base64 y archivos ya convertidos a texto, con su tipo", async () => {
    await acciones.preguntarAPatty([], "analiza", "/panel", [
      { mediaType: "image/jpeg", datos: "QUJD", nombre: "sala.jpg" },
      { mediaType: "application/pdf", datos: "JVBERi0=", nombre: "avaluo.pdf" },
      { mediaType: "text/plain", datos: "Oferta: $425.000 <script>", nombre: "oferta.docx" },
    ]);
    expect(adjuntosEnviados()).toEqual([
      { tipo: "imagen", mediaType: "image/jpeg", datos: "QUJD", nombre: "sala.jpg" },
      { tipo: "pdf", mediaType: "application/pdf", datos: "JVBERi0=", nombre: "avaluo.pdf" },
      { tipo: "texto", mediaType: "text/plain", datos: "Oferta: $425.000 <script>", nombre: "oferta.docx" },
    ]);
  });

  it("descarta tipos no permitidos y base64 sucio", async () => {
    await acciones.preguntarAPatty([], "hola", "/panel", [
      { mediaType: "text/html", datos: "PGgxPg==", nombre: "x.html" },
      { mediaType: "image/jpeg", datos: "no es base64 !!", nombre: "x.jpg" },
      { mediaType: "application/x-msdownload", datos: "TVo=", nombre: "x.exe" },
    ]);
    expect(adjuntosEnviados()).toEqual([]);
  });

  it("si entre todos pasan los 4 MB no se llama a la IA", async () => {
    const grande = "A".repeat(2_200_000);
    const r = await acciones.preguntarAPatty([], "hola", "/panel", [
      { mediaType: "image/jpeg", datos: grande, nombre: "1.jpg" },
      { mediaType: "image/jpeg", datos: grande, nombre: "2.jpg" },
    ]);
    expect(r).toMatchObject({ ok: false });
    expect(hablarConPatty).not.toHaveBeenCalled();
  });

  it("la ruta de la pantalla solo puede ser del panel y el historial se recorta", async () => {
    await acciones.preguntarAPatty(
      Array.from({ length: 30 }, (_, i) => ({ autor: i % 2 ? "asistente" : "corredor", texto: "x".repeat(5000) })) as never,
      "hola",
      "https://malo.example/robar",
    );
    const [, , , historial, , ruta] = vi.mocked(hablarConPatty).mock.calls[0] as unknown[];
    expect(ruta).toBe("/panel");
    expect((historial as unknown[]).length).toBe(12);
    expect((historial as { texto: string }[])[0].texto.length).toBe(4000);
  });
});

describe("Nota de voz", () => {
  const audio = (bytes = 2000, tipo = "audio/webm") => {
    const f = new FormData();
    f.set("audio", new File([new Uint8Array(bytes)], "nota.webm", { type: tipo }));
    return f;
  };

  it("transcribe, suma el costo y devuelve el texto para revisarlo", async () => {
    vi.stubEnv("OPENAI_API_KEY", "llave-de-prueba");
    expect(await acciones.transcribirNota(audio())).toEqual({ ok: true, texto: "Bloquear mañana en la tarde" });
    expect(deps.registrarAudio).toHaveBeenCalledWith(ID.deluxe, 4, 0.0004);
  });

  it("la demo no gasta: devuelve un texto fijo sin transcribir", async () => {
    vi.stubEnv("OPENAI_API_KEY", "llave-de-prueba");
    estado.sesion!.corredor = { ...corredor, activo: false };
    expect(await acciones.transcribirNota(audio())).toMatchObject({ ok: true, texto: expect.stringMatching(/demostración/) });
    expect(transcribir).not.toHaveBeenCalled();
  });

  it("sin llave de OpenAI, con el tope alcanzado, muy largo o sin ser audio: no transcribe", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await acciones.transcribirNota(audio())).toMatchObject({ ok: false, motivo: expect.stringMatching(/no están activadas/) });
    vi.stubEnv("OPENAI_API_KEY", "llave-de-prueba");
    Object.assign(deps.presupuesto, { gastoDia: 99 });
    expect(await acciones.transcribirNota(audio())).toMatchObject({ ok: false, motivo: expect.stringMatching(/límite de uso/) });
    Object.assign(deps.presupuesto, { gastoDia: 0 });
    expect(await acciones.transcribirNota(audio(3_600_000))).toMatchObject({ ok: false, motivo: expect.stringMatching(/muy largo/) });
    expect(await acciones.transcribirNota(audio(2000, "application/pdf"))).toMatchObject({ ok: false, motivo: expect.stringMatching(/no parece un audio/) });
    expect(transcribir).not.toHaveBeenCalled();
  });

  it("si OpenAI falla, avisa sin tumbar nada y sin registrar el contenido", async () => {
    vi.stubEnv("OPENAI_API_KEY", "llave-de-prueba");
    transcribir.mockRejectedValueOnce(new Error("dijo +50688880001"));
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await acciones.transcribirNota(audio())).toMatchObject({ ok: false });
    expect(JSON.stringify(registro.mock.calls)).not.toContain("50688880001");
    registro.mockRestore();
  });
});

describe("Word, Excel y texto", () => {
  const archivo = (datos: BlobPart, nombre: string) => {
    const f = new FormData();
    f.set("archivo", new File([datos], nombre));
    return f;
  };

  it("convierte un Word real a texto", async () => {
    const docx = readFileSync(new URL("../fixtures/oferta.docx", import.meta.url));
    expect(await acciones.leerDocumento(archivo(new Uint8Array(docx), "oferta.docx"))).toMatchObject({ ok: true, nombre: "oferta.docx", texto: expect.stringContaining("$425,000") });
  });

  it("un formato viejo o un archivo vacío dan un mensaje claro", async () => {
    expect(await acciones.leerDocumento(archivo("x", "viejo.doc"))).toMatchObject({ ok: false, motivo: expect.stringMatching(/\.docx/) });
    expect(await acciones.leerDocumento(new FormData())).toMatchObject({ ok: false, motivo: "No llegó el archivo." });
  });
});
