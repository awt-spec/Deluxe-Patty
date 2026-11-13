import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { copiarFotosDemo, HOST_FOTOS_DEMO } from "../lib/panel/demo-datos";
import { huellaFoto } from "../lib/fotos/copiar";

const C = "00000000-0000-4000-8000-0000000000de";
const buena = `https://${HOST_FOTOS_DEMO}/photo-1?w=1200`;

function dbFalso(existentes: string[] = []) {
  const subidas: string[] = [];
  const db = {
    storage: {
      from: () => ({
        list: async () => ({ data: existentes.map((name) => ({ name })), error: null }),
        upload: async (camino: string) => (subidas.push(camino), { data: {}, error: null }),
        getPublicUrl: (camino: string) => ({ data: { publicUrl: `https://bucket/${camino}` } }),
      }),
    },
  } as unknown as SupabaseClient;
  return { db, subidas };
}

const imagen = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });

afterEach(() => vi.unstubAllGlobals());

describe("copiarFotosDemo", () => {
  it("copia la foto de ejemplo al bucket del corredor de demostración", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => imagen()));
    const { db, subidas } = dbFalso();
    const r = await copiarFotosDemo(db, C, [{ id: "c1", fotos: [{ url: buena, orden: 1 }] }]);
    expect(subidas).toHaveLength(1);
    expect(subidas[0].startsWith(`${C}/`)).toBe(true);
    expect(r[0].fotos[0].url).toBe(`https://bucket/${subidas[0]}`);
    expect(r[0].fotos[0].orden).toBe(1);
  });

  it("un servidor no permitido no se pide y queda la dirección externa", async () => {
    const fetchMock = vi.fn(async () => imagen());
    vi.stubGlobal("fetch", fetchMock);
    const { db, subidas } = dbFalso();
    const ajena = "https://otro.example.com/foto.jpg";
    const r = await copiarFotosDemo(db, C, [{ id: "c1", fotos: [{ url: ajena, orden: 1 }] }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(subidas).toHaveLength(0);
    expect(r[0].fotos[0].url).toBe(ajena);
  });

  it("si la descarga falla, la casa conserva la dirección externa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red"); }));
    const { db } = dbFalso();
    const r = await copiarFotosDemo(db, C, [{ id: "c1", fotos: [{ url: buena, orden: 1 }] }]);
    expect(r[0].fotos[0].url).toBe(buena);
  });

  it("si ya está copiada, no se vuelve a bajar", async () => {
    const fetchMock = vi.fn(async () => imagen());
    vi.stubGlobal("fetch", fetchMock);
    const { db, subidas } = dbFalso([`demo-${huellaFoto(buena)}.jpg`]);
    const r = await copiarFotosDemo(db, C, [{ id: "c1", fotos: [{ url: buena, orden: 1 }] }]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(subidas).toHaveLength(0);
    expect(r[0].fotos[0].url).toContain(`demo-${huellaFoto(buena)}.jpg`);
  });
});
