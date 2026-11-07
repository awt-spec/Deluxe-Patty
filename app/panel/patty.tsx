"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { preguntarAPatty } from "./patty-acciones";

// Botón flotante en cada página del panel para abrir el chat con la asistente (Patty). La conversación
// se guarda en este navegador; Patty lee los datos del negocio en cada pregunta.

type Turno = { autor: "corredor" | "asistente"; texto: string };
const CLAVE = "chat-patty";
const SUGERENCIAS = ["¿Qué tengo hoy?", "¿A quién debería llamar?", "Escríbele a un cliente para confirmar su visita", "¿Cómo va el mes?"];

/** Negritas (**así**) y separadores (---) del texto de Patty, sin interpretar HTML. */
function conFormato(texto: string) {
  return texto
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split(/(\*\*[^*\n]+\*\*)/g)
    .map((parte, i) => (/^\*\*[^*]+\*\*$/.test(parte) ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte));
}

export function Patty({ nombre, corredor }: { nombre: string; corredor: string }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pensando, empezar] = useTransition();
  const fin = useRef<HTMLDivElement>(null);
  const clave = `${CLAVE}:${corredor}`;

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(clave) ?? "[]");
      if (Array.isArray(g)) setTurnos(g.slice(-30));
    } catch {}
  }, [clave]);
  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(turnos.slice(-30)));
    } catch {}
    fin.current?.scrollIntoView({ block: "end" });
  }, [turnos, clave, abierto]);
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, []);

  // En un chat con un cliente y en "Probar la asistente" abajo va otra caja de texto: ahí no se muestra.
  if (ruta.startsWith("/panel/conversaciones/") || ruta.startsWith("/panel/probar")) return null;

  const enviar = (mensaje: string) => {
    const limpio = mensaje.trim();
    if (!limpio || pensando) return;
    const previos = turnos;
    setTurnos([...previos, { autor: "corredor", texto: limpio }]);
    setTexto("");
    setError(null);
    empezar(async () => {
      const r = await preguntarAPatty(previos, limpio);
      if (r.ok) setTurnos((t) => [...t, { autor: "asistente", texto: r.texto }]);
      else setError(r.motivo);
    });
  };

  return (
    <>
      {!abierto && (
        <button type="button" className="patty-boton" onClick={() => setAbierto(true)} aria-label={`Hablar con ${nombre}`}>
          <span className="patty-avatar" aria-hidden>
            {nombre.charAt(0).toUpperCase()}
          </span>
          <span className="patty-boton-texto">{nombre} · IA</span>
        </button>
      )}
      {abierto && (
        <section className="patty-panel" role="dialog" aria-label={`Chat con ${nombre}`}>
          <header className="patty-cabecera">
            <span className="patty-avatar" aria-hidden>
              {nombre.charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{nombre} · IA</strong>
              <small>Tu asistente. Conoce tu agenda, tus clientes y tus casas.</small>
            </span>
            {turnos.length > 0 && (
              <button type="button" className="patty-limpiar" onClick={() => setTurnos([])} title="Empezar de nuevo">
                Nueva
              </button>
            )}
            <button type="button" className="patty-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar">
              ×
            </button>
          </header>
          <div className="patty-mensajes">
            {turnos.length === 0 && (
              <div className="patty-bienvenida">
                <p>
                  Hola, soy <strong>{nombre}</strong>. ¿En qué te ayudo?
                </p>
                <div className="patty-sugerencias">
                  {SUGERENCIAS.map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turnos.map((t, i) => (
              <p key={i} className={`patty-burbuja ${t.autor === "corredor" ? "mia" : "suya"}`}>
                {t.autor === "asistente" ? conFormato(t.texto) : t.texto}
              </p>
            ))}
            {pensando && <p className="patty-burbuja suya pensando">{nombre} está escribiendo…</p>}
            {error && <p className="aviso">{error}</p>}
            <div ref={fin} />
          </div>
          <form
            className="patty-escribir"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar(texto);
                }
              }}
              placeholder={`Escríbele a ${nombre}…`}
              rows={1}
              aria-label={`Mensaje para ${nombre}`}
            />
            <button type="submit" className="primario" disabled={pensando || !texto.trim()}>
              Enviar
            </button>
          </form>
        </section>
      )}
    </>
  );
}
