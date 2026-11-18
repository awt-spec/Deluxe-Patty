"use client";

import { useEffect, useRef, useState } from "react";
import { IconoCerrar, IconoEnviar, IconoMicrofono } from "../../iconos";
import { webmAOgg } from "@/lib/medios/ogg-opus";
import { enviarNotaDeVoz } from "./adjuntos-acciones";

// Nota de voz para el cliente, como en WhatsApp: se toca el micrófono, se habla, se escucha y se manda. Se graba en
// el teléfono; si el navegador graba en WebM (Chrome, Android), se pasa a Ogg/Opus aquí mismo para que al cliente le
// llegue como nota de voz. El audio no se guarda en ningún lado: viaja una vez y sale directo a WhatsApp.

const MAX_SEGUNDOS = 5 * 60;
const FORMATOS = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4"];

type Estado =
  | { paso: "quieto" }
  | { paso: "grabando"; desde: number }
  | { paso: "lista"; audio: Blob; url: string; segundos: number }
  | { paso: "enviando" };

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Lo que se manda: Ogg/Opus siempre que se pueda; si no, MP4 (Safari viejo), que WhatsApp acepta como audio. */
async function paraWhatsApp(blob: Blob, tipo: string): Promise<Blob | null> {
  const base = tipo.split(";")[0];
  if (base === "audio/ogg" || base === "audio/mp4") return new Blob([blob], { type: base });
  if (base === "audio/webm") {
    try {
      return new Blob([webmAOgg(new Uint8Array(await blob.arrayBuffer())) as BlobPart], { type: "audio/ogg" });
    } catch {
      return null;
    }
  }
  return null;
}

export function NotaDeVoz({
  conversacion,
  alTerminar,
  alCambiar,
}: {
  conversacion: string;
  alTerminar: (r: { texto: string; error: boolean }) => void;
  /** Avisa si está grabando o con una nota lista (la caja de escribir se esconde mientras tanto). */
  alCambiar: (activo: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ paso: "quieto" });
  const [ahora, setAhora] = useState(0);
  const grabadora = useRef<MediaRecorder | null>(null);
  const partes = useRef<Blob[]>([]);
  const cancelada = useRef(false);

  const activo = estado.paso !== "quieto";
  useEffect(() => alCambiar(activo), [activo, alCambiar]);

  // Reloj mientras graba (y corte a los 5 minutos).
  useEffect(() => {
    if (estado.paso !== "grabando") return;
    const t = setInterval(() => {
      const s = (Date.now() - estado.desde) / 1000;
      setAhora(s);
      if (s >= MAX_SEGUNDOS) grabadora.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [estado]);

  // Al salir de la pantalla se suelta el micrófono y la nota.
  useEffect(
    () => () => {
      cancelada.current = true;
      grabadora.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function empezar() {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      alTerminar({ texto: "Este navegador no deja grabar audio. Prueba con Chrome o Safari actualizados.", error: true });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      alTerminar({ texto: "No pude usar el micrófono. Revisa el permiso del navegador para este sitio.", error: true });
      return;
    }
    const tipo = FORMATOS.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = tipo ? new MediaRecorder(stream, { mimeType: tipo, audioBitsPerSecond: 32_000 }) : new MediaRecorder(stream);
    partes.current = [];
    cancelada.current = false;
    rec.ondataavailable = (e) => e.data.size && partes.current.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cancelada.current) return setEstado({ paso: "quieto" });
      const audio = new Blob(partes.current, { type: rec.mimeType || tipo || "" });
      const segundos = (Date.now() - inicio) / 1000;
      if (segundos < 1 || audio.size < 200) {
        alTerminar({ texto: "La nota quedó muy corta. Mantén el micrófono un poco más.", error: true });
        return setEstado({ paso: "quieto" });
      }
      setEstado({ paso: "lista", audio, url: URL.createObjectURL(audio), segundos });
    };
    grabadora.current = rec;
    const inicio = Date.now();
    rec.start(250);
    setAhora(0);
    setEstado({ paso: "grabando", desde: inicio });
  }

  function cancelar() {
    if (estado.paso === "grabando") {
      cancelada.current = true;
      grabadora.current?.stop();
      return;
    }
    if (estado.paso === "lista") URL.revokeObjectURL(estado.url);
    setEstado({ paso: "quieto" });
  }

  async function mandar() {
    if (estado.paso !== "lista") return;
    const { audio, url, segundos } = estado;
    setEstado({ paso: "enviando" });
    try {
      const listo = await paraWhatsApp(audio, audio.type);
      if (!listo) {
        alTerminar({ texto: "Este navegador graba en un formato que WhatsApp no acepta. Prueba con Chrome o Safari.", error: true });
        setEstado({ paso: "lista", audio, url, segundos });
        return;
      }
      const f = new FormData();
      f.set("conversacion", conversacion);
      f.set("envio", crypto.randomUUID());
      f.set("segundos", String(Math.round(segundos)));
      f.set("audio", new File([listo], listo.type === "audio/ogg" ? "nota.ogg" : "nota.m4a", { type: listo.type }));
      const r = await enviarNotaDeVoz(f);
      if (!r.ok) {
        alTerminar({ texto: r.motivo, error: true });
        setEstado({ paso: "lista", audio, url, segundos });
        return;
      }
      URL.revokeObjectURL(url);
      setEstado({ paso: "quieto" });
      alTerminar({ texto: r.aviso, error: false });
    } catch {
      alTerminar({ texto: "No se pudo enviar. Revisa la conexión e inténtalo de nuevo.", error: true });
      setEstado({ paso: "lista", audio, url, segundos });
    }
  }

  if (estado.paso === "quieto") {
    return (
      <button type="button" className="enviar-redondo microfono" aria-label="Grabar una nota de voz" title="Grabar una nota de voz" onClick={empezar}>
        <IconoMicrofono tamano={24} />
      </button>
    );
  }

  return (
    <div className={`nota-voz-barra ${estado.paso}`} role="group" aria-label="Nota de voz">
      <button type="button" className="nota-voz-cancelar" aria-label="Borrar la nota de voz" onClick={cancelar} disabled={estado.paso === "enviando"}>
        <IconoCerrar tamano={22} />
      </button>
      {estado.paso === "grabando" && (
        <p className="nota-voz-grabando" aria-live="polite">
          <span className="punto-rojo" aria-hidden /> Grabando… <strong>{reloj(ahora)}</strong>
        </p>
      )}
      {estado.paso === "lista" && (
        <audio className="nota-voz-oir" src={estado.url} controls preload="metadata" />
      )}
      {estado.paso === "enviando" && <p className="nota-voz-grabando">Enviando la nota de voz…</p>}
      {estado.paso === "grabando" ? (
        <button type="button" className="enviar-redondo" aria-label="Terminar de grabar" onClick={() => grabadora.current?.stop()}>
          <span className="cuadro-parar" aria-hidden />
        </button>
      ) : (
        <button type="button" className="enviar-redondo" aria-label="Enviar la nota de voz" onClick={mandar} disabled={estado.paso === "enviando"} aria-busy={estado.paso === "enviando"}>
          <IconoEnviar tamano={24} />
        </button>
      )}
    </div>
  );
}
