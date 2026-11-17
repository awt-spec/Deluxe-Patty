"use client";

import Link from "next/link";
import { useState } from "react";
import type { Tono } from "@/lib/admin/atencion";
import { IconoBuscar, IconoFlecha, IconoPersonas } from "../../panel/iconos";
import { Avatar, EnergiaMes, Pildora, Vacio } from "../ui";

// Tabla de corredores con búsqueda y filtro por estado (en el navegador: son pocos). En computadora es una tabla;
// en el teléfono cada fila es una tarjeta (admin.css).

export interface FilaLista {
  id: string;
  nombre: string;
  contacto: string;
  estado: { texto: string; tono: Tono };
  whatsapp: { texto: string; tono: Tono };
  automatica: boolean;
  gastoMes: number;
  topeMes: number;
  mensajesMes: number;
  topeMensajes: number;
  ultimo: string;
}

const FILTROS = ["Todos", "Activo", "Demo", "Pausado"] as const;

export function ListaCorredores({ filas }: { filas: FilaLista[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("Todos");
  const q = busca.trim().toLowerCase();
  const vistas = filas.filter((f) => (filtro === "Todos" || f.estado.texto === filtro) && (!q || `${f.nombre} ${f.contacto}`.toLowerCase().includes(q)));

  return (
    <>
      <div className="ad-filtros">
        <label className="ad-buscar">
          <IconoBuscar tamano={20} />
          <span className="ad-oculto">Buscar corredor</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre" autoComplete="off" />
        </label>
        <div className="ad-segmentos" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((x) => (
            <button key={x} type="button" aria-pressed={filtro === x} onClick={() => setFiltro(x)}>
              {x}
              <span className="ad-segmento-n">{x === "Todos" ? filas.length : filas.filter((f) => f.estado.texto === x).length}</span>
            </button>
          ))}
        </div>
      </div>

      {vistas.length === 0 ? (
        <Vacio icono={<IconoPersonas tamano={28} />} titulo={filas.length === 0 ? "Todavía no hay corredores" : "Ningún corredor coincide"}>
          {filas.length === 0 ? "Cuando se cargue el primero aparece aquí." : "Prueba con otro nombre o quita el filtro."}
        </Vacio>
      ) : (
        <div className="ad-tabla-marco">
          <table className="ad-tabla ad-tabla-corredores">
            <thead>
              <tr>
                <th scope="col">Corredor</th>
                <th scope="col">Estado</th>
                <th scope="col">WhatsApp</th>
                <th scope="col">Respuestas</th>
                <th scope="col">Energía del mes</th>
                <th scope="col">Mensajes</th>
                <th scope="col">
                  <span className="ad-oculto">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vistas.map((f) => (
                <tr key={f.id}>
                  <td className="ad-celda-nombre">
                    <div className="ad-nombre-fila">
                      <Avatar nombre={f.nombre} tamano={40} />
                    <span>
                      <Link href={`/admin/corredores/${f.id}`} className="ad-enlace-fila">
                        {f.nombre}
                      </Link>
                      <span className="ad-suave">Último mensaje {f.ultimo}</span>
                    </span>
                    </div>
                  </td>
                  <td data-etiqueta="Estado">
                    <Pildora tono={f.estado.tono}>{f.estado.texto}</Pildora>
                  </td>
                  <td data-etiqueta="WhatsApp">
                    <Pildora tono={f.whatsapp.tono}>{f.whatsapp.texto}</Pildora>
                  </td>
                  <td data-etiqueta="Respuestas">
                    {f.automatica ? (
                      <Pildora tono="info" punto={false}>
                        Automáticas
                      </Pildora>
                    ) : (
                      <Pildora tono="gris" punto={false}>
                        Con aprobación
                      </Pildora>
                    )}
                  </td>
                  <td data-etiqueta="Energía" className="ad-celda-energia">
                    <EnergiaMes gastoMes={f.gastoMes} topeMes={f.topeMes} compacta />
                  </td>
                  <td data-etiqueta="Mensajes">
                    <span className="ad-num">
                      {f.mensajesMes.toLocaleString("es-CR")} <span className="ad-suave">de {f.topeMensajes.toLocaleString("es-CR")}</span>
                    </span>
                  </td>
                  <td className="ad-celda-ver">
                    <Link href={`/admin/corredores/${f.id}`} className="ad-boton chico" aria-label={`Ver ${f.nombre}`}>
                      Ver <IconoFlecha tamano={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
