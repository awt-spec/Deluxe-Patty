"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { comisionEstimada, montoExacto, reglaComision, type Moneda } from "@/lib/crm/dinero";
import { cerrarDesdeTablero, moverEtapa } from "./acciones";

// Tablero de clientes para la computadora: una columna por etapa y cada cliente se arrastra de una
// columna a otra. El cambio se guarda en el momento y la página se actualiza. Al soltar en "Cerró" se
// pide el precio (y la comisión, si no es la de siempre) para que lo ganado cuente desde ya.

export interface TarjetaTablero {
  id: string;
  nombre: string;
  inicial: string;
  color: string;
  resumen: string;
  dias: number;
  estancado: boolean;
  recordatorio: { texto: string; vence: boolean } | null;
  casa: string | null;
  /** Para proponer el cierre: la oferta o el precio de la casa que le interesa, y si es venta o alquiler. */
  cierre: { precio: number | null; moneda: Moneda; operacion: string | null; casaId: string | null };
}

export interface ColumnaTablero {
  etapa: string;
  nombre: string;
  ayuda: string;
  valor: string | null;
  tarjetas: TarjetaTablero[];
}

export function Tablero({ columnas, comisionPct }: { columnas: ColumnaTablero[]; comisionPct: number }) {
  const router = useRouter();
  const [cerrando, setCerrando] = useState<{ t: TarjetaTablero; desde: string } | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  // Mientras se guarda, el cliente ya se ve en su nueva columna.
  const [movidos, setMovidos] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);
  const [, empezar] = useTransition();

  const soltar = (etapa: string, id: string) => {
    setEncima(null);
    setArrastrando(null);
    const actual = columnas.find((c) => c.tarjetas.some((t) => t.id === id))?.etapa;
    if (!id || (movidos[id] ?? actual) === etapa) return;
    if (etapa === "cerrado") {
      const t = columnas.flatMap((c) => c.tarjetas).find((x) => x.id === id);
      if (t) return setCerrando({ t, desde: movidos[id] ?? actual ?? "" });
    }
    mover(id, etapa, actual);
  };

  const mover = (id: string, etapa: string, actual: string | undefined) => {
    setMovidos((m) => ({ ...m, [id]: etapa }));
    empezar(async () => {
      const ok = await moverEtapa(id, etapa);
      setError(!ok);
      if (!ok) setMovidos((m) => ({ ...m, [id]: actual ?? etapa }));
      router.refresh();
    });
  };

  const todas = columnas.flatMap((c) => c.tarjetas.map((t) => ({ t, etapa: movidos[t.id] ?? c.etapa })));

  return (
    <>
      {error && <p className="aviso">No se pudo mover el cliente. Vuelve a intentarlo.</p>}
      {cerrando && (
        <VentanaCierre
          tarjeta={cerrando.t}
          comisionPct={comisionPct}
          alCerrar={() => setCerrando(null)}
          alGuardar={() => {
            setMovidos((m) => ({ ...m, [cerrando.t.id]: "cerrado" }));
            setCerrando(null);
            router.refresh();
          }}
          sinPrecio={() => {
            setCerrando(null);
            mover(cerrando.t.id, "cerrado", cerrando.desde);
          }}
        />
      )}
      <p className="suave tablero-ayuda">Arrastra un cliente a otra columna para cambiar en qué va.</p>
      <div className="tablero">
        {columnas.map((col) => {
          const tarjetas = todas.filter((x) => x.etapa === col.etapa).map((x) => x.t);
          return (
            <section
              key={col.etapa}
              className={`tablero-columna etapa-${col.etapa}${encima === col.etapa ? " encima" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (encima !== col.etapa) setEncima(col.etapa);
              }}
              onDragLeave={() => setEncima((x) => (x === col.etapa ? null : x))}
              onDrop={(e) => {
                e.preventDefault();
                soltar(col.etapa, e.dataTransfer.getData("text/plain"));
              }}
            >
              <h2>
                {col.nombre} <span>{tarjetas.length}</span>
              </h2>
              <p className="suave">{col.ayuda}</p>
              {col.valor && <p className="tablero-valor">{col.valor}</p>}
              {tarjetas.map((t) => (
                <Link
                  key={t.id}
                  href={`/panel/clientes/${t.id}`}
                  className={`cliente-tarjeta${arrastrando === t.id ? " arrastrando" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", t.id);
                    e.dataTransfer.effectAllowed = "move";
                    setArrastrando(t.id);
                  }}
                  onDragEnd={() => {
                    setArrastrando(null);
                    setEncima(null);
                  }}
                >
                  <span className="cliente-cabeza">
                    <span className="avatar" style={{ background: t.color }} aria-hidden>
                      {t.inicial}
                    </span>
                    <strong className="cliente-nombre">{t.nombre}</strong>
                  </span>
                  <span className="cliente-texto">
                    <span className="suave">{t.resumen}</span>
                    {t.casa && <span className="suave">Le interesa: {t.casa}</span>}
                    {t.recordatorio && (
                      <span className={`seguimiento${t.recordatorio.vence ? " vence" : ""}`}>{t.recordatorio.texto}</span>
                    )}
                    <span className={`dias-etapa${t.estancado ? " estancado" : ""}`}>
                      {t.estancado ? `Sin movimiento hace ${t.dias} días` : t.dias === 0 ? "Llegó aquí hoy" : `Aquí hace ${t.dias} ${t.dias === 1 ? "día" : "días"}`}
                    </span>
                  </span>
                </Link>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

/** "¿En cuánto cerró?": precio, moneda y comisión (vacía: la de siempre). */
function VentanaCierre({
  tarjeta,
  comisionPct,
  alCerrar,
  alGuardar,
  sinPrecio,
}: {
  tarjeta: TarjetaTablero;
  comisionPct: number;
  alCerrar: () => void;
  alGuardar: () => void;
  sinPrecio: () => void;
}) {
  const ventana = useRef<HTMLDialogElement>(null);
  const [precio, setPrecio] = useState(tarjeta.cierre.precio ? String(tarjeta.cierre.precio) : "");
  const [moneda, setMoneda] = useState<Moneda>(tarjeta.cierre.moneda);
  const [comision, setComision] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();
  const alquiler = tarjeta.cierre.operacion === "alquiler";
  const numero = Number(precio.replace(/[^\d.,]/g, "").replace(/[.,](?=\d{3}(\D|$))/g, "").replace(",", "."));
  const estimada = numero > 0 ? comisionEstimada(numero, comisionPct, tarjeta.cierre.operacion) : 0;

  useEffect(() => {
    const d = ventana.current;
    if (d && !d.open) d.showModal();
  }, []);

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    empezar(async () => {
      const r = await cerrarDesdeTablero(tarjeta.id, { precio, moneda, comision, casa: tarjeta.cierre.casaId ?? "" });
      if (r.ok) alGuardar();
      else setError(r.motivo);
    });
  };

  return (
    <dialog ref={ventana} className="ventana-cierre" onCancel={alCerrar} aria-labelledby="ventana-cierre-titulo">
      <form onSubmit={guardar} className="pila">
        <h2 id="ventana-cierre-titulo">¡{tarjeta.nombre} cerró!</h2>
        <p className="suave">{tarjeta.casa ? `${tarjeta.casa}. ` : ""}Anota en cuánto, así lo ganado cuenta desde hoy.</p>
        <label htmlFor="vc-precio">{alquiler ? "Renta mensual" : "Precio final"}</label>
        <div className="monto-moneda">
          <input id="vc-precio" type="text" inputMode="numeric" value={precio} onChange={(e) => setPrecio(e.target.value)} required autoFocus />
          <select aria-label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value === "CRC" ? "CRC" : "USD")}>
            <option value="USD">Dólares</option>
            <option value="CRC">Colones</option>
          </select>
        </div>
        <label htmlFor="vc-comision">Tu comisión (vacía: {reglaComision(comisionPct, tarjeta.cierre.operacion)})</label>
        <input
          id="vc-comision"
          type="text"
          inputMode="numeric"
          value={comision}
          onChange={(e) => setComision(e.target.value)}
          placeholder={estimada ? montoExacto(estimada, moneda) : alquiler ? "Un mes de renta" : `${comisionPct}% del precio`}
        />
        {error && <p className="aviso">{error}</p>}
        <div className="botones">
          <button type="submit" className="primario" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar el cierre"}
          </button>
          <button type="button" onClick={sinPrecio} disabled={guardando}>
            Lo anoto después
          </button>
          <button type="button" className="enlace" onClick={alCerrar} disabled={guardando}>
            No cerró
          </button>
        </div>
      </form>
    </dialog>
  );
}
