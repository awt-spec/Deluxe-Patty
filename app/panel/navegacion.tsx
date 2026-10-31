"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoAgenda, IconoCasa, IconoChats } from "./iconos";

// Solo tres botones, grandes: lo demás está en "Más", dentro de Chats.
const SECCIONES = [
  { ruta: "/panel", nombre: "Chats", Icono: IconoChats, tambien: ["/panel/conversaciones", "/panel/mas"] },
  { ruta: "/panel/agenda", nombre: "Agenda", Icono: IconoAgenda, tambien: [] },
  { ruta: "/panel/propiedades", nombre: "Mis casas", Icono: IconoCasa, tambien: [] },
];

/** `teNecesitan`: clientes que esperan a la corredora; se ven como un número sobre Chats. */
export function Navegacion({ teNecesitan }: { teNecesitan: number }) {
  const ruta = usePathname();
  const activa = (s: (typeof SECCIONES)[number]) =>
    s.ruta === "/panel" ? ruta === "/panel" || s.tambien.some((r) => ruta.startsWith(r)) : ruta.startsWith(s.ruta);
  // Dentro de un chat, como en WhatsApp, abajo va la caja para escribir y no las pestañas.
  if (ruta.startsWith("/panel/conversaciones/")) return null;
  return (
    <nav className="navegacion" aria-label="Secciones">
      {SECCIONES.map((s) => {
        const numero = s.ruta === "/panel" ? teNecesitan : 0;
        return (
          <Link key={s.ruta} href={s.ruta} aria-current={activa(s) ? "page" : undefined}>
            <span className="icono">
              <s.Icono tamano={26} />
              {numero > 0 && (
                <span className="contador" aria-label={`${numero} te ${numero === 1 ? "necesita" : "necesitan"}`}>
                  {numero > 9 ? "9+" : numero}
                </span>
              )}
            </span>
            {s.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
