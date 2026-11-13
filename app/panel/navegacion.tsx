"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoAgenda, IconoCasa, IconoInicio, IconoPersonas } from "./iconos";
import { abrirPatty } from "./patty";
import { accionAsistente } from "@/lib/panel/barra";

// Teléfono: barra de abajo con cinco lugares, la asistente al centro (Inicio · Clientes · Patty · Agenda · Mis casas);
// lo demás en "Más", desde Inicio. En computadora esta barra no se ve: va el menú de la izquierda
// (`menu-lateral.tsx`), con los mismos lugares para la guía de Patty (`nav-preguntar` es el botón de la asistente).
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

/** `teNecesitan`: clientes que esperan al corredor; se ven como un número en Inicio. `asistente`: su nombre. */
export function Navegacion({ teNecesitan, asistente = "Patty" }: { teNecesitan: number; asistente?: string }) {
  const ruta = usePathname();
  const accion = accionAsistente(ruta);
  const inicial = asistente.trim().charAt(0).toUpperCase() || "P";

  const enlace = (s: (typeof SECCIONES)[number]) => {
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
  };

  const cuerpo = (
    <>
      <span className="nav-patty-circulo" aria-hidden>
        {inicial}
      </span>
      <span className="nombre">{asistente}</span>
    </>
  );

  return (
    // Dentro de un chat, como en WhatsApp, en el teléfono abajo va la caja para escribir y no las pestañas.
    <nav className={`navegacion${ruta.startsWith("/panel/conversaciones/") ? " en-chat" : ""}`} aria-label="Secciones">
      <div className="nav-grupo">
        {SECCIONES.slice(0, 2).map(enlace)}
        {accion === "abrir" ? (
          <button type="button" className="nav-patty" onClick={() => abrirPatty()} aria-label={`Hablar con ${asistente}`} aria-haspopup="dialog" data-patty="nav-preguntar">
            {cuerpo}
          </button>
        ) : (
          <Link
            href="/panel/patty"
            className="nav-patty"
            aria-label={`Hablar con ${asistente}`}
            aria-current={accion === "aqui" ? "page" : undefined}
            data-patty="nav-preguntar"
          >
            {cuerpo}
          </Link>
        )}
        {SECCIONES.slice(2).map(enlace)}
      </div>
    </nav>
  );
}
