import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, supabaseFalso } from "./entorno";

// Acciones del estudio de redes (app/panel/propiedades/[id]/redes/acciones.ts): mejorar una foto, el texto
// con IA y el guion del video. Con la casa de otro corredor no hacen nada; lo inventado se descarta.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

const presupuesto = { gastoDia: 0, gastoMes: 0, topeDia: 10, topeMes: 150 };
const registrarUso = vi.fn(async () => {});
const SIN = { tokensEntrada: 10, tokensSalida: 5, costoUsd: 0.001 };
const textoRedes = vi.fn(async () => ({ texto: "", consumo: SIN }));
const guionVideo = vi.fn(async () => ({ escenas: [] as { foto: string; texto: string }[], consumo: SIN }));
vi.mock("@/lib/asistente/dependencias", () => ({
  dependenciasPara: () => ({ repo: { presupuestoIA: async () => presupuesto, registrarUso }, cerebro: { textoRedes, guionVideo }, fotos: {} }),
}));
const mejorarFotos = vi.fn(async () => ({ mensajes: ["Listo"], mejoradas: [{ numero: 1, url: "https://sb.test/storage/v1/object/public/fotos/x-mejorada.jpg" }], fallidas: 0 }));
vi.mock("@/lib/fotos/mejorar", () => ({ mejorarFotos }));

const acciones = await import("@/app/panel/propiedades/[id]/redes/acciones");

const BUCKET = "https://sb.test/storage/v1/object/public/fotos";
const fotoPropia = (n: number) => `${BUCKET}/${ID.deluxe}/${ID.casa}/originales/${n}.jpg`;
const ilustrativa = `${BUCKET}/${ID.deluxe}/${ID.casa}/1-amueblada.jpg`;
const casa = {
  id: ID.casa,
  corredor_id: ID.deluxe,
  codigo: "DP-07",
  titulo: "Casa con piscina en Escazú",
  tipo: "casa",
  operacion: "venta",
  precio: 1250000,
  moneda: "USD",
  provincia: "San José",
  canton: "Escazú",
  distrito: null,
  zona: "Escazú",
  habitaciones: 4,
  banos: 3,
  m2_construccion: 380,
  m2_terreno: null,
  descripcion: null,
  amenidades: ["Piscina"],
  url_e24: null,
  estado: "activa",
  fotos: [
    { url: fotoPropia(1), orden: 1, variantes: [{ tipo: "amueblada", url: ilustrativa, detalle: "", creada_at: "" }] },
    { url: fotoPropia(2), orden: 2 },
  ],
};
const ajena = { ...casa, id: ID.casaAjena, corredor_id: ID.otro, codigo: "OT-1", fotos: [{ url: `${BUCKET}/${ID.otro}/${ID.casaAjena}/originales/1.jpg`, orden: 1 }] };
const corredor = { id: ID.deluxe, activo: true, nombre: "Deluxe", nombre_contacto: "Patricia", whatsapp_numero: "+50688887777", tono: "", imagenes_activas: true };
const textoBase = "Casa con piscina en Escazú\n💰 $1.250.000\n📲 Más información y visitas por WhatsApp: wa.me/50688887777 (código DP-07)";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://sb.test");
  Object.assign(presupuesto, { gastoDia: 0, gastoMes: 0 });
  estado.sesion = { corredor: { ...corredor }, usuario: { id: ID.usuario, email: "patricia@ejemplo.com" }, supabase: supabaseFalso({ propiedades: [casa, ajena] }) };
});

describe("Texto para redes con IA", () => {
  it("con la casa de otro corredor no llama a la IA ni suma gasto", async () => {
    const r = await acciones.mejorarTextoRedes(ID.casaAjena, textoBase, "mejorar");
    expect(r).toEqual({ ok: false, motivo: "No encontré esa casa." });
    expect(textoRedes).not.toHaveBeenCalled();
    expect(registrarUso).not.toHaveBeenCalled();
  });

  it("si la IA inventa una cifra, se descarta (y el gasto igual se suma)", async () => {
    textoRedes.mockResolvedValueOnce({ texto: "Casa a 5 minutos de la playa. $1.250.000 wa.me/50688887777 DP-07", consumo: SIN });
    const r = await acciones.mejorarTextoRedes(ID.casa, textoBase, "vendedor");
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining("número que no está en la ficha") });
    expect(registrarUso).toHaveBeenCalledWith(ID.deluxe, expect.objectContaining({ llamadasClaude: 1, costoClaudeUsd: 0.001 }));
  });

  it("si cambia el precio, también se descarta", async () => {
    textoRedes.mockResolvedValueOnce({ texto: "Oportunidad: $1.150.000 wa.me/50688887777 DP-07", consumo: SIN });
    expect((await acciones.mejorarTextoRedes(ID.casa, textoBase, "corto")).ok).toBe(false);
  });

  it("un texto bueno pasa; la ficha va como dato y el texto del corredor aparte", async () => {
    textoRedes.mockResolvedValueOnce({ texto: "Vive en Escazú: 4 habitaciones, 3 baños y piscina.\n$1.250.000\nwa.me/50688887777 (código DP-07)", consumo: SIN });
    const r = await acciones.mejorarTextoRedes(ID.casa, textoBase, "mejorar");
    expect(r).toMatchObject({ ok: true, aviso: null, texto: expect.stringContaining("4 habitaciones") });
    const [, ficha, texto, modo] = textoRedes.mock.calls[0] as unknown as [unknown, string, string, string];
    expect(ficha).toContain("código DP-07");
    expect(texto).toBe(textoBase);
    expect(modo).toBe("mejorar");
  });

  it("un modo inventado, sin presupuesto o en la demo no gasta IA", async () => {
    expect((await acciones.mejorarTextoRedes(ID.casa, textoBase, "borrar-todo")).ok).toBe(false);
    presupuesto.gastoDia = 99;
    expect(await acciones.mejorarTextoRedes(ID.casa, textoBase, "mejorar")).toMatchObject({ ok: false, motivo: expect.stringContaining("límite") });
    estado.sesion!.corredor.activo = false;
    expect(await acciones.mejorarTextoRedes(ID.casa, textoBase, "ingles")).toMatchObject({ ok: true, texto: expect.stringContaining(textoBase) });
    expect(textoRedes).not.toHaveBeenCalled();
  });
});

describe("Guion del video con IA", () => {
  it("con la casa de otro corredor no hace nada", async () => {
    expect((await acciones.proponerGuionVideo(ID.casaAjena, [ajena.fotos[0].url])).ok).toBe(false);
    expect(guionVideo).not.toHaveBeenCalled();
  });

  it("solo pasa fotos de la casa y quita textos con cifras que no están en la ficha", async () => {
    guionVideo.mockResolvedValueOnce({
      escenas: [
        { foto: "F2", texto: "" },
        { foto: "F1", texto: "Sala de 200 m² con vista al mar" },
        { foto: "F3", texto: "Piscina para la familia" },
      ],
      consumo: SIN,
    });
    const r = await acciones.proponerGuionVideo(ID.casa, [fotoPropia(1), "https://malo.example/x.jpg", fotoPropia(2), ilustrativa]);
    const fotosAlModelo = (guionVideo.mock.calls[0] as unknown as [unknown, unknown, { id: string; url: string; ilustrativa: boolean }[]])[2];
    expect(fotosAlModelo.map((f) => [f.id, f.url, f.ilustrativa])).toEqual([
      ["F1", fotoPropia(1), false],
      ["F2", fotoPropia(2), false],
      ["F3", ilustrativa, true],
    ]);
    expect(r).toEqual({
      ok: true,
      aviso: expect.stringContaining("cifras"),
      escenas: [
        { url: fotoPropia(2), texto: "" },
        { url: fotoPropia(1), texto: "" },
        { url: ilustrativa, texto: "Piscina para la familia" },
      ],
    });
  });

  it("en la demo da un guion simulado sin llamar a la IA", async () => {
    estado.sesion!.corredor.activo = false;
    // La demo usa fotos de ejemplo (Unsplash).
    estado.sesion!.supabase = supabaseFalso({ propiedades: [{ ...casa, fotos: [{ url: "https://images.unsplash.com/a", orden: 1 }] }] });
    const r = await acciones.proponerGuionVideo(ID.casa, ["https://images.unsplash.com/a"]);
    expect(r).toMatchObject({ ok: true, escenas: [{ url: "https://images.unsplash.com/a", texto: "" }] });
    expect(guionVideo).not.toHaveBeenCalled();
  });
});

describe("Mejorar la foto elegida", () => {
  it("con la casa de otro corredor no mejora nada", async () => {
    expect((await acciones.mejorarFotoRedes(ID.casaAjena, ajena.fotos[0].url)).ok).toBe(false);
    expect(mejorarFotos).not.toHaveBeenCalled();
  });

  it("una ilustrativa no se mejora; una original usa la misma mejora de la casa, solo esa foto", async () => {
    expect((await acciones.mejorarFotoRedes(ID.casa, ilustrativa)).ok).toBe(false);
    const r = await acciones.mejorarFotoRedes(ID.casa, fotoPropia(2));
    expect(r).toMatchObject({ ok: true });
    expect(mejorarFotos).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: ID.deluxe }), "DP-07", expect.any(Function), fotoPropia(2));
  });

  it("en la demo o con las imágenes apagadas no llama a OpenAI", async () => {
    estado.sesion!.corredor.imagenes_activas = false;
    expect((await acciones.mejorarFotoRedes(ID.casa, fotoPropia(1))).ok).toBe(false);
    estado.sesion!.corredor.imagenes_activas = true;
    presupuesto.gastoMes = 999;
    expect((await acciones.mejorarFotoRedes(ID.casa, fotoPropia(1))).ok).toBe(false);
    expect(mejorarFotos).not.toHaveBeenCalled();
  });
});
