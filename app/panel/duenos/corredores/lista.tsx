"use client";

import { useState } from "react";
import { filtrarConocidos } from "@/lib/panel/duenos";
import { IconoBuscar } from "../../iconos";

// La lista de corredores conocidos con un buscador (por nombre, empresa o teléfono). El filtro corre en el navegador
// sobre lo que ya leyó la página con la sesión del corredor; "Quitar" usa la acción que le pasa la página.

export interface Conocido {
  id: string;
  nombre: string | null;
  telefono: string | null;
  empresa: string | null;
  anunciante_e24_id: string | null;
}

const inicial = (c: Conocido) => (c.nombre ?? c.empresa ?? "").trim().slice(0, 1).toUpperCase() || "#";

/** `quitar` es la acción del servidor (se puede pasar como prop a un componente del navegador). */
export function ListaConocidos({ lista, quitar }: { lista: Conocido[]; quitar: (f: FormData) => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const vistos = filtrarConocidos(lista, q);
  return (
    <section className="cc-lista" aria-labelledby="cc-cuantos">
      <div className="cc-cabeza">
        <h2 id="cc-cuantos">
          {lista.length} {lista.length === 1 ? "corredor" : "corredores"}
        </h2>
        {lista.length > 5 && (
          <label className="cc-buscar">
            <IconoBuscar tamano={20} />
            <span className="solo-lector">Buscar un corredor</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value.slice(0, 80))}
              placeholder="Buscar por nombre, empresa o teléfono"
              autoComplete="off"
              data-patty="corredores-buscar"
            />
          </label>
        )}
      </div>
      {q && (
        <p className="suave cc-resultado" role="status">
          {vistos.length === 0 ? "Nadie con ese nombre o teléfono." : `${vistos.length} de ${lista.length}`}
        </p>
      )}
      <ul>
        {vistos.map((c) => (
          <li key={c.id} className="cc-fila">
            <span className="cc-avatar" aria-hidden>
              {inicial(c)}
            </span>
            <div className="cc-texto">
              <strong>{c.nombre ?? c.telefono ?? "Cuenta de Encuentra24"}</strong>
              <span className="suave">{[c.nombre ? c.telefono : null, c.empresa].filter(Boolean).join(" · ") || " "}</span>
            </div>
            <span className="cc-origen" data-origen={c.anunciante_e24_id ? "anuncio" : "mano"}>
              {c.anunciante_e24_id ? "Desde un anuncio" : "Agregado a mano"}
            </span>
            <form action={quitar} className="cc-quitar">
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="chico peligro" aria-label={`Quitar a ${c.nombre ?? c.telefono ?? "este corredor"}`}>
                Quitar
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
