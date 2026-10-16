"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Solo tres botones, grandes: lo demás está en "Más", dentro de Chats.
const SECCIONES = [
  { ruta: "/panel", nombre: "Chats", icono: "💬", tambien: ["/panel/conversaciones"] },
  { ruta: "/panel/agenda", nombre: "Agenda", icono: "📅", tambien: [] },
  { ruta: "/panel/propiedades", nombre: "Mis casas", icono: "🏠", tambien: [] },
];

export function Navegacion() {
  const ruta = usePathname();
  const activa = (s: (typeof SECCIONES)[number]) =>
    s.ruta === "/panel" ? ruta === "/panel" || s.tambien.some((r) => ruta.startsWith(r)) : ruta.startsWith(s.ruta);
  return (
    <nav className="navegacion" aria-label="Secciones">
      {SECCIONES.map((s) => (
        <Link key={s.ruta} href={s.ruta} aria-current={activa(s) ? "page" : undefined}>
          <span className="icono" aria-hidden>
            {s.icono}
          </span>
          {s.nombre}
        </Link>
      ))}
    </nav>
  );
}
