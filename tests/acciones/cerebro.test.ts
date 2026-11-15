import { beforeEach, describe, expect, it, vi } from "vitest";
import { ID, estado, formulario, redirigeA, supabaseFalso } from "./entorno";

// Lo que se le enseña al Cerebro (enseñar y responder una duda): se limpia en el servidor (sin caracteres de dirección
// ni de control), se topa (tema 200, respuesta 2.000) y, si pasa, se le dice; solo escribe en el corredor de la sesión.

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("@/lib/panel/sesion", () => import("./mocks/sesion"));

const acciones = await import("@/app/panel/cerebro/acciones");

const corredor = { id: ID.deluxe, activo: true, nombre: "Deluxe" };
const DUDA_PROPIA = "80000000-0000-4000-8000-000000000001";
const DUDA_AJENA = "80000000-0000-4000-8000-000000000002";
const u = (...cs: number[]) => String.fromCodePoint(...cs);
const aviso = (url: string) => new URL(url, "https://x").searchParams.get("aviso");

beforeEach(() => {
  estado.sesion = {
    corredor,
    usuario: { id: ID.usuario, email: "patricia@ejemplo.com" },
    supabase: supabaseFalso({
      conocimiento: [
        { id: DUDA_PROPIA, corredor_id: ID.deluxe, tema: "¿Hay piscina?", respuesta: null, estado: "pendiente" },
        { id: DUDA_AJENA, corredor_id: ID.otro, tema: "¿Hay piscina?", respuesta: null, estado: "pendiente" },
      ],
    }),
  };
});

describe("Enseñarle algo al Cerebro", () => {
  it("quita los caracteres de dirección y de control, y deja tildes, ñ, emojis y saltos de línea", async () => {
    const familia = `${u(0x1f468)}${u(0x200d)}${u(0x1f469)}${u(0x200d)}${u(0x1f467)}`;
    const url = await redirigeA(
      acciones.ensenar(formulario({ tema: `Mascotas${u(0x202e)}`, respuesta: `Sí, ñandú ${familia}\n${u(0x1f1e8, 0x1f1f7)} bienvenidos${u(0x2066)}${u(0x0007)}` })),
    );
    expect(aviso(url)).toBe("Listo, ya lo sabe.");
    expect(estado.sesion!.supabase.tablas.conocimiento).toContainEqual(
      expect.objectContaining({ corredor_id: ID.deluxe, tema: "Mascotas", respuesta: `Sí, ñandú ${familia}\n${u(0x1f1e8, 0x1f1f7)} bienvenidos` }),
    );
  });

  it("un tema de más de 200 letras o una respuesta de más de 2.000 avisa y no guarda nada", async () => {
    const largo = aviso(await redirigeA(acciones.ensenar(formulario({ tema: "t".repeat(201), respuesta: "ok" }))));
    expect(largo).toBe("El tema es muy largo: hasta 200 letras (tiene 201).");
    const larga = aviso(await redirigeA(acciones.ensenar(formulario({ tema: "tema", respuesta: "r".repeat(2001) }))));
    expect(larga).toBe("La respuesta es muy larga: hasta 2.000 letras (tiene 2.001).");
    expect(estado.sesion!.supabase.escrituras).toEqual([]);
  });

  it("justo en el tope sí se guarda, completo (no se corta)", async () => {
    await redirigeA(acciones.ensenar(formulario({ tema: "t".repeat(200), respuesta: "r".repeat(2000) })));
    const fila = estado.sesion!.supabase.tablas.conocimiento.at(-1)!;
    expect((fila.tema as string).length).toBe(200);
    expect((fila.respuesta as string).length).toBe(2000);
  });

  it("solo con caracteres invisibles cuenta como vacío", async () => {
    const url = await redirigeA(acciones.ensenar(formulario({ tema: `${u(0x202e)}${u(0x200b)}`, respuesta: "algo" })));
    expect(aviso(url)).toBe("Escribe el tema y la respuesta.");
    expect(estado.sesion!.supabase.escrituras).toEqual([]);
  });
});

describe("Responder una duda", () => {
  it("limpia la respuesta y solo cambia la duda del propio corredor", async () => {
    const url = await redirigeA(acciones.responderDuda(formulario({ id: DUDA_PROPIA, respuesta: `Sí hay${u(0x202e)} piscina` })));
    expect(aviso(url)).toBe("Listo, ya lo sabe.");
    const [propia, ajena] = estado.sesion!.supabase.tablas.conocimiento;
    expect(propia).toMatchObject({ respuesta: "Sí hay piscina", estado: "activo" });
    expect(ajena).toMatchObject({ respuesta: null, estado: "pendiente" });
  });

  it("con la duda de otro corredor no hace nada", async () => {
    await redirigeA(acciones.responderDuda(formulario({ id: DUDA_AJENA, respuesta: "Sí hay piscina" })));
    const ajena = estado.sesion!.supabase.tablas.conocimiento.find((f) => f.id === DUDA_AJENA)!;
    expect(ajena).toMatchObject({ respuesta: null, estado: "pendiente", corredor_id: ID.otro });
  });

  it("una respuesta de más de 2.000 letras avisa y no guarda", async () => {
    const url = await redirigeA(acciones.responderDuda(formulario({ id: DUDA_PROPIA, respuesta: "r".repeat(2001), ver: "sabe" })));
    expect(url).toMatch(/ver=sabe/);
    expect(aviso(url)).toMatch(/^La respuesta es muy larga/);
    expect(estado.sesion!.supabase.escrituras).toEqual([]);
  });
});
