"use client";

import { useState } from "react";
import { fechaCorta } from "@/lib/formato";
import { archivar, responderDuda } from "./acciones";

// "Lo que sabe": tarjetas por tema (casas, pagos, visitas…), con un buscador que filtra aquí mismo. Cada tarjeta
// se cambia o se olvida con las acciones de siempre. Las ubicaciones confirmadas van en su propio grupo (vista.tsx).

export type Saber = { id: string; tema: string; respuesta: string | null; updated_at: string };
export type Grupo = { clave: string; nombre: string; items: Saber[] };
export type Ubicada = { id: string; codigo: string; titulo: string; zona: string; casaId: string | null; updated_at: string };

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function LoQueSabe({ grupos }: { grupos: Grupo[] }) {
  const [buscar, setBuscar] = useState("");
  const q = normal(buscar.trim());
  const pasa = (t: string) => !q || normal(t).includes(q);
  const visibles = grupos.map((g) => ({ ...g, items: g.items.filter((k) => pasa(`${k.tema} ${k.respuesta ?? ""}`)) })).filter((g) => g.items.length);
  const total = grupos.reduce((n, g) => n + g.items.length, 0);
  const hallados = visibles.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="cer-sabe">
      {total > 3 && (
        <div className="cer-buscar">
          <label htmlFor="cer-buscar" className="oculto">
            Buscar en lo que sabe
          </label>
          <input
            id="cer-buscar"
            data-patty="cerebro-buscar"
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar: mascotas, parqueo, pago…"
            autoComplete="off"
          />
          {q && (
            <p className="suave" role="status">
              {hallados ? `${hallados} de ${total}` : `No encontré nada con «${buscar.trim()}».`}
            </p>
          )}
        </div>
      )}

      {visibles.map((g) => (
        <section key={g.clave} className="cer-grupo" aria-labelledby={`grupo-${g.clave}`}>
          <h3 id={`grupo-${g.clave}`}>
            {g.nombre} <span className="cer-grupo-n">{g.items.length}</span>
          </h3>
          <div className="cer-tarjetas">
            {g.items.map((k) => (
              <article key={k.id} className="cer-saber">
                <h4>{k.tema}</h4>
                <p>{k.respuesta}</p>
                <div className="cer-saber-pie">
                  <span className="suave">Enseñado el {fechaCorta(k.updated_at.slice(0, 10))}</span>
                  <details className="cer-cambiar">
                    <summary>Cambiar</summary>
                    <form action={responderDuda} className="cer-cambiar-form">
                      <input type="hidden" name="id" value={k.id} />
                      <input type="hidden" name="ver" value="sabe" />
                      <label htmlFor={`t-${k.id}`}>Pregunta</label>
                      <input id={`t-${k.id}`} name="tema" type="text" defaultValue={k.tema} maxLength={300} />
                      <label htmlFor={`s-${k.id}`}>Respuesta</label>
                      <textarea id={`s-${k.id}`} name="respuesta" rows={3} defaultValue={k.respuesta ?? ""} maxLength={2000} />
                      <div className="botones">
                        <button type="submit" className="primario">
                          Guardar
                        </button>
                        <button type="submit" formAction={archivar} className="peligro">
                          Olvidarlo
                        </button>
                      </div>
                    </form>
                  </details>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

    </div>
  );
}
