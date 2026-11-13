"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PEDIDO, type PestanaChat, type TurnoChat } from "@/lib/redes/chat";
import { transcribirNota } from "../../../patty-acciones";

// "Pídeselo a …": chat corto dentro del estudio de redes, uno por pestaña. El corredor pide con sus palabras (o con
// una nota de voz, que vuelve como texto a la caja para revisarla) y la pestaña aplica lo que devuelve el servidor.
// En el teléfono es una barra fija abajo que se abre; en computadora, un panel a la derecha. La conversación queda
// en este navegador por casa y pestaña. "Deshacer" lo resuelve la pestaña (su pila de estados).

export interface RespuestaChat {
  texto: string;
  error?: boolean;
  /** Lo que cambió, armado por el código. */
  cambios?: string[];
  /** Algo que gasta (IA de imágenes): se pregunta antes. `hacer` devuelve lo que se le dice después. */
  confirmar?: { pregunta: string; detalle: string; hacer: () => Promise<RespuestaChat> };
}

type Turno = TurnoChat & { cambios?: string[]; error?: boolean };

const MAX_TURNOS = 20;
const MAX_GRABACION_SEG = 120;

export interface PropsChat {
  /** Para guardar la conversación: casa y pestaña. */
  clave: string;
  asistente: string;
  pestana: PestanaChat;
  sugerencias: string[];
  ayuda: string;
  pedir: (pedido: string, historial: TurnoChat[]) => Promise<RespuestaChat>;
  puedeDeshacer: boolean;
  deshacer: () => void;
  /** Mientras se graba el video, por ejemplo. */
  apagado?: boolean;
}

function guardar(clave: string, turnos: Turno[]) {
  try {
    localStorage.setItem(clave, JSON.stringify(turnos.slice(-MAX_TURNOS)));
  } catch {
    /* sin almacenamiento: la conversación vive solo en esta pantalla */
  }
}

export function ChatRedes(p: PropsChat) {
  const clave = `redes-chat:${p.clave}:${p.pestana}`;
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [pensando, setPensando] = useState(false);
  const [confirmar, setConfirmar] = useState<RespuestaChat["confirmar"] | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const vivos = useRef<Turno[]>([]);
  const cargado = useRef(false);
  const fin = useRef<HTMLLIElement>(null);
  const caja = useRef<HTMLTextAreaElement>(null);
  const grabadora = useRef<{ rec: MediaRecorder; trozos: Blob[]; flujo: MediaStream; reloj: ReturnType<typeof setTimeout>; cancelado: boolean } | null>(null);

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(clave) ?? "[]");
      if (Array.isArray(g)) {
        vivos.current = g.filter((t) => (t?.autor === "corredor" || t?.autor === "asistente") && typeof t?.texto === "string").slice(-MAX_TURNOS);
        setTurnos(vivos.current);
      }
    } catch {}
    cargado.current = true;
  }, [clave]);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "nearest" });
  }, [turnos, confirmar, pensando]);

  // Si se sale grabando, se suelta el micrófono.
  useEffect(
    () => () => {
      const g = grabadora.current;
      if (g) {
        g.cancelado = true;
        clearTimeout(g.reloj);
        g.flujo.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  function agregar(...nuevos: Turno[]) {
    const lista = [...vivos.current, ...nuevos].slice(-MAX_TURNOS);
    vivos.current = lista;
    if (cargado.current) guardar(clave, lista);
    setTurnos(lista);
  }

  const responder = (r: RespuestaChat) => {
    agregar({ autor: "asistente", texto: r.texto, ...(r.cambios?.length ? { cambios: r.cambios } : {}), ...(r.error ? { error: true } : {}) });
    setConfirmar(r.confirmar ?? null);
  };

  async function enviar(pedido: string) {
    const limpio = pedido.trim().slice(0, MAX_PEDIDO);
    if (!limpio || pensando || p.apagado) return;
    const historial = vivos.current.filter((t) => !t.error).map(({ autor, texto }) => ({ autor, texto }));
    setTexto("");
    setConfirmar(null);
    setAbierto(true);
    agregar({ autor: "corredor", texto: limpio });
    setPensando(true);
    try {
      responder(await p.pedir(limpio, historial));
    } catch {
      responder({ texto: "No se pudo conectar. Revisa el internet e inténtalo de nuevo.", error: true });
    } finally {
      setPensando(false);
    }
  }

  async function aceptar() {
    const c = confirmar;
    if (!c || pensando) return;
    setConfirmar(null);
    agregar({ autor: "corredor", texto: "Sí, hazlo" });
    setPensando(true);
    try {
      responder(await c.hacer());
    } catch {
      responder({ texto: "No se pudo conectar. Revisa el internet e inténtalo de nuevo.", error: true });
    } finally {
      setPensando(false);
    }
  }

  function rechazar() {
    setConfirmar(null);
    agregar({ autor: "corredor", texto: "No, mejor no" }, { autor: "asistente", texto: "Está bien, no la hice. No se gastó nada." });
  }

  async function empezarGrabacion() {
    if (grabadora.current) return;
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo, audioBitsPerSecond: 32_000 } : { audioBitsPerSecond: 32_000 });
      const trozos: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
      rec.onstop = () => void terminarGrabacion();
      const reloj = setTimeout(() => pararGrabacion(false), MAX_GRABACION_SEG * 1000);
      grabadora.current = { rec, trozos, flujo, reloj, cancelado: false };
      setGrabando(true);
      rec.start();
    } catch {
      agregar({ autor: "asistente", texto: "No pude usar el micrófono. Revisa que el navegador tenga permiso.", error: true });
    }
  }

  function pararGrabacion(cancelar: boolean) {
    const g = grabadora.current;
    if (!g) return;
    g.cancelado = cancelar;
    clearTimeout(g.reloj);
    g.flujo.getTracks().forEach((t) => t.stop());
    if (g.rec.state !== "inactive") g.rec.stop();
    setGrabando(false);
  }

  async function terminarGrabacion() {
    const g = grabadora.current;
    grabadora.current = null;
    if (!g || g.cancelado || g.trozos.length === 0) return;
    const tipo = g.rec.mimeType || g.trozos[0].type || "audio/webm";
    setTranscribiendo(true);
    try {
      const fd = new FormData();
      fd.append("audio", new File([new Blob(g.trozos, { type: tipo })], `nota.${tipo.includes("mp4") ? "m4a" : tipo.includes("ogg") ? "ogg" : "webm"}`, { type: tipo }));
      const r = await transcribirNota(fd);
      if (r.ok) {
        setTexto((t) => (t.trim() ? `${t.trim()} ${r.texto}` : r.texto).slice(0, MAX_PEDIDO));
        caja.current?.focus();
      } else agregar({ autor: "asistente", texto: r.motivo, error: true });
    } catch {
      agregar({ autor: "asistente", texto: "No se pudo mandar el audio. Inténtalo de nuevo.", error: true });
    }
    setTranscribiendo(false);
  }

  const ocupado = pensando || !!p.apagado;
  const placeholder = `Pídeselo a ${p.asistente}…`;

  return (
    <aside className={`redes-chat ${abierto ? "abierto" : ""}`} aria-label={`Pídeselo a ${p.asistente}`}>
      <button
        type="button"
        className="redes-chat-barra"
        onClick={() => {
          setAbierto(true);
          setTimeout(() => caja.current?.focus(), 50);
        }}
        aria-expanded={abierto}
        data-patty="redes-chat-abrir"
      >
        <span className="redes-chat-punto" aria-hidden="true">
          IA
        </span>
        <span>{placeholder}</span>
      </button>

      <div className="redes-chat-cuerpo">
        <header className="redes-chat-cabeza">
          <strong>Pídeselo a {p.asistente}</strong>
          <span className="redes-chat-acciones">
            <button type="button" className="boton chico" onClick={p.deshacer} disabled={!p.puedeDeshacer || ocupado} data-patty="redes-chat-deshacer">
              Deshacer
            </button>
            <button type="button" className="boton chico redes-chat-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el chat">
              Cerrar
            </button>
          </span>
        </header>

        <ol className="redes-chat-turnos" aria-live="polite">
          {turnos.length === 0 && <li className="redes-chat-ayuda">{p.ayuda}</li>}
          {turnos.map((t, i) => (
            <li key={i} className={`redes-chat-turno ${t.autor} ${t.error ? "error" : ""}`}>
              <p>{t.texto}</p>
              {t.cambios && t.cambios.length > 0 && (
                <ul className="redes-chat-cambios">
                  {t.cambios.map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {pensando && <li className="redes-chat-turno asistente pensando">Haciéndolo…</li>}
          {confirmar && !pensando && (
            <li className="redes-chat-confirmar" role="group" aria-label="Confirmar">
              <p>
                <strong>{confirmar.pregunta}</strong>
              </p>
              <p className="suave">{confirmar.detalle}</p>
              <div className="redes-chat-si-no">
                <button type="button" className="boton primario" onClick={aceptar} data-patty="redes-chat-si">
                  Sí, hacerla
                </button>
                <button type="button" className="boton" onClick={rechazar}>
                  No
                </button>
              </div>
            </li>
          )}
          <li ref={fin} className="redes-chat-fin" aria-hidden="true" />
        </ol>

        {!pensando && (
          <div className="redes-chat-sugerencias" role="group" aria-label="Ideas">
            {p.sugerencias.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void enviar(s)} disabled={ocupado}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          className="redes-chat-caja"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
        >
          <textarea
            ref={caja}
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_PEDIDO))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
            rows={1}
            placeholder={transcribiendo ? "Pasando el audio a texto…" : grabando ? "Grabando… toca de nuevo para terminar" : placeholder}
            aria-label={placeholder}
            disabled={ocupado || grabando || transcribiendo}
            data-patty="redes-chat-caja"
          />
          <button
            type="button"
            className={`redes-chat-mic ${grabando ? "grabando" : ""}`}
            onClick={() => (grabando ? pararGrabacion(false) : void empezarGrabacion())}
            disabled={ocupado || transcribiendo}
            aria-label={grabando ? "Terminar la nota de voz" : "Decirlo con una nota de voz"}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              {grabando ? (
                <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
              ) : (
                <path
                  fill="currentColor"
                  d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
                />
              )}
            </svg>
          </button>
          <button type="submit" className="redes-chat-enviar" disabled={ocupado || !texto.trim()} aria-label="Enviar" data-patty="redes-chat-enviar">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path fill="currentColor" d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
          </button>
        </form>
      </div>
    </aside>
  );
}
