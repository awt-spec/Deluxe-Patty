"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FichaParcial } from "@/lib/datos/tipos";
import { conversarCasa, guardarCasaConversada } from "../acciones";
import { SubirFotos } from "../subir-fotos";

// Agregar una casa como en WhatsApp: el corredor cuenta, la asistente pregunta lo que falta, muestra
// cómo quedó y, al confirmar, la guarda y pide las fotos.

type Linea = { autor: "corredor" | "asistente"; texto: string };

const SALUDO =
  "Cuéntame de la casa como se la contarías a una colega: dónde está, si es venta o alquiler, el precio, " +
  "cuántos cuartos y baños, y lo que tenga de especial.";

export function ChatCasa() {
  const [lineas, setLineas] = useState<Linea[]>([{ autor: "asistente", texto: SALUDO }]);
  const [ficha, setFicha] = useState<FichaParcial | null>(null);
  const [resumen, setResumen] = useState<string[] | null>(null);
  const [guardada, setGuardada] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const final = useRef<HTMLDivElement>(null);

  // Con llaves: en los Chrome nuevos scrollIntoView devuelve una promesa, y si el efecto la devuelve React
  // la toma por la función de limpieza y la página se cae ("destroy is not a function").
  useEffect(() => {
    final.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lineas, resumen, guardada, ocupado]);

  async function enviar() {
    const limpio = texto.trim();
    if (!limpio || ocupado) return;
    const nuevas: Linea[] = [...lineas, { autor: "corredor", texto: limpio }];
    setLineas(nuevas);
    setTexto("");
    setError(null);
    setResumen(null);
    setOcupado(true);
    try {
      // El saludo no es parte de la conversación sobre la casa.
      const r = await conversarCasa(nuevas.slice(1), ficha);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setFicha(r.ficha);
      setLineas([...nuevas, { autor: "asistente", texto: r.mensaje }]);
      if (r.lista) setResumen(r.resumen);
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  async function guardar() {
    if (!ficha || ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await guardarCasaConversada(ficha);
      if ("error" in r) setError(r.error);
      else {
        setGuardada(r.id);
        setResumen(null);
      }
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="pila">
      <section className="hilo" aria-label="Agregar casa" aria-live="polite">
        {lineas.map((l, i) => (
          <div key={i} className={`burbuja ${l.autor === "corredor" ? "saliente" : "cliente"}`}>
            {l.texto}
          </div>
        ))}
        {ocupado && <p className="nota-prueba">Anotando…</p>}
        {resumen && !guardada && (
          <div className="tarjeta pila ficha-resumen">
            {resumen.map((r, i) => (i === 0 ? <strong key={i}>{r}</strong> : <span key={i}>{r}</span>))}
            <button type="button" className="primario grande" onClick={() => void guardar()} disabled={ocupado}>
              ✓ Sí, guardarla
            </button>
            <p className="suave">¿Algo está mal o falta? Escríbemelo abajo y lo cambio.</p>
          </div>
        )}
        {guardada && (
          <>
            <div className="burbuja cliente">¡Listo, ya la guardé! Ahora súbele las fotos 📷 La primera que subas será la principal.</div>
            <SubirFotos propiedadId={guardada} />
            <Link href={`/panel/propiedades/${guardada}`} className="boton grande">
              Terminé
            </Link>
          </>
        )}
        <div ref={final} />
      </section>

      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}
      {!guardada && (
        <form
          className="pila tarjeta"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <label htmlFor="mensaje-casa">Escribe aquí</label>
          <textarea
            id="mensaje-casa"
            rows={3}
            value={texto}
            maxLength={2000}
            placeholder="Ej.: casa en Escazú, en venta, 450 mil, 3 cuartos, piscina"
            onChange={(e) => setTexto(e.target.value)}
          />
          <button type="submit" className="primario grande" disabled={ocupado || !texto.trim()}>
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}
