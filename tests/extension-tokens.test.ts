// GET /api/extension/estado: tokens de IA del mes, solo con el permiso y solo del corredor de ese permiso.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DependenciasExtension } from "../lib/encuentra24/extension";
import { huella } from "../lib/encuentra24/extension";

const deps: { actual: DependenciasExtension | null } = { actual: null };
vi.mock("@/lib/encuentra24/extension-servidor", async (original) => ({
  ...(await original<typeof import("../lib/encuentra24/extension-servidor")>()),
  dependenciasExtension: () => deps.actual!,
}));

const MIO = "11111111-1111-4111-8111-111111111111";
const OTRO = "22222222-2222-4222-8222-222222222222";
const TOKEN = "a".repeat(64);
let pedidos: string[];

beforeEach(() => {
  pedidos = [];
  const presupuestos: Record<string, { gastoDia: number; gastoMes: number; topeDia: number; topeMes: number }> = {
    [MIO]: { gastoDia: 1, gastoMes: 12.4, topeDia: 10, topeMes: 20 },
    [OTRO]: { gastoDia: 0, gastoMes: 99, topeDia: 10, topeMes: 100 },
  };
  deps.actual = {
    almacen: { corredorDeToken: async (h: string) => (h === huella(TOKEN) ? MIO : null) },
    repo: {
      presupuestoIA: async (id: string) => {
        pedidos.push(id);
        return presupuestos[id]!;
      },
    },
  } as unknown as DependenciasExtension;
});

const pedir = async (token?: string) => {
  const { GET } = await import("../app/api/extension/estado/route");
  return GET(new Request("https://app/api/extension/estado", { headers: token ? { authorization: `Bearer ${token}` } : {} }));
};

describe("GET /api/extension/estado", () => {
  it("devuelve los tokens del corredor del permiso, y solo de él", async () => {
    const r = await pedir(TOKEN);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, tokens: { total: 2000, usados: 1240, restantes: 760, pct: 62, nivel: "bien" } });
    expect(pedidos).toEqual([MIO]);
  });

  it("sin permiso o con uno inválido: 401 y no lee ningún presupuesto", async () => {
    for (const t of [undefined, "b".repeat(64)]) {
      const r = await pedir(t);
      expect(r.status).toBe(401);
      expect((await r.json()).motivo).toBe("permiso");
    }
    expect(pedidos).toEqual([]);
  });

  it("si el presupuesto no se puede leer, tokens null (la extensión sigue)", async () => {
    deps.actual!.repo.presupuestoIA = async () => {
      throw new Error("caída");
    };
    const r = await pedir(TOKEN);
    expect(await r.json()).toEqual({ ok: true, tokens: null });
  });
});
