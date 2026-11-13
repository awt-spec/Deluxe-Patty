"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoAgenda, IconoCasa, IconoInicio, IconoPersonas } from "./iconos";

// Teléfono: cuatro botones grandes abajo (lo demás en "Más", desde Inicio). En computadora esta barra no se ve:
// va el menú de la izquierda (`menu-lateral.tsx`), con los mismos lugares para la guía de Patty.
export const SECCIONES = [
  { ruta: "/panel", nombre: "Inicio", Icono: IconoInicio, tambien: ["/panel/conversaciones", "/panel/revisar"] },
  { ruta: "/panel/clientes", nombre: "Clientes", Icono: IconoPersonas, tambien: [] },
  { ruta: "/panel/agenda", nombre: "Agenda", Icono: IconoAgenda, tambien: [] },
  { ruta: "/panel/propiedades", nombre: "Mis casas", Icono: IconoCasa, tambien: [] },
];

/** Si la ruta actual es de esa sección (Inicio también cubre los chats y Revisar). */
export function esActiva(ruta: string, s: { ruta: string; tambien?: string[] }): boolean {
  return s.ruta === "/panel" ? ruta === "/panel" || (s.tambien ?? []).some((r) => ruta.startsWith(r)) : ruta.startsWith(s.ruta);
}

/** `teNecesitan`: clientes que esperan al corredor; se ven como un número en Inicio. */
export function Navegacion({ teNecesitan }: { teNecesitan: number }) {
  const ruta = usePathname();

  return (
    // Dentro de un chat, como en WhatsApp, en el teléfono abajo va la caja para escribir y no las pestañas.
    <nav className={`navegacion${ruta.startsWith("/panel/conversaciones/") ? " en-chat" : ""}`} aria-label="Secciones">
      <div className="nav-grupo">
        {SECCIONES.map((s) => {
          const numero = s.ruta === "/panel" ? teNecesitan : 0;
          return (
            <Link
              key={s.ruta}
              href={s.ruta}
              aria-current={esActiva(ruta, s) ? "page" : undefined}
              title={s.nombre}
              data-patty={`nav-${s.ruta === "/panel" ? "inicio" : s.ruta.split("/").pop()}`}
            >
              <span className="icono">
                <s.Icono tamano={26} />
                {numero > 0 && (
                  <span className="contador" aria-label={`${numero} te ${numero === 1 ? "necesita" : "necesitan"}`}>
                    {numero > 9 ? "9+" : numero}
                  </span>
                )}
              </span>
              <span className="nombre">{s.nombre}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
