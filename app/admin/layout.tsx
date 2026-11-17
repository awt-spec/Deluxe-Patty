import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { MarcoAdmin } from "./marco";
import "./admin.css";

// Marco de /admin: menú lateral (en el teléfono, barra de abajo) y la comprobación de que quien entra es
// superadministrador. Cada página y cada acción vuelve a comprobarlo: el marco no es la única puerta.

export const dynamic = "force-dynamic";
export const metadata = { title: "Administración", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { correo } = await sesionSuperadmin();
  return <MarcoAdmin correo={correo}>{children}</MarcoAdmin>;
}
