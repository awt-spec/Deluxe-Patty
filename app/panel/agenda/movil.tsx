"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { columnaInicialSemana, diaInicialMes, puntosDelDia } from "@/lib/panel/movil";

// Agenda en el teléfono (< 900 px). Semana: tres días a la vista que se deslizan día por día; al abrir, hoy es la
// primera columna y arriba hay "‹ ›" y puntos que dicen qué días se ven. Mes: cada día con puntos de color y, al
// tocarlo, la lista de ese día debajo del calendario. En computadora se ve igual que siempre (todo lo de aquí que
// es solo del teléfono lo esconde agenda-movil.css).

const TELEFONO = "(max-width: 899px)";
const VISIBLES = 3;

function suave(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function SemanaTelefono({ idCal, dias, hoy }: { idCal: string; dias: { iso: string; corto: string; numero: number }[]; hoy: string }) {
  const [primera, setPrimera] = useState(0);
  const cal = useRef<HTMLElement | null>(null);
  const ancho = () => (cal.current?.querySelector(".cal-columna") as HTMLElement | null)?.offsetWidth || 1;

  useEffect(() => {
    const el = document.getElementById(idCal);
    if (!el) return;
    cal.current = el;
    if (window.matchMedia(TELEFONO).matches) el.scrollLeft = columnaInicialSemana(dias.map((d) => d.iso), hoy) * ancho();
    const alMover = () => setPrimera(Math.min(dias.length - VISIBLES, Math.round(el.scrollLeft / ancho())));
    const primeraVez = requestAnimationFrame(alMover);
    el.addEventListener("scroll", alMover, { passive: true });
    return () => {
      cancelAnimationFrame(primeraVez);
      el.removeEventListener("scroll", alMover);
    };
  }, [idCal, dias, hoy]);

  const mover = (paso: number) => cal.current?.scrollTo({ left: Math.max(0, primera + paso) * ancho(), behavior: suave() });
  const ultima = Math.min(dias.length - 1, primera + VISIBLES - 1);
  const de = dias[primera];
  const a = dias[ultima];

  return (
    <div className="cal-semana-nav solo-telefono">
      <button type="button" className="cal-semana-paso" onClick={() => mover(-1)} disabled={primera <= 0} aria-label="Día anterior">
        ‹
      </button>
      <div className="cal-semana-donde">
        <span aria-live="polite">
          {de && a ? `${de.corto} ${de.numero} – ${a.corto} ${a.numero}` : ""}
        </span>
        <span className="cal-semana-puntos" aria-hidden>
          {dias.map((d, i) => (
            <i key={d.iso} className={`${i >= primera && i <= ultima ? "ve" : ""}${d.iso === hoy ? " hoy" : ""}`} />
          ))}
        </span>
      </div>
      <button type="button" className="cal-semana-paso" onClick={() => mover(1)} disabled={primera >= dias.length - VISIBLES} aria-label="Día siguiente">
        ›
      </button>
    </div>
  );
}

export type VisitaMes = { id: string; hora: string; nombre: string; /** Lo que dice la celda en computadora. */ enCelda: string; casa: string | null; color: string; confirmada: boolean };
export type CeldaMes = {
  iso: string;
  dia: number;
  otroMes: boolean;
  hoy: boolean;
  /** "Viernes 13 de noviembre", para la lista del día. */
  titulo: string;
  bloqueo: { texto: string; todo: boolean; motivo: string | null } | null;
  visitas: VisitaMes[];
  hrefDia: string;
  hrefAgendar: string | null;
};

export function MesCalendario({ celdas, mes, hoy, pedido }: { celdas: CeldaMes[]; mes: string; hoy: string; pedido?: string }) {
  const [elegido, setElegido] = useState(() =>
    diaInicialMes(
      mes,
      hoy,
      celdas.filter((c) => c.visitas.length).map((c) => c.iso),
      pedido,
    ),
  );
  const lista = useRef<HTMLElement>(null);
  const dia = celdas.find((c) => c.iso === elegido);

  const elegir = (e: React.MouseEvent, c: CeldaMes) => {
    // En la computadora cada día lleva a su vista; en el teléfono se elige aquí y la lista sale debajo.
    if (!window.matchMedia(TELEFONO).matches) return;
    e.preventDefault();
    setElegido(c.iso);
    requestAnimationFrame(() => lista.current?.scrollIntoView({ block: "nearest", behavior: suave() }));
  };

  return (
    <>
      <div className="cal-mes">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <span key={d} className="cal-mes-dia-semana">
            {d}
          </span>
        ))}
        {celdas.map((c) => {
          const { puntos, mas } = puntosDelDia(c.visitas.length);
          return (
            <Link
              key={c.iso}
              href={c.hrefDia}
              onClick={(e) => elegir(e, c)}
              className={`cal-mes-celda${c.otroMes ? " otro-mes" : ""}${c.hoy ? " hoy" : ""}${c.iso === elegido ? " elegido" : ""}`}
              aria-label={`${c.titulo}${c.visitas.length ? `, ${c.visitas.length} ${c.visitas.length === 1 ? "visita" : "visitas"}` : ""}${c.bloqueo ? ", apartado" : ""}`}
            >
              <strong>{c.dia}</strong>
              {c.bloqueo && (
                <span className={`cal-mes-bloqueo${c.bloqueo.todo ? " todo" : ""}`} title={c.bloqueo.motivo ? `Apartado: ${c.bloqueo.motivo}` : "Apartado"}>
                  {c.bloqueo.todo ? (c.bloqueo.motivo ?? "Apartado") : c.bloqueo.texto}
                </span>
              )}
              {c.visitas.slice(0, 2).map((v) => (
                <span key={v.id} className="cal-mes-cita" style={{ borderLeft: `3px solid ${v.color}` }}>
                  {v.hora} {v.enCelda}
                </span>
              ))}
              {c.visitas.length > 2 && <span className="suave">y {c.visitas.length - 2} más</span>}
              {(puntos > 0 || (c.bloqueo && !c.bloqueo.todo)) && (
                <span className="cal-mes-puntos" aria-hidden>
                  {c.visitas.slice(0, puntos).map((v) => (
                    <i key={v.id} style={{ background: v.color }} />
                  ))}
                  {mas > 0 && <b>+{mas}</b>}
                  {c.bloqueo && !c.bloqueo.todo && <i className="apartado" />}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {dia && (
        <section ref={lista} className="mes-dia solo-telefono" aria-live="polite" aria-label={`Lo del ${dia.titulo}`}>
          <h2>{dia.titulo}</h2>
          {dia.bloqueo && (
            <p className="mes-dia-apartado">
              <strong>Apartado</strong> {dia.bloqueo.todo ? "todo el día" : dia.bloqueo.texto}
              {dia.bloqueo.motivo ? ` · ${dia.bloqueo.motivo}` : ""}
            </p>
          )}
          {dia.visitas.length ? (
            <ul className="mes-dia-lista">
              {dia.visitas.map((v) => (
                <li key={v.id} style={{ ["--zona" as string]: v.color }}>
                  <Link href={`/panel/agenda/visita/${v.id}`}>
                    <span className="mes-dia-hora">{v.hora}</span>
                    <span className="mes-dia-texto">
                      <strong>{v.nombre}</strong>
                      {v.casa && <span className="suave">{v.casa}</span>}
                    </span>
                    <span className={`cal-cita-estado${v.confirmada ? " ok" : ""}`}>{v.confirmada ? "Confirmada" : "Por confirmar"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            !dia.bloqueo && <p className="suave mes-dia-vacio">Sin visitas este día.</p>
          )}
          <div className="mes-dia-botones">
            {dia.hrefAgendar && (
              <Link href={dia.hrefAgendar} className="boton primario">
                + Agendar
              </Link>
            )}
            <Link href={dia.hrefDia} className="boton">
              Ver el día
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
