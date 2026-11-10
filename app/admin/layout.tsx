import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { salir } from "../panel/acciones";
import { NavAdmin } from "./nav";

// Marco de /admin: menú lateral (en el teléfono, pestañas arriba) y la comprobación de que quien entra es
// superadministrador. Cada página y cada acción vuelve a comprobarlo: el marco no es la única puerta.

export const dynamic = "force-dynamic";
export const metadata = { title: "Administración", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { correo } = await sesionSuperadmin();
  return (
    <div className="adm">
      <aside className="adm-lado">
        <div className="adm-marca">
          <strong>Administración</strong>
          <span>Plataforma de asistentes</span>
        </div>
        <NavAdmin />
        <div className="adm-pie">
          <span className="adm-correo" title={correo}>
            {correo}
          </span>
          <a href="/panel" className="adm-enlace">
            Ir al panel
          </a>
          <form action={salir}>
            <button type="submit" className="adm-enlace">
              Salir
            </button>
          </form>
        </div>
      </aside>
      <main className="adm-cuerpo">{children}</main>
    </div>
  );
}
