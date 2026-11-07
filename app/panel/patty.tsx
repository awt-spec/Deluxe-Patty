"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { preguntarAPatty } from "./patty-acciones";

// Botón flotante en cada página del panel para abrir el chat con la asistente (Patty). La conversación
// se guarda en este navegador; Patty lee los datos del negocio en cada pregunta.

type Turno = { autor: "corredor" | "asistente"; texto: string };
const CLAVE = "chat-patty";
// Lo que se le puede pedir en cada pantalla (la primera que calce).
const SUGERENCIAS: [RegExp, string, string[]][] = [
  [/^\/panel\/clientes\/[0-9a-f-]{36}/, "Estás en la ficha de un cliente.", ["¿Qué le digo a este cliente?", "¿Qué casa le ofrezco?", "Escríbele un mensaje de seguimiento", "¿Cómo le pongo un recordatorio?"]],
  [/^\/panel\/clientes/, "Estás en Clientes.", ["¿A quién debería llamar?", "¿Cómo muevo un cliente de etapa?", "¿Cómo agrego un cliente?", "¿Cómo va el mes?"]],
  [/^\/panel\/agenda\/visita/, "Estás en una visita.", ["¿Qué le digo al confirmar?", "¿Cómo la muevo a otro día?", "Prepárame para esta visita"]],
  [/^\/panel\/agenda\/horario/, "Estás en Mi horario.", ["¿Cómo bloqueo un día?", "¿Para qué sirve desde dónde salgo?"]],
  [/^\/panel\/agenda/, "Estás en la Agenda.", ["¿Qué visitas tengo esta semana?", "¿Cómo agendo una visita?", "¿Cómo cancelo una visita?"]],
  [/^\/panel\/propiedades\/[0-9a-f-]{36}/, "Estás en la ficha de una casa.", ["¿A qué clientes les sirve esta casa?", "¿Cómo hago la ficha en PDF?", "Escríbeme un texto para ofrecerla"]],
  [/^\/panel\/propiedades/, "Estás en Mis casas.", ["¿Cómo agrego una casa?", "¿Qué casa se mueve más?", "¿Cómo mejoro las fotos?"]],
  [/^\/panel\/cerebro/, "Estás en el Cerebro de la asistente.", ["¿Cómo le enseño algo?", "¿Qué preguntas no supo contestar?"]],
  [/^\/panel\/duenos/, "Estás en Dueños directos.", ["¿Cómo funciona la búsqueda de dueños?", "¿Cómo instalo la extensión?"]],
  [/^\/panel\/ajustes/, "Estás en Ajustes.", ["¿Qué hace cada ajuste?", "¿Cómo conecto mi Gmail?"]],
  [/^\/panel\/revisar/, "Estás revisando respuestas.", ["¿Cómo corrijo una respuesta?", "¿Qué pasa si le doy No enviar?"]],
  [/.*/, "", ["¿Qué tengo hoy?", "¿A quién debería llamar?", "¿Dónde veo mis visitas?", "¿Cómo va el mes?"]],
];

/** Abre el chat de Patty desde cualquier botón de la página, con una pregunta lista. */
export function abrirPatty(pregunta?: string) {
  window.dispatchEvent(new CustomEvent("abrir-patty", { detail: pregunta ?? null }));
}

/**
 * Negritas (**así**), enlaces del panel ([Agenda](/panel/agenda)) y sin separadores (---). Solo se
 * vuelven enlace las rutas del propio panel; lo demás queda como texto. Nunca se interpreta HTML.
 */
function conFormato(texto: string, alIr: () => void) {
  return texto
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\s]+\))/g)
    .map((parte, i) => {
      if (/^\*\*[^*]+\*\*$/.test(parte)) return <strong key={i}>{parte.slice(2, -2)}</strong>;
      const enlace = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(parte);
      if (enlace) {
        return /^\/panel(\/[\w\-/?=&.]*)?$/.test(enlace[2]) ? (
          <Link key={i} href={enlace[2]} className="patty-enlace" onClick={alIr}>
            {enlace[1]}
          </Link>
        ) : (
          enlace[1]
        );
      }
      return parte;
    });
}

export function Patty({ nombre, corredor }: { nombre: string; corredor: string }) {
  const ruta = usePathname();
  const busqueda = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);
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
    const abrir = (e: Event) => {
      setAbierto(true);
      const pregunta = (e as CustomEvent<string | null>).detail;
      if (pregunta) setPendiente(pregunta);
    };
    window.addEventListener("abrir-patty", abrir);
    return () => window.removeEventListener("abrir-patty", abrir);
  }, []);
  useEffect(() => {
    const cerrar = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, []);

  // Una pregunta que llegó desde un botón de la página se manda en cuanto el chat está abierto.
  useEffect(() => {
    if (pendiente && abierto) {
      enviar(pendiente);
      setPendiente(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendiente, abierto]);

  // En un chat con un cliente y en "Probar la asistente" abajo va otra caja de texto: ahí no se muestra.
  if (ruta.startsWith("/panel/conversaciones/") || ruta.startsWith("/panel/probar")) return null;

  const [, aviso, sugerencias] = SUGERENCIAS.find(([r]) => r.test(ruta))!;

  function enviar(mensaje: string) {
    const limpio = mensaje.trim();
    if (!limpio || pensando) return;
    const previos = turnos;
    setTurnos([...previos, { autor: "corredor", texto: limpio }]);
    setTexto("");
    setError(null);
    const dondeEsta = `${ruta}${busqueda.toString() ? `?${busqueda}` : ""}`;
    empezar(async () => {
      const r = await preguntarAPatty(previos, limpio, dondeEsta);
      if (r.ok) setTurnos((t) => [...t, { autor: "asistente", texto: r.texto }]);
      else setError(r.motivo);
    });
  }

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
                  Hola, soy <strong>{nombre}</strong>. {aviso} ¿En qué te ayudo? Si no sabes dónde está algo, pregúntame y
                  te llevo.
                </p>
                <div className="patty-sugerencias">
                  {sugerencias.map((s) => (
                    <button key={s} type="button" onClick={() => enviar(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turnos.map((t, i) => (
              <p key={i} className={`patty-burbuja ${t.autor === "corredor" ? "mia" : "suya"}`}>
                {t.autor === "asistente" ? conFormato(t.texto, () => window.innerWidth < 900 && setAbierto(false)) : t.texto}
              </p>
            ))}
            {pensando && <p className="patty-burbuja suya pensando">{nombre} está escribiendo…</p>}
            {error && <p className="aviso">{error}</p>}
            <div ref={fin} />
          </div>
          {turnos.length > 0 && !pensando && (
            <div className="patty-atajos">
              {sugerencias.slice(0, 3).map((s) => (
                <button key={s} type="button" onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
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
