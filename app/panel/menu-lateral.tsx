"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { atajoDe, esCampo } from "@/lib/panel/atajos";
import { salir } from "./acciones";
import {
  IconoAgenda,
  IconoAjustes,
  IconoAnuncio,
  IconoAsistente,
  IconoCasa,
  IconoContraer,
  IconoIdea,
  IconoInicio,
  IconoLlave,
  IconoMas,
  IconoPantalla,
  IconoPersonas,
  IconoProbar,
  IconoResumen,
  IconoSalir,
  IconoSelector,
} from "./iconos";
import { esActiva } from "./navegacion";
import { abrirPatty } from "./patty";

const CLAVE_PLEGADO = "menu-plegado";

type Enlace = {
  ruta: string;
  nombre: string;
  Icono: (p: { tamano?: number }) => React.ReactElement;
  lugar: string;
  tambien?: string[];
  contador?: "pendientes" | "visitas";
};

const grupos = (asistente: string): { titulo: string; enlaces: Enlace[] }[] => [
  {
    titulo: "Tu día",
    enlaces: [
      { ruta: "/panel", nombre: "Inicio", Icono: IconoInicio, lugar: "nav-inicio", tambien: ["/panel/conversaciones", "/panel/revisar"], contador: "pendientes" },
      { ruta: "/panel/agenda", nombre: "Agenda", Icono: IconoAgenda, lugar: "nav-agenda", contador: "visitas" },
    ],
  },
  {
    titulo: "Tu negocio",
    enlaces: [
      { ruta: "/panel/clientes", nombre: "Clientes", Icono: IconoPersonas, lugar: "nav-clientes" },
      { ruta: "/panel/propiedades", nombre: "Mis casas", Icono: IconoCasa, lugar: "nav-propiedades" },
      { ruta: "/panel/duenos", nombre: "Dueños directos", Icono: IconoLlave, lugar: "nav-duenos" },
      { ruta: "/panel/anuncios", nombre: "Anuncios", Icono: IconoAnuncio, lugar: "nav-anuncios" },
      { ruta: "/panel/negocio", nombre: "Cómo va el negocio", Icono: IconoResumen, lugar: "nav-negocio" },
    ],
  },
  {
    titulo: "Tu asistente",
    enlaces: [
      { ruta: "/panel/cerebro", nombre: "Cerebro", Icono: IconoIdea, lugar: "nav-cerebro" },
      { ruta: "/panel/probar", nombre: "Probar la asistente", Icono: IconoProbar, lugar: "nav-probar" },
      { ruta: "/panel/patty", nombre: `Chat con ${asistente}`, Icono: IconoPantalla, lugar: "nav-patty" },
    ],
  },
];

const iniciales = (t: string, n = 2) =>
  t
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/**
 * Menú de la izquierda (solo computadora): oscuro con la marca del corredor (`colores`: variables CSS de
 * `lib/panel/colores-menu.ts`), alto completo y fijo, con la asistente arriba, tres grupos y la cuenta abajo.
 * Se contrae a íconos (se recuerda en este navegador) y tiene atajos de teclado (g + i/c/a/m, "/" y Ctrl/⌘+K).
 */
export function MenuLateral({
  teNecesitan,
  visitasHoy,
  marca,
  logo,
  fondoLogo,
  demo,
  correo,
  nombre,
  asistente,
  superadmin,
  colores,
}: {
  teNecesitan: number;
  /** Visitas de hoy por hacer, o null si no se pudo contar (sin número). */
  visitasHoy: number | null;
  marca: string;
  /** Dirección del logo del corredor (o null: van las iniciales). */
  logo: string | null;
  fondoLogo: string | null;
  demo: boolean;
  correo: string;
  /** Nombre de la persona (corredor) para la tarjeta de la cuenta. */
  nombre: string;
  asistente: string;
  superadmin: boolean;
  colores: Record<string, string>;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const [plegado, setPlegado] = useState(false);
  const [tip, setTip] = useState<{ texto: string; top: number } | null>(null);
  const cuenta = useRef<HTMLDetailsElement>(null);

  // El estado contraído se recuerda en este navegador; la clase va en .marco para que la página corra al lado.
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
    setTip(null);
    try {
      localStorage.setItem(CLAVE_PLEGADO, nuevo ? "1" : "0");
    } catch {}
  };

  // Al cambiar de pantalla se cierra el menú de la cuenta.
  useEffect(() => {
    if (cuenta.current) cuenta.current.open = false;
  }, [ruta]);

  // Menú de la cuenta: se cierra con Escape o tocando fuera.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      const d = cuenta.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const escape = (e: KeyboardEvent) => {
      const d = cuenta.current;
      if (e.key === "Escape" && d?.open) {
        d.open = false;
        d.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  // Atajos de teclado, solo en computadora y nunca mientras se escribe en un campo.
  useEffect(() => {
    let gEn: number | null = null;
    const tecla = (e: KeyboardEvent) => {
      if (!window.matchMedia("(min-width: 900px)").matches) return;
      const a = atajoDe({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, enCampo: esCampo(e.target) }, gEn, Date.now());
      gEn = a?.tipo === "esperar-g" ? Date.now() : null;
      if (!a || a.tipo === "esperar-g") return;
      e.preventDefault();
      if (a.tipo === "asistente") abrirPatty();
      else router.push(a.ruta);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [router]);

  // Contraído: el nombre de cada botón sale en un globo al pasar o enfocar (fijo, para que el scroll no lo corte).
  const mostrarTip = (e: React.SyntheticEvent) => {
    if (!plegado) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
    if (!el || el.closest("details[open]")) return setTip(null);
    const r = el.getBoundingClientRect();
    setTip({ texto: el.dataset.tip ?? "", top: r.top + r.height / 2 });
  };

  const nombreMarca = marca.replace(/\s*\(demo\)\s*$/i, "");
  const nombreCuenta = nombre.trim() || nombreMarca;
  const numeroDe = (e: Enlace) => (e.contador === "pendientes" ? teNecesitan : e.contador === "visitas" ? (visitasHoy ?? 0) : 0);

  return (
    <aside
      className={`lateral${plegado ? " plegado" : ""}`}
      aria-label="Menú"
      style={colores as React.CSSProperties}
      onMouseOver={mostrarTip}
      onFocus={mostrarTip}
      onMouseLeave={() => setTip(null)}
      onBlur={() => setTip(null)}
    >
      <div className="lat-cabeza">
        <Link href="/panel" className="lat-marca" aria-label={`${nombreMarca}: ir a Inicio`} data-tip={nombreMarca}>
          <span className="lat-logo" style={fondoLogo ? { background: fondoLogo } : undefined} aria-hidden>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo servido por /marca/<slug>/logo (o la URL de la marca): imagen chica y fija.
              <img src={logo} alt="" width={40} height={40} />
            ) : (
              iniciales(nombreMarca) || "A"
            )}
          </span>
          <span className="lat-marca-texto lat-ocultable">
            <strong>{nombreMarca}</strong>
            {demo ? <span className="lat-demo">Demo</span> : <small>Asistente {asistente}</small>}
          </span>
        </Link>
        <button
          type="button"
          className="lat-plegar"
          onClick={alternar}
          aria-expanded={!plegado}
          aria-controls="lat-secciones"
          aria-label={plegado ? "Abrir el menú" : "Contraer el menú"}
          data-tip={plegado ? "Abrir el menú" : undefined}
        >
          <IconoContraer tamano={16} />
        </button>
      </div>

      <button type="button" className="lat-patty" onClick={() => abrirPatty()} data-patty="nav-preguntar" data-tip={`Pregúntale a ${asistente}`} aria-keyshortcuts="/ Control+K Meta+K">
        <span className="lat-icono" aria-hidden>
          <IconoAsistente tamano={20} />
        </span>
        <span className="lat-nombre">Pregúntale a {asistente}</span>
        <kbd className="lat-ocultable" aria-hidden>
          /
        </kbd>
      </button>

      <nav className="lat-medio" id="lat-secciones" aria-label="Secciones">
        {grupos(asistente).map((g, i) => (
          <div className="lat-grupo" key={g.titulo} role="group" aria-labelledby={`lat-g${i}`}>
            <h2 className="lat-titulo" id={`lat-g${i}`}>
              <span className="lat-nombre">{g.titulo}</span>
            </h2>
            <ul>
              {g.enlaces.map((e) => {
                const n = numeroDe(e);
                const actual = esActiva(ruta, e);
                return (
                  <li key={e.ruta}>
                    <Link href={e.ruta} className="lat-enlace" aria-current={actual ? "page" : undefined} data-patty={e.lugar} data-tip={e.nombre}>
                      <span className="lat-icono" aria-hidden>
                        <e.Icono tamano={20} />
                      </span>
                      <span className="lat-nombre">{e.nombre}</span>
                      {n > 0 && (
                        <span
                          className={`lat-contador${e.contador === "visitas" ? " lat-contador-suave" : ""}`}
                          aria-label={
                            e.contador === "visitas"
                              ? `${n} ${n === 1 ? "visita" : "visitas"} hoy`
                              : `${n} te ${n === 1 ? "necesita" : "necesitan"}`
                          }
                        >
                          <span className="lat-ocultable">{n > 9 ? "9+" : n}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="lat-pie">
        <details className="lat-cuenta" ref={cuenta} onToggle={() => setTip(null)}>
          <summary data-patty="nav-cuenta" data-tip={nombreCuenta} aria-label={`Tu cuenta: ${nombreCuenta}`}>
            <span className="lat-avatar" aria-hidden>
              {iniciales(nombreCuenta, 1) || "?"}
            </span>
            <span className="lat-cuenta-texto lat-ocultable">
              <strong>{nombreCuenta}</strong>
              <small title={correo}>{correo}</small>
            </span>
            <span className="lat-cuenta-flecha lat-ocultable" aria-hidden>
              <IconoSelector tamano={16} />
            </span>
          </summary>
          <div className="lat-cuenta-menu">
            <Link href="/panel/ajustes" className="lat-enlace" aria-current={ruta.startsWith("/panel/ajustes") ? "page" : undefined} data-patty="nav-ajustes">
              <span className="lat-icono" aria-hidden>
                <IconoAjustes tamano={20} />
              </span>
              <span className="lat-nombre">Ajustes</span>
            </Link>
            {superadmin && (
              <Link href="/admin" className="lat-enlace">
                <span className="lat-icono" aria-hidden>
                  <IconoMas tamano={20} />
                </span>
                <span className="lat-nombre">Administración</span>
              </Link>
            )}
            <form action={salir}>
              <button type="submit" className="lat-enlace lat-salir">
                <span className="lat-icono" aria-hidden>
                  <IconoSalir tamano={20} />
                </span>
                <span className="lat-nombre">Salir</span>
              </button>
            </form>
            <div className="lat-atajos">
              <p>Atajos de teclado</p>
              <dl>
                <div className="lat-atajo-ancho">
                  <dt>
                    <kbd>g</kbd> y luego
                  </dt>
                </div>
                {[
                  ["i", "Inicio"],
                  ["c", "Clientes"],
                  ["a", "Agenda"],
                  ["m", "Mis casas"],
                ].map(([tecla, que]) => (
                  <div key={que}>
                    <dt>
                      <kbd>{tecla}</kbd>
                    </dt>
                    <dd>{que}</dd>
                  </div>
                ))}
                <div className="lat-atajo-ancho">
                  <dt>
                    <kbd>/</kbd> o <kbd>Ctrl</kbd> <kbd>K</kbd>
                  </dt>
                  <dd>{asistente}</dd>
                </div>
              </dl>
            </div>
          </div>
        </details>
      </div>

      {plegado && tip && (
        <span className="lat-tip" style={{ top: tip.top }} aria-hidden>
          {tip.texto}
        </span>
      )}
    </aside>
  );
}
