"use client";

import { useState } from "react";
import { guardarAjustes } from "../acciones";
import { BotonEnviar } from "../boton-enviar";

// Los dos formularios cortos de la puesta en marcha. Guardan con la misma acción de Ajustes (guardarAjustes con
// `solo`: un solo campo, la misma lectura y validación) y vuelven aquí.

export const EJEMPLOS_TONO = [
  { nombre: "Cordial y de usted", texto: "Cordial y profesional, trato de usted, mensajes cortos y claros, sin emojis." },
  { nombre: "Cercana y de tú", texto: "Cercana y amable, de tú, como una amiga que sabe de casas; mensajes cortos, algún emoji de vez en cuando." },
  { nombre: "Formal y precisa", texto: "Formal y precisa, de usted, con los datos claros y sin rodeos; firma con mi nombre." },
  { nombre: "En el idioma del cliente", texto: "Contesta en el idioma en que escribe el cliente (español o inglés), cordial y breve, de usted en español." },
];

export function FormTono({ actual }: { actual: string }) {
  const [tono, setTono] = useState(actual);
  return (
    <form action={guardarAjustes} className="pasos-form" data-patty="empezar-tono-form">
      <input type="hidden" name="solo" value="tono" />
      <input type="hidden" name="volver" value="/panel/empezar" />
      <p className="pasos-instruccion">Toca el que más se parece a ti. Después lo puedes cambiar con tus palabras.</p>
      <div className="pasos-opciones una-columna" role="group" aria-label="Ejemplos de cómo escribir">
        {EJEMPLOS_TONO.map((e) => (
          <button key={e.nombre} type="button" aria-pressed={tono === e.texto} onClick={() => setTono(e.texto)} data-patty="empezar-tono-ejemplo">
            {e.nombre}
            <small>{e.texto}</small>
          </button>
        ))}
      </div>
      <label htmlFor="empezar-tono">Así quedará (puedes cambiarlo)</label>
      <textarea
        id="empezar-tono"
        name="tono"
        value={tono}
        onChange={(e) => setTono(e.target.value)}
        maxLength={600}
        placeholder="Ejemplo: cordial y profesional, trato de usted, mensajes cortos, sin emojis."
        data-patty="empezar-tono"
      />
      <BotonEnviar texto="Guardar cómo escribe" pendiente="Guardando…" className="primario" />
    </form>
  );
}

export const TEMAS_SUGERIDOS = [
  { tema: "Negociación de precio", ejemplo: "«¿Me lo deja en menos?», «¿Cuál es lo menos?»" },
  { tema: "Comisiones", ejemplo: "«¿Cuánto cobra usted?», «¿La comisión la paga el dueño?»" },
  { tema: "Ofertas formales", ejemplo: "«Quiero hacer una oferta de…», «¿Aceptan contraoferta?»" },
  { tema: "Quejas", ejemplo: "«No me gustó cómo me atendieron», «Nadie me contestó»" },
];

/** Casillas con los temas de siempre más los que el corredor ya tiene; guardar reemplaza la lista. */
export function FormTemas({ actuales }: { actuales: string[] }) {
  const sugeridos = TEMAS_SUGERIDOS.map((t) => t.tema);
  const propios = actuales.filter((t) => !sugeridos.some((s) => s.toLowerCase() === t.toLowerCase()));
  const marcado = (t: string) => actuales.length === 0 || actuales.some((a) => a.toLowerCase() === t.toLowerCase());
  const [elegidos, setElegidos] = useState<string[]>([...sugeridos.filter(marcado), ...propios]);
  const [otro, setOtro] = useState("");
  const alternar = (t: string) => setElegidos((e) => (e.includes(t) ? e.filter((x) => x !== t) : [...e, t]));
  const lista = [...elegidos, ...(otro.trim() ? [otro.trim()] : [])];
  return (
    <form action={guardarAjustes} className="pasos-form" data-patty="empezar-temas-form">
      <input type="hidden" name="solo" value="reglas" />
      <input type="hidden" name="volver" value="/panel/empezar" />
      <input type="hidden" name="reglas" value={lista.join("\n")} />
      <fieldset className="pasos-casillas">
        <legend className="solo-lector">Temas que te pasa a ti</legend>
        {[...TEMAS_SUGERIDOS, ...propios.map((tema) => ({ tema, ejemplo: "" }))].map((t) => (
          <label key={t.tema}>
            <input type="checkbox" checked={elegidos.includes(t.tema)} onChange={() => alternar(t.tema)} data-patty="empezar-tema" />
            <span>
              <strong>{t.tema}</strong>
              {t.ejemplo && <small>{t.ejemplo}</small>}
            </span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="empezar-otro-tema">¿Otro tema? (opcional)</label>
      <input id="empezar-otro-tema" type="text" value={otro} maxLength={80} onChange={(e) => setOtro(e.target.value)} placeholder="Ejemplo: permisos de construcción" />
      <BotonEnviar texto="Guardar mis temas" pendiente="Guardando…" className="primario" />
    </form>
  );
}
