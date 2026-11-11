"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { IconoAbajo, IconoAgenda, IconoCasa, IconoMas, IconoInicio, IconoPersonas } from "./iconos";

const CLAVE_PLEGADO = "menu-plegado";

// Cuatro botones, grandes: lo demás está en "Más", dentro de Chats.
const SECCIONES = [
  {
    ruta: "/panel",
    nombre: "Inicio",
    Icono: IconoInicio,
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

/** `teNecesitan`: clientes que esperan a la corredora; se ven como un número sobre Inicio. */
export function Navegacion({
  teNecesitan,
  marca,
}: {
  teNecesitan: number;
  marca: string;
}) {
  const ruta = usePathname();
  // En computadora el menú de la izquierda se puede contraer para dejar más espacio; se recuerda en este
  // navegador.
  const [plegado, setPlegado] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee al montar para no romper la hidratación.
      setPlegado(localStorage.getItem(CLAVE_PLEGADO) === "1");
    } catch {}
  }, []);
  useEffect(() => {
    document.querySelector(".marco")?.classList.toggle("plegado", plegado);
  }, [plegado]);
  const alternar = () => {
    const nuevo = !plegado;
    setPlegado(nuevo);
    try {
      localStorage.setItem(CLAVE_PLEGADO, nuevo ? "1" : "0");
    } catch {}
  };
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
      <button
        type="button"
        className="plegar solo-escritorio"
        onClick={alternar}
        aria-expanded={!plegado}
        title={plegado ? "Abrir el menú" : "Contraer el menú"}
      >
        <span className="icono" aria-hidden>
          <IconoAbajo tamano={22} />
        </span>
        <span className="nombre">{plegado ? "Abrir el menú" : "Contraer el menú"}</span>
      </button>
      {SECCIONES.map((s) => {
        const numero = s.ruta === "/panel" ? teNecesitan : 0;
        return (
          <Link
            key={s.ruta}
            href={s.ruta}
            aria-current={activa(s) ? "page" : undefined}
            title={s.nombre}
            data-patty={`nav-${s.ruta === "/panel" ? "inicio" : s.ruta.split("/").pop()}`}
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
            <span className="nombre">{s.nombre}</span>
          </Link>
        );
      })}
      <Link
        href="/panel/mas"
        className="solo-escritorio"
        aria-current={ruta.startsWith("/panel/mas") ? "page" : undefined}
        title="Más"
        data-patty="nav-mas"
      >
        <span className="icono">
          <IconoMas tamano={26} />
        </span>
        <span className="nombre">Más</span>
      </Link>
    </nav>
  );
}
