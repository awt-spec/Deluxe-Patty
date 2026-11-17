import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoEncontrado, estado, supabaseFalso } from "./entorno";

vi.mock("next/navigation", () => import("./mocks/navegacion"));
vi.mock("next/cache", () => import("./mocks/cache"));
vi.mock("next/headers", () => import("./mocks/headers"));
vi.mock("@/lib/admin/superadmin", () => import("./mocks/superadmin"));
vi.mock("@/lib/supabase/admin", () => import("./mocks/admin"));

// Cada página de /admin comprueba al superadmin por su cuenta: el layout no se vuelve a dibujar en cada navegación
// (Partial Rendering), así que no basta con él. Sin ser superadmin, 404 antes de leer nada.

const RAIZ = join(__dirname, "../../app/admin");
const paginas = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? paginas(join(dir, e.name)) : e.name === "page.tsx" ? [join(dir, e.name)] : []));

const PAGINAS = paginas(RAIZ).map((p) => relative(RAIZ, p)).sort();
const ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  estado.superadmin = null;
  estado.admin = supabaseFalso({ corredores: [{ id: ID, activo: true }], superadmins: [], plataforma: [], miembros: [] });
});

describe("/admin: cada página exige superadmin", () => {
  it("encuentra las páginas", () => {
    expect(PAGINAS).toEqual(expect.arrayContaining(["page.tsx", "corredores/page.tsx", "corredores/[id]/page.tsx", "whatsapp/page.tsx", "ia/page.tsx", "accesos/page.tsx"]));
  });

  it.each(PAGINAS)("%s llama a sesionSuperadmin antes de todo", (p) => {
    const codigo = readFileSync(join(RAIZ, p), "utf8");
    expect(codigo).toMatch(/from "@\/lib\/admin\/superadmin"/);
    const cuerpo = codigo.slice(codigo.indexOf("export default async function"));
    // La comprobación es lo primero que se espera en la página.
    expect(cuerpo.match(/await\s+([\w.]+)\(/)?.[1]).toBe("sesionSuperadmin");
  });

  it.each(PAGINAS)("%s responde 404 a quien no es superadmin y no lee la base", async (p) => {
    const { default: Pagina } = (await import(join(RAIZ, p))) as { default: (props: unknown) => Promise<unknown> };
    const lecturas: string[] = [];
    const desde = estado.admin.from;
    estado.admin.from = (t) => (lecturas.push(t), desde(t));
    const props = { params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({}) };
    await expect(Pagina(props)).rejects.toBeInstanceOf(NoEncontrado);
    expect(lecturas).toEqual([]);
  });
});
