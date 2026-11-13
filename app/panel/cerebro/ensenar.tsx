"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ensenar } from "./acciones";

// "Enséñale algo": la pregunta y lo que debe contestar, con ideas tocables que llenan la pregunta. Comisiones no
// llena nada: avisa que ese tema la asistente no lo contesta, te lo pasa a ti. Guarda con la acción de siempre.

type Ejemplo = { clave: string; nombre: string; tema: string; respuesta: string };

const EJEMPLOS: Ejemplo[] = [
  { clave: "mascotas", nombre: "Mascotas", tema: "¿Aceptan mascotas en los alquileres?", respuesta: "Sí, perros pequeños, con un depósito extra de un mes." },
  { clave: "parqueo", nombre: "Parqueo", tema: "¿Cuántos parqueos tienen las casas?", respuesta: "La mayoría tiene dos. Si la ficha no lo dice, lo confirmo con el dueño." },
  { clave: "pagos", nombre: "Formas de pago", tema: "¿Qué formas de pago aceptan?", respuesta: "Transferencia o crédito bancario. Para apartar la casa se pide una reserva." },
  { clave: "visitas", nombre: "Horarios de visita", tema: "¿Se puede ver la casa el fin de semana?", respuesta: "Sí, los sábados en la mañana, siempre con cita." },
  { clave: "zonas", nombre: "Zonas", tema: "¿En qué zonas trabajan?", respuesta: "Escazú, Santa Ana, Lindora y alrededores." },
  { clave: "comisiones", nombre: "Comisiones", tema: "", respuesta: "" },
];

export function EnsenaleAlgo({ nombre }: { nombre: string }) {
  const tema = useRef<HTMLInputElement>(null);
  const respuesta = useRef<HTMLTextAreaElement>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const ejemplo = EJEMPLOS.find((e) => e.clave === elegido);

  const elegir = (e: Ejemplo) => {
    setElegido(e.clave);
    if (e.clave === "comisiones") return;
    if (tema.current) tema.current.value = e.tema;
    respuesta.current?.focus();
  };

  return (
    <section id="ensenar" className="cer-caja cer-ensenar" aria-labelledby="ensenar-titulo">
      <h2 id="ensenar-titulo">Enséñale algo</h2>
      <p className="suave">Lo que le escribas aquí lo usa desde ya para contestar a tus clientes.</p>
      <div className="cer-ideas" role="group" aria-label="Ideas para empezar" data-patty="cerebro-ejemplos">
        {EJEMPLOS.map((e) => (
          <button key={e.clave} type="button" className="cer-idea" aria-pressed={elegido === e.clave} onClick={() => elegir(e)}>
            {e.nombre}
          </button>
        ))}
      </div>
      {elegido === "comisiones" ? (
        <p className="cer-nota" role="status">
          Las comisiones no se las contesta a tus clientes: cuando alguien pregunta, {nombre} te avisa a ti para que lo hables
          tú. Ese tema está en <Link href="/panel/ajustes">Temas que van a ti</Link>.
        </p>
      ) : null}
      <form action={ensenar} className="cer-ensenar-form">
        <label htmlFor="tema">¿Qué te preguntan?</label>
        <input ref={tema} data-patty="cerebro-ensenar" id="tema" name="tema" type="text" maxLength={300} placeholder="¿Aceptan mascotas en los alquileres?" required />
        <label htmlFor="respuesta">¿Qué quieres que conteste?</label>
        <textarea
          ref={respuesta}
          data-patty="cerebro-ensenar-respuesta"
          id="respuesta"
          name="respuesta"
          rows={4}
          maxLength={2000}
          placeholder={ejemplo?.respuesta || "Sí, perros pequeños, con un depósito extra de un mes."}
          required
        />
        <button type="submit" className="primario">
          Guardar
        </button>
      </form>
    </section>
  );
}
