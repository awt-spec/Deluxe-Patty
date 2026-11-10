"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  ["/admin", "Resumen"],
  ["/admin/corredores", "Corredores"],
  ["/admin/whatsapp", "WhatsApp"],
  ["/admin/accesos", "Accesos"],
  ["/admin/ia", "IA y topes"],
] as const;

export function NavAdmin() {
  const ruta = usePathname();
  return (
    <nav className="adm-nav" aria-label="Secciones de administración">
      {SECCIONES.map(([href, nombre]) => {
        const activa = href === "/admin" ? ruta === "/admin" : ruta.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={activa ? "page" : undefined}>
            {nombre}
          </Link>
        );
      })}
    </nav>
  );
}
