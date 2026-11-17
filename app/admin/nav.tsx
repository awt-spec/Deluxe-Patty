"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoChats, IconoEscudo, IconoPersonas, IconoRayo, IconoTablero } from "../panel/iconos";

// Secciones de /admin. En computadora, menú lateral con íconos; en el teléfono, la misma lista es la barra de abajo.
export const SECCIONES = [
  { href: "/admin", nombre: "Resumen", corto: "Resumen", Icono: IconoTablero },
  { href: "/admin/corredores", nombre: "Corredores", corto: "Corredores", Icono: IconoPersonas },
  { href: "/admin/whatsapp", nombre: "WhatsApp", corto: "WhatsApp", Icono: IconoChats },
  { href: "/admin/accesos", nombre: "Accesos", corto: "Accesos", Icono: IconoEscudo },
  { href: "/admin/ia", nombre: "IA y topes", corto: "IA", Icono: IconoRayo },
] as const;

export const seccionActiva = (ruta: string, href: string) => (href === "/admin" ? ruta === "/admin" : ruta === href || ruta.startsWith(`${href}/`));

export function NavAdmin() {
  const ruta = usePathname() ?? "/admin";
  return (
    <nav className="ad-nav" aria-label="Secciones de administración">
      {SECCIONES.map(({ href, nombre, corto, Icono }) => {
        const activa = seccionActiva(ruta, href);
        return (
          <Link key={href} href={href} aria-current={activa ? "page" : undefined} title={nombre}>
            <Icono tamano={22} />
            <span className="ad-nav-largo">{nombre}</span>
            <span className="ad-nav-corto" aria-hidden>
              {corto}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
