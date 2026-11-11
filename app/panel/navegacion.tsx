"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { salir } from "./acciones";
import {
  IconoAbajo,
  IconoAgenda,
  IconoAjustes,
  IconoAnuncio,
  IconoCasa,
  IconoChats,
  IconoIdea,
  IconoInicio,
  IconoLlave,
  IconoMas,
  IconoPersonas,
  IconoProbar,
  IconoResumen,
  IconoSalir,
} from "./iconos";

const CLAVE_PLEGADO = "menu-plegado";

// Teléfono: cuatro botones grandes abajo (lo demás en "Más", desde Inicio). Computadora: menú a la izquierda con
// las mismas cuatro secciones arriba, las herramientas que en el teléfono están en "Más" y la cuenta abajo.
const SECCIONES = [
  { ruta: "/panel", nombre: "Inicio", Icono: IconoInicio, tambien: ["/panel/conversaciones", "/panel/revisar"] },
  { ruta: "/panel/clientes", nombre: "Clientes", Icono: IconoPersonas, tambien: [] },
  { ruta: "/panel/agenda", nombre: "Agenda", Icono: IconoAgenda, tambien: [] },
  { ruta: "/panel/propiedades", nombre: "Mis casas", Icono: IconoCasa, tambien: [] },
];

const HERRAMIENTAS = [
  { ruta: "/panel/negocio", nombre: "Cómo va el negocio", Icono: IconoResumen },
  { ruta: "/panel/duenos", nombre: "Dueños directos", Icono: IconoLlave },
  { ruta: "/panel/anuncios", nombre: "Anuncios", Icono: IconoAnuncio },
  { ruta: "/panel/cerebro", nombre: "Cerebro de la asistente", Icono: IconoIdea },
  { ruta: "/panel/probar", nombre: "Probar la asistente", Icono: IconoProbar },
];

const iniciales = (t: string) =>
  t
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** `teNecesitan`: clientes que esperan al corredor; se ven como un número en Inicio. */
export function Navegacion({
  teNecesitan,
  marca,
  logo,
  fondoLogo,
  demo,
  correo,
  asistente,
  superadmin,
}: {
  teNecesitan: number;
  marca: string;
  /** Dirección del logo del corredor (o null: van las iniciales). */
  logo: string | null;
  fondoLogo: string | null;
  demo: boolean;
  correo: string;
  asistente: string;
  superadmin: boolean;
}) {
  const ruta = usePathname();
  // En computadora el menú se puede contraer (solo íconos) y se recuerda en este navegador.
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
  const activa = (s: { ruta: string; tambien?: string[] }) =>
    s.ruta === "/panel" ? ruta === "/panel" || (s.tambien ?? []).some((r) => ruta.startsWith(r)) : ruta.startsWith(s.ruta);
  const nombreMarca = marca.replace(/\s*\(demo\)\s*$/i, "");

  return (
    // Dentro de un chat, como en WhatsApp, en el teléfono abajo va la caja para escribir y no las pestañas.
    <nav className={`navegacion${ruta.startsWith("/panel/conversaciones/") ? " en-chat" : ""}`} aria-label="Secciones">
      <Link href="/panel" className="nav-marca solo-escritorio" title={marca}>
        <span className="nav-logo" style={fondoLogo ? { background: fondoLogo } : undefined} aria-hidden>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo servido por /marca/<slug>/logo (o la URL de la marca): imagen chica y fija.
            <img src={logo} alt="" width={40} height={40} />
          ) : (
            iniciales(nombreMarca) || "A"
          )}
        </span>
        <span className="nav-marca-texto">
          <strong>{nombreMarca}</strong>
          {demo ? <small className="nav-demo">Demo</small> : <small>Asistente {asistente}</small>}
        </span>
      </Link>

      <div className="nav-grupo">
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

      <div className="nav-grupo nav-herramientas solo-escritorio" role="group" aria-labelledby="nav-titulo-herramientas">
        <span className="nav-titulo" id="nav-titulo-herramientas">
          Herramientas
        </span>
        <Link href="/panel/patty" aria-current={ruta.startsWith("/panel/patty") ? "page" : undefined} title={`${asistente} · IA`} data-patty="nav-patty">
          <span className="icono">
            <IconoChats tamano={22} />
          </span>
          <span className="nombre">{asistente} · IA</span>
        </Link>
        {HERRAMIENTAS.map((h) => (
          <Link key={h.ruta} href={h.ruta} aria-current={ruta.startsWith(h.ruta) ? "page" : undefined} title={h.nombre} data-patty={`nav-${h.ruta.split("/").pop()}`}>
            <span className="icono">
              <h.Icono tamano={22} />
            </span>
            <span className="nombre">{h.nombre}</span>
          </Link>
        ))}
        {superadmin && (
          <Link href="/admin" title="Administración">
            <span className="icono">
              <IconoMas tamano={22} />
            </span>
            <span className="nombre">Administración</span>
          </Link>
        )}
      </div>

      <div className="nav-pie solo-escritorio">
        <Link href="/panel/ajustes" aria-current={ruta.startsWith("/panel/ajustes") ? "page" : undefined} title="Ajustes" data-patty="nav-ajustes">
          <span className="icono">
            <IconoAjustes tamano={22} />
          </span>
          <span className="nombre">Ajustes</span>
        </Link>
        <div className="nav-cuenta">
          <span className="nav-correo" title={correo}>
            {correo}
          </span>
          <form action={salir}>
            <button type="submit" className="nav-salir" title="Salir">
              <IconoSalir tamano={20} />
              <span className="nombre">Salir</span>
            </button>
          </form>
        </div>
        <button type="button" className="plegar" onClick={alternar} aria-expanded={!plegado} title={plegado ? "Abrir el menú" : "Contraer el menú"}>
          <span className="icono" aria-hidden>
            <IconoAbajo tamano={20} />
          </span>
          <span className="nombre">{plegado ? "Abrir el menú" : "Contraer"}</span>
        </button>
      </div>
    </nav>
  );
}
