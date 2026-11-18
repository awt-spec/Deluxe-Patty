"use client";

import { useState, useTransition } from "react";
import { enlaceParaDueno } from "@/lib/panel/duenos";
import { CANALES_MENSAJE, MAX_MENSAJE_DUENO, type MensajeDueno } from "@/lib/panel/mensaje-dueno";
import type { ResultadoMensajes } from "./acciones";

// "Crear mensaje con Patty": Patty prepara tres primeros mensajes para el dueño y el corredor los revisa, los cambia si
// quiere y los manda él (Copiar, Abrir WhatsApp o copiar y abrir el anuncio). Nada se envía solo ni se guarda.

function IconoChispa() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9Z" />
    </svg>
  );
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function Mensaje({ m, telefono, url, alCambiar }: { m: MensajeDueno; telefono: string | null; url: string; alCambiar: (t: string) => void }) {
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const canal = CANALES_MENSAJE.find((c) => c.clave === m.canal)!;
  const id = `dd-msj-${m.canal}`;
  const wa = m.canal !== "formulario" ? enlaceParaDueno(telefono, m.texto) : null;
  const alCopiar = async () => setCopiado((await copiar(m.texto)) ? "si" : "no");
  return (
    <li className="dd-msj">
      <label htmlFor={id}>
        <strong>{canal.titulo}</strong>
        <span>{canal.ayuda}</span>
      </label>
      <textarea id={id} value={m.texto} maxLength={MAX_MENSAJE_DUENO} rows={7} onChange={(e) => alCambiar(e.target.value)} />
      <div className="dd-msj-botones">
        <button type="button" onClick={alCopiar}>
          {copiado === "si" ? "Copiado" : "Copiar"}
        </button>
        {wa ? (
          <a className="boton dd-wa" href={wa} target="_blank" rel="noopener noreferrer">
            Abrir WhatsApp
          </a>
        ) : (
          <button
            type="button"
            onClick={async () => {
              await alCopiar();
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            Copiar y abrir el anuncio
          </button>
        )}
      </div>
      {copiado === "no" && <p className="dd-msj-nota">No pude copiarlo: selecciónalo y cópialo a mano.</p>}
    </li>
  );
}

export function MensajePatty({
  leadId,
  asistente,
  telefono,
  url,
  principal,
  pedir,
  inicial = null,
}: {
  leadId: string;
  asistente: string;
  telefono: string | null;
  url: string;
  /** El botón principal de la tarjeta (en Encontrados) o uno secundario. */
  principal: boolean;
  pedir: (leadId: string) => Promise<ResultadoMensajes>;
  /** Para dibujar un estado sin navegador (pruebas y capturas). */
  inicial?: ResultadoMensajes | null;
}) {
  const [resultado, setResultado] = useState<ResultadoMensajes | null>(inicial);
  const [abierto, setAbierto] = useState(inicial !== null);
  const [ocupado, empezar] = useTransition();

  const crear = () => {
    setAbierto(true);
    empezar(async () => {
      try {
        setResultado(await pedir(leadId));
      } catch {
        setResultado({ ok: false, motivo: "No pude preparar los mensajes. Revisa tu conexión e inténtalo otra vez." });
      }
    });
  };
  const cambiar = (canal: MensajeDueno["canal"]) => (texto: string) =>
    setResultado((r) => (r && r.ok ? { ...r, mensajes: r.mensajes.map((m) => (m.canal === canal ? { ...m, texto } : m)) } : r));

  return (
    <>
      <button type="button" className={principal ? "primario dd-patty-boton" : "dd-patty-boton"} onClick={crear} disabled={ocupado} data-patty="duenos-mensaje">
        <IconoChispa />
        {ocupado ? `${asistente} está escribiendo…` : resultado?.ok ? "Otra versión" : `Crear mensaje con ${asistente}`}
      </button>
      {abierto && (
        <section className="dd-mensajes" aria-label={`Mensajes que preparó ${asistente}`} aria-busy={ocupado}>
          <div className="dd-mensajes-cabeza">
            <strong>Mensajes listos para que los mandes tú</strong>
            <button type="button" className="dd-enlace" onClick={() => setAbierto(false)}>
              Cerrar
            </button>
          </div>
          <p className="dd-mensajes-ayuda">
            {asistente} no le escribe a nadie: revisa, cambia lo que quieras y mándalo desde tu WhatsApp o desde el anuncio.
          </p>
          {ocupado && !resultado?.ok && <p role="status">{asistente} está preparando tres mensajes…</p>}
          {resultado && !resultado.ok && (
            <p className="dd-msj-error" role="alert">
              {resultado.motivo}
            </p>
          )}
          {resultado?.ok && (
            <>
              {(resultado.demo || resultado.aviso) && (
                <p className="dd-msj-aviso" role="status">
                  {resultado.aviso}
                </p>
              )}
              <ol className="dd-msj-lista">
                {resultado.mensajes.map((m) => (
                  <Mensaje key={m.canal} m={m} telefono={telefono} url={url} alCambiar={cambiar(m.canal)} />
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </>
  );
}
