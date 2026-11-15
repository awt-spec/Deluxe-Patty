import { beforeEach, describe, expect, it, vi } from "vitest";
import { estado, ID, supabaseFalso } from "./acciones/entorno";

// POST /api/sitio/<slug>/visita: la hora se revisa antes de gastar el límite de un pedido por minuto.
vi.mock("@/lib/supabase/admin", () => import("./acciones/mocks/admin"));
vi.mock("@/lib/asistente/dependencias", () => import("./acciones/mocks/dependencias"));
const revisarPedido = vi.fn();
const pedirVisita = vi.fn(async () => ({ ok: true, cuando: "lunes", casa: null }));
vi.mock("@/lib/sitio/publico", async (original) => ({
  ...(await original<typeof import("@/lib/sitio/publico")>()),
  corredorPorSlug: async () => ({ id: ID.deluxe, nombre_contacto: "Patricia" }),
  revisarPedido,
  pedirVisita,
}));
const { POST } = await import("@/app/api/sitio/[slug]/visita/route");

const pedido = { acepta: true, nombre: "Ana Pérez", telefono: "8888-0001", inicio: "2026-11-20T16:00:00.000Z" };
const enviar = (cuerpo: unknown) =>
  POST(new Request("https://x/api/sitio/deluxe/visita", { method: "POST", body: JSON.stringify(cuerpo), headers: { "x-forwarded-for": "1.2.3.4" } }) as never, {
    params: Promise.resolve({ slug: "deluxe" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  estado.admin = supabaseFalso();
  estado.admin.respuestasRpc.reclamar_alerta = true;
});

describe("API de visitas del sitio", () => {
  it("una hora ya tomada contesta 409 sin gastar el límite (puede elegir otra enseguida)", async () => {
    revisarPedido.mockResolvedValue({ ok: false, motivo: "Esa hora ya no está libre. Elige otra.", estado: 409 });
    const r = await enviar(pedido);
    expect(r.status).toBe(409);
    expect(estado.admin.rpcs).toEqual([]);
    expect(pedirVisita).not.toHaveBeenCalled();
  });

  it("con la hora libre reclama el límite (por conexión y por teléfono) antes de crear nada", async () => {
    revisarPedido.mockResolvedValue({ ok: true, casa: null });
    const r = await enviar(pedido);
    expect(r.status).toBe(200);
    expect(estado.admin.rpcs.map((x) => x.nombre)).toEqual(["reclamar_alerta", "reclamar_alerta"]);
    expect(pedirVisita).toHaveBeenCalledTimes(1);
  });

  it("si el límite ya se gastó, 429 y no se crea la visita", async () => {
    revisarPedido.mockResolvedValue({ ok: true, casa: null });
    estado.admin.respuestasRpc.reclamar_alerta = false;
    const r = await enviar(pedido);
    expect(r.status).toBe(429);
    expect(pedirVisita).not.toHaveBeenCalled();
  });

  it("un pedido mal armado se rechaza antes de revisar la agenda", async () => {
    const r = await enviar({ ...pedido, acepta: false });
    expect(r.status).toBe(400);
    expect(revisarPedido).not.toHaveBeenCalled();
  });
});
