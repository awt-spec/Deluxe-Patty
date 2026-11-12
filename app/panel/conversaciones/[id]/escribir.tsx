"use client";

import { useRef } from "react";
import { IconoEnviar } from "../../iconos";

// Caja para escribir, como en WhatsApp, con respuestas rápidas: un toque las pone en la caja y se pueden
// cambiar antes de enviar.
// Cada una con su nombre corto (el botón) y el texto que pone en la caja.
const RAPIDAS = [
  [
    "¿Coordinamos visita?",
    "¿Le gustaría que coordinemos una visita para conocerla?",
  ],
  ["Le envío fotos", "Con gusto le envío más fotos."],
  ["Lo confirmo", "Déjeme confirmarlo y le escribo en un momento."],
  ["¿Presupuesto?", "¿Qué presupuesto tiene en mente?"],
  ["¿Qué zona?", "¿En qué zona le gustaría vivir?"],
  ["Gracias", "Muchas gracias, quedo atenta a cualquier consulta."],
] as const;

/** `rapidas`: sin respuestas rápidas cuando hay una respuesta propuesta esperando (no compiten con ella). */
export function Escribir({
  conversacion,
  accion,
  rapidas = true,
}: {
  conversacion: string;
  accion: (f: FormData) => void | Promise<void>;
  rapidas?: boolean;
}) {
  const caja = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={accion} className="escribir-wa">
      {rapidas && (
        <div className="rapidas" role="group" aria-label="Respuestas rápidas">
          {RAPIDAS.map(([corto, t]) => (
            <button
              key={t}
              type="button"
              className="rapida"
              title={t}
              onClick={() => {
                if (!caja.current) return;
                caja.current.value = caja.current.value
                  ? `${caja.current.value} ${t}`
                  : t;
                caja.current.focus();
              }}
            >
              {corto}
            </button>
          ))}
        </div>
      )}
      <div className="escribir-fila">
        <input type="hidden" name="conversacion" value={conversacion} />
        <label htmlFor="texto-nuevo" className="oculto">
          Escribirle
        </label>
        <textarea
          ref={caja}
          id="texto-nuevo"
          name="texto"
          rows={1}
          required
          placeholder="Escribe un mensaje"
        />
        <button type="submit" className="enviar-redondo" aria-label="Enviar">
          <IconoEnviar tamano={26} />
        </button>
      </div>
    </form>
  );
}
