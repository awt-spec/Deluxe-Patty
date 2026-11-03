"use client";

import { useRef } from "react";
import { IconoEnviar } from "../../iconos";

// Caja para escribir, como en WhatsApp, con respuestas rápidas: un toque las pone en la caja y se pueden
// cambiar antes de enviar.
const RAPIDAS = [
  "¿Le gustaría que coordinemos una visita para conocerla?",
  "Con gusto le envío más fotos.",
  "Déjeme confirmarlo y le escribo en un momento.",
  "¿Qué presupuesto tiene en mente?",
  "¿En qué zona le gustaría vivir?",
  "Muchas gracias, quedo atenta a cualquier consulta.",
];

export function Escribir({ conversacion, accion }: { conversacion: string; accion: (f: FormData) => void | Promise<void> }) {
  const caja = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={accion} className="escribir-wa">
      <div className="rapidas" role="group" aria-label="Respuestas rápidas">
        {RAPIDAS.map((t) => (
          <button
            key={t}
            type="button"
            className="rapida"
            onClick={() => {
              if (!caja.current) return;
              caja.current.value = caja.current.value ? `${caja.current.value} ${t}` : t;
              caja.current.focus();
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="escribir-fila">
        <input type="hidden" name="conversacion" value={conversacion} />
        <label htmlFor="texto-nuevo" className="oculto">
          Escribirle
        </label>
        <textarea ref={caja} id="texto-nuevo" name="texto" rows={1} required placeholder="Escribe un mensaje" />
        <button type="submit" className="enviar-redondo" aria-label="Enviar">
          <IconoEnviar tamano={26} />
        </button>
      </div>
    </form>
  );
}
