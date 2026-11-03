"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoAgenda, IconoCasa, IconoChats, IconoMas, IconoPersonas } from "./iconos";

// Cuatro botones, grandes: lo demás está en "Más", dentro de Chats.
const SECCIONES = [
  {
    ruta: "/panel",
    nombre: "Chats",
    Icono: IconoChats,
    tambien: ["/panel/conversaciones"],
  },
  { ruta: "/panel/clientes", nombre: "Clientes", Icono: IconoPersonas, tambien: [] },
  { ruta: "/panel/agenda", nombre: "Agenda", Icono: IconoAgenda, tambien: [] },
  {
    ruta: "/panel/propiedades",
    nombre: "Mis casas",
    Icono: IconoCasa,
    tambien: [],
  },
];

/** `teNecesitan`: clientes que esperan a la corredora; se ven como un número sobre Chats. */
export function Navegacion({
  teNecesitan,
  marca,
}: {
  teNecesitan: number;
  marca: string;
}) {
  const ruta = usePathname();
  const activa = (s: (typeof SECCIONES)[number]) =>
    s.ruta === "/panel"
      ? ruta === "/panel" || s.tambien.some((r) => ruta.startsWith(r))
      : ruta.startsWith(s.ruta);
  return (
    // Dentro de un chat, como en WhatsApp, en el teléfono abajo va la caja para escribir y no las pestañas.
    <nav
      className={`navegacion${ruta.startsWith("/panel/conversaciones/") ? " en-chat" : ""}`}
      aria-label="Secciones"
    >
      {/* En computadora la navegación va a la izquierda, con el nombre de la marca arriba. */}
      <span className="navegacion-marca">{marca}</span>
      {SECCIONES.map((s) => {
        const numero = s.ruta === "/panel" ? teNecesitan : 0;
        return (
          <Link
            key={s.ruta}
            href={s.ruta}
            aria-current={activa(s) ? "page" : undefined}
          >
            <span className="icono">
              <s.Icono tamano={26} />
              {numero > 0 && (
                <span
                  className="contador"
                  aria-label={`${numero} te ${numero === 1 ? "necesita" : "necesitan"}`}
                >
                  {numero > 9 ? "9+" : numero}
                </span>
              )}
            </span>
            {s.nombre}
          </Link>
        );
      })}
      <Link
        href="/panel/mas"
        className="solo-escritorio"
        aria-current={ruta.startsWith("/panel/mas") ? "page" : undefined}
      >
        <span className="icono">
          <IconoMas tamano={26} />
        </span>
        Más
      </Link>
    </nav>
  );
}
