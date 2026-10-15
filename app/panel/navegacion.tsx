"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECCIONES = [
  { ruta: "/panel", nombre: "Hoy", icono: "◐" },
  { ruta: "/panel/conversaciones", nombre: "Chats", icono: "✉" },
  { ruta: "/panel/agenda", nombre: "Agenda", icono: "▦" },
  { ruta: "/panel/duenos", nombre: "Dueños", icono: "⌂" },
  { ruta: "/panel/anuncios", nombre: "Anuncios", icono: "❖" },
];

export function Navegacion() {
  const ruta = usePathname();
  const activa = (r: string) => (r === "/panel" ? ruta === r : ruta.startsWith(r));
  return (
    <nav className="navegacion" aria-label="Secciones">
      {SECCIONES.map((s) => (
        <Link key={s.ruta} href={s.ruta} aria-current={activa(s.ruta) ? "page" : undefined}>
          <span className="icono" aria-hidden>
            {s.icono}
          </span>
          {s.nombre}
        </Link>
      ))}
    </nav>
  );
}
