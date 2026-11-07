"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moverEtapa } from "./acciones";

// Tablero de clientes para la computadora: una columna por etapa y cada cliente se arrastra de una
// columna a otra. El cambio se guarda en el momento y la página se actualiza.

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
}

export interface ColumnaTablero {
  etapa: string;
  nombre: string;
  ayuda: string;
  valor: string | null;
  tarjetas: TarjetaTablero[];
}

export function Tablero({ columnas }: { columnas: ColumnaTablero[] }) {
  const router = useRouter();
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
                  <span className="avatar" style={{ background: t.color }} aria-hidden>
                    {t.inicial}
                  </span>
                  <span className="cliente-texto">
                    <strong>{t.nombre}</strong>
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
