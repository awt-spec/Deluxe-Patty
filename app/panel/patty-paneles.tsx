"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { precio } from "@/lib/formato";
import type { CasaParaRevisar } from "@/lib/panel/herramientas-patty";
import { duenosPatty, revisarCasasPatty, type DuenoReciente } from "./patty-herramientas-acciones";
import "./patty-herramientas.css";

// Tarjetas del chat de Patty que no necesitan elegir una casa: "Revisar mis casas" (qué le falta a cada una, lo
// decide el código) y "Dueños directos" (los últimos que encontró la búsqueda y el botón para buscar más).

export type FinPanel = { texto: string };

export function TarjetaRevisar({ alTerminar }: { alTerminar: (f: FinPanel) => void }) {
  const [datos, setDatos] = useState<{ pendientes: { casa: CasaParaRevisar; problemas: string[] }[]; completas: number; pausadas: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    revisarCasasPatty()
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setDatos(r);
        else setAviso(r.motivo);
      })
      .catch(() => vivo && setAviso("No pude revisar tus casas. Revisa la conexión."));
    return () => {
      vivo = false;
    };
  }, []);

  function cerrar() {
    if (!datos) return alTerminar({ texto: "Listo. Cuando quieras, te reviso las casas otra vez." });
    const n = datos.pendientes.length;
    alTerminar({
      texto:
        n === 0
          ? `Revisé tus casas: todas están completas${datos.pausadas ? ` (y tienes ${datos.pausadas} pausadas)` : ""}.`
          : `Revisé tus casas: ${n} ${n === 1 ? "tiene" : "tienen"} algo pendiente y ${datos.completas} ${datos.completas === 1 ? "está completa" : "están completas"}. Lo más común: ${masComun(datos.pendientes)}.`,
    });
  }

  return (
    <section className="ph-tarjeta" aria-label="Revisar mis casas">
      <header className="ph-cabeza">
        <strong>Revisar mis casas</strong>
        {datos && <span>{datos.pendientes.length ? `${datos.pendientes.length} con pendientes` : "todo al día"}</span>}
        <button type="button" className="ph-cerrar" onClick={cerrar} aria-label="Cerrar">
          ×
        </button>
      </header>
      {!datos && !aviso && <p className="ph-suave">Revisando tus casas…</p>}
      {datos && datos.pendientes.length === 0 && (
        <p>
          Todas tus casas activas tienen fotos, precio, zona y descripción. {datos.completas} {datos.completas === 1 ? "casa" : "casas"} al día.
        </p>
      )}
      {datos && datos.pendientes.length > 0 && (
        <ul className="ph-revisar">
          {datos.pendientes.map(({ casa, problemas }) => (
            <li key={casa.id}>
              <Link href={`/panel/propiedades/${casa.id}`}>
                <strong>{casa.titulo}</strong>
                <small>{casa.codigo}</small>
              </Link>
              <span className="ph-chips">
                {problemas.map((p) => (
                  <span key={p} className="ph-chip">
                    {p}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {datos && (datos.completas > 0 || datos.pausadas > 0) && datos.pendientes.length > 0 && (
        <p className="ph-suave">
          {datos.completas} {datos.completas === 1 ? "casa completa" : "casas completas"}
          {datos.pausadas ? ` · ${datos.pausadas} pausadas` : ""}.
        </p>
      )}
      {aviso && <p className="ph-aviso">{aviso}</p>}
    </section>
  );
}

function masComun(pendientes: { problemas: string[] }[]): string {
  const cuenta = new Map<string, number>();
  for (const { problemas } of pendientes) for (const p of problemas) cuenta.set(p.replace(/^Solo \d+ fotos? .*/, "Pocas fotos"), (cuenta.get(p) ?? 0) + 1);
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([p, n]) => `${p.charAt(0).toLowerCase()}${p.slice(1)} (${n})`)
    .join(" y ");
}

export function TarjetaDuenos({ alTerminar }: { alTerminar: (f: FinPanel) => void }) {
  const [datos, setDatos] = useState<{ recientes: DuenoReciente[]; sinEscribir: number; ultimaSemana: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    duenosPatty()
      .then((r) => {
        if (!vivo) return;
        if (r.ok) setDatos(r);
        else setAviso(r.motivo);
      })
      .catch(() => vivo && setAviso("No pude leer los dueños. Revisa la conexión."));
    return () => {
      vivo = false;
    };
  }, []);

  function cerrar() {
    alTerminar({
      texto: datos
        ? `Tienes ${datos.sinEscribir} ${datos.sinEscribir === 1 ? "dueño" : "dueños"} directos sin escribirles. [Ver Dueños directos](/panel/duenos)`
        : "Listo. [Ver Dueños directos](/panel/duenos)",
    });
  }

  return (
    <section className="ph-tarjeta" aria-label="Dueños directos">
      <header className="ph-cabeza">
        <strong>Dueños directos</strong>
        {datos && <span>{datos.ultimaSemana} nuevos esta semana</span>}
        <button type="button" className="ph-cerrar" onClick={cerrar} aria-label="Cerrar">
          ×
        </button>
      </header>
      {!datos && !aviso && <p className="ph-suave">Buscando los dueños que encontré…</p>}
      {datos && datos.recientes.length === 0 && <p className="ph-suave">No hay dueños nuevos esperando. Puedo buscar más en Encuentra24.</p>}
      {datos && datos.recientes.length > 0 && (
        <>
          <p className="ph-suave">
            {datos.sinEscribir} {datos.sinEscribir === 1 ? "espera" : "esperan"} que les escribas. Los últimos:
          </p>
          <ul className="ph-duenos">
            {datos.recientes.map((d) => (
              <li key={d.id}>
                {d.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto del anuncio en Encuentra24
                  <img src={d.foto} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span className="ph-sin-foto" aria-hidden />
                )}
                <span>
                  <strong>{d.titulo ?? "Propiedad"}</strong>
                  <small>
                    {[d.zona, d.precio ? precio(d.precio, d.moneda ?? "USD") : null].filter(Boolean).join(" · ")}
                  </small>
                </span>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer">
                    Ver
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="ph-botones">
        <Link className="ph-principal" href="/panel/duenos?buscar=1">
          Buscar dueños ahora
        </Link>
        <Link href="/panel/duenos">Escribirles y ver todos</Link>
      </div>
      <p className="ph-suave">La búsqueda corre en tu Chrome con la extensión, a ritmo de persona.</p>
      {aviso && <p className="ph-aviso">{aviso}</p>}
    </section>
  );
}
