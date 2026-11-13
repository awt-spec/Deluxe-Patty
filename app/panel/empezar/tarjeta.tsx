"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ocultarHasta, sigueOculta } from "@/lib/panel/pasos";
import { IconoFlecha } from "../iconos";
import "../pasos/pasos.css";

// Tarjeta de Inicio mientras falte algo de la puesta en marcha: "Termina de preparar a Patty: 3 de 6 listos", con
// su barra y "Continuar". "Más tarde" la esconde 3 días en este navegador; al completar lo obligatorio no se dibuja.

export function TarjetaPuesta({ corredor, asistente, listos, total, hechos }: { corredor: string; asistente: string; listos: number; total: number; hechos: boolean[] }) {
  const clave = `puesta:luego:${corredor}`;
  // null: todavía no se sabe si la cerró (se lee en el navegador); así no aparece y desaparece de golpe.
  const [visible, setVisible] = useState<boolean | null>(null);
  useEffect(() => {
    let oculta = false;
    try {
      oculta = sigueOculta(window.localStorage.getItem(clave), Date.now());
    } catch {
      // sin almacenamiento: se muestra
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el navegador: se lee al montar para no romper la hidratación.
    setVisible(!oculta);
  }, [clave]);
  if (!visible) return null;
  const luego = () => {
    try {
      window.localStorage.setItem(clave, ocultarHasta(Date.now()));
    } catch {
      // sin almacenamiento: solo se esconde hasta recargar
    }
    setVisible(false);
  };
  return (
    <section className="puesta-tarjeta" aria-labelledby="puesta-titulo" data-patty="inicio-puesta">
      <div className="puesta-tarjeta-texto">
        <strong id="puesta-titulo">
          Termina de preparar a {asistente}: {listos} de {total} listos
        </strong>
        <span className="puesta-segmentos" role="img" aria-label={`${listos} de ${total} pasos listos`}>
          {hechos.map((h, i) => (
            <i key={i} className={h ? "listo" : undefined} />
          ))}
        </span>
        <span>Así contesta como tú, con tus casas y tu horario.</span>
      </div>
      <div className="puesta-tarjeta-acciones">
        <button type="button" className="puesta-luego" onClick={luego} data-patty="inicio-puesta-luego">
          Más tarde
        </button>
        <Link href="/panel/empezar" className="boton primario" data-patty="inicio-puesta-continuar">
          Continuar <IconoFlecha tamano={18} />
        </Link>
      </div>
    </section>
  );
}
