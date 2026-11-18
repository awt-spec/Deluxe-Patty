"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { IconoCerrar, IconoClip, IconoDocumento, IconoEnviar } from "../../iconos";
import { achicar } from "../../patty-casa";
import {
  ACEPTA_ADJUNTOS,
  BUCKET_ADJUNTO,
  MAX_ADJUNTOS_CHAT,
  claseDeArchivo,
  nombreSeguro,
  problemaDeArchivo,
  type ClaseAdjunto,
} from "@/lib/panel/adjuntos-chat";
import { enviarAdjuntos, prepararAdjuntos } from "./adjuntos-acciones";
import { NotaDeVoz } from "./nota-voz";

// Caja para escribir, como en WhatsApp: respuestas rápidas (un toque las pone en la caja y se pueden cambiar antes
// de enviar) y el clip para mandarle fotos o PDF al cliente. Con archivos, lo escrito va como pie del primero.
const RAPIDAS = [
  ["¿Coordinamos visita?", "¿Le gustaría que coordinemos una visita para conocerla?"],
  ["Le envío fotos", "Con gusto le envío más fotos."],
  ["Lo confirmo", "Déjeme confirmarlo y le escribo en un momento."],
  ["¿Presupuesto?", "¿Qué presupuesto tiene en mente?"],
  ["¿Qué zona?", "¿En qué zona le gustaría vivir?"],
  ["Gracias", "Muchas gracias, quedo atenta a cualquier consulta."],
] as const;

type Elegido = { id: string; archivo: File; clase: ClaseAdjunto; vista: string | null };

/** Enviar: se apaga mientras sale el mensaje (un doble toque no se lo manda dos veces al cliente). */
function BotonMandar({ ocupado }: { ocupado: boolean }) {
  const { pending } = useFormStatus();
  const apagado = pending || ocupado;
  return (
    <button
      type="submit"
      className="enviar-redondo"
      aria-label={apagado ? "Enviando" : "Enviar"}
      aria-busy={apagado}
      disabled={apagado}
    >
      <IconoEnviar tamano={24} />
    </button>
  );
}

/**
 * `rapidas`: sin respuestas rápidas cuando hay una respuesta propuesta esperando (no compiten con ella).
 * `envio`: código de un solo uso del formulario (lib/panel/una-vez.ts); el servidor lo renueva en cada pantalla.
 */
export function Escribir({
  conversacion,
  accion,
  rapidas = true,
  envio,
}: {
  conversacion: string;
  accion: (f: FormData) => void | Promise<void>;
  rapidas?: boolean;
  envio?: string;
}) {
  const caja = useRef<HTMLTextAreaElement>(null);
  const selector = useRef<HTMLInputElement>(null);
  const [elegidos, setElegidos] = useState<Elegido[]>([]);
  const [nota, setNota] = useState<{ texto: string; error: boolean } | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [, empezar] = useTransition();
  const router = useRouter();
  // Con la caja vacía y sin archivos, el botón redondo es el micrófono (como en WhatsApp).
  const [hayTexto, setHayTexto] = useState(false);
  const [grabando, setGrabando] = useState(false);
  const alCambiarVoz = useCallback((activo: boolean) => setGrabando(activo), []);

  // Las miniaturas viven en memoria del navegador: se sueltan al quitarlas o al salir.
  const vistas = useRef<string[]>([]);
  useEffect(() => () => vistas.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function elegir(lista: FileList | null) {
    if (!lista?.length) return;
    const nuevos: Elegido[] = [];
    let problema: string | null = null;
    for (const archivo of Array.from(lista)) {
      const p = problemaDeArchivo(archivo.type, archivo.name, archivo.size);
      const clase = claseDeArchivo(archivo.type, archivo.name);
      if (p || !clase) {
        problema = p;
        continue;
      }
      const vista = clase === "imagen" ? URL.createObjectURL(archivo) : null;
      if (vista) vistas.current.push(vista);
      nuevos.push({ id: crypto.randomUUID(), archivo, clase, vista });
    }
    const todos = [...elegidos, ...nuevos];
    if (todos.length > MAX_ADJUNTOS_CHAT) problema = `Se mandan hasta ${MAX_ADJUNTOS_CHAT} archivos por vez.`;
    setElegidos(todos.slice(0, MAX_ADJUNTOS_CHAT));
    setNota(problema ? { texto: problema, error: true } : null);
    caja.current?.focus();
  }

  function quitar(id: string) {
    setElegidos((xs) => {
      const x = xs.find((e) => e.id === id);
      if (x?.vista) URL.revokeObjectURL(x.vista);
      return xs.filter((e) => e.id !== id);
    });
  }

  async function mandarArchivos() {
    const texto = caja.current?.value ?? "";
    setNota(null);
    setSubiendo("Preparando…");
    try {
      const prep = await prepararAdjuntos(
        conversacion,
        elegidos.map((e) => ({ clase: e.clase, nombre: e.archivo.name })),
      );
      if (!prep.ok) {
        setNota({ texto: prep.motivo, error: true });
        return;
      }
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false },
      });
      const caminos: string[] = [];
      for (const [i, e] of elegidos.entries()) {
        setSubiendo(elegidos.length > 1 ? `Subiendo ${i + 1} de ${elegidos.length}…` : "Subiendo…");
        const { camino, token } = prep.subidas[i];
        // Las fotos se achican a 2400 px y se les quitan los datos ocultos (como la ubicación GPS).
        const cuerpo = e.clase === "imagen" ? await achicar(e.archivo) : e.archivo;
        if (!cuerpo) {
          setNota({ texto: "No pude abrir una de las fotos. Prueba con otra.", error: true });
          return;
        }
        const { error } = await supabase.storage
          .from(BUCKET_ADJUNTO[e.clase])
          .uploadToSignedUrl(camino, token, cuerpo, { contentType: e.clase === "imagen" ? "image/jpeg" : "application/pdf" });
        if (error) {
          setNota({ texto: "No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.", error: true });
          return;
        }
        caminos.push(camino);
      }
      setSubiendo("Enviando…");
      const r = await enviarAdjuntos({ conversacion, caminos, texto, envio: envio ?? crypto.randomUUID() });
      if (!r.ok) {
        setNota({ texto: r.motivo, error: true });
        return;
      }
      elegidos.forEach((e) => e.vista && URL.revokeObjectURL(e.vista));
      setElegidos([]);
      if (caja.current) caja.current.value = "";
      setHayTexto(false);
      setNota({ texto: r.aviso, error: false });
      empezar(() => router.refresh());
    } catch {
      setNota({ texto: "No se pudo enviar. Revisa la conexión e inténtalo de nuevo.", error: true });
    } finally {
      setSubiendo(null);
    }
  }

  const conArchivos = elegidos.length > 0;
  return (
    <form
      action={accion}
      className="escribir-wa"
      onSubmit={(ev) => {
        if (!conArchivos) return;
        ev.preventDefault();
        if (!subiendo) void mandarArchivos();
      }}
    >
      {rapidas && !conArchivos && !grabando && (
        <div className="rapidas" role="group" aria-label="Respuestas rápidas">
          {RAPIDAS.map(([corto, t]) => (
            <button
              key={t}
              type="button"
              className="rapida"
              title={t}
              onClick={() => {
                if (!caja.current) return;
                caja.current.value = caja.current.value ? `${caja.current.value} ${t}` : t;
                setHayTexto(true);
                caja.current.focus();
              }}
            >
              {corto}
            </button>
          ))}
        </div>
      )}

      {conArchivos && (
        <ul className="adjuntos-chat" aria-label="Archivos para mandar">
          {elegidos.map((e) => (
            <li key={e.id} className={`adjunto-chat ${e.clase}`}>
              {e.vista ? (
                // eslint-disable-next-line @next/next/no-img-element -- miniatura local (blob:), no pasa por next/image
                <img src={e.vista} alt="" />
              ) : (
                <span className="adjunto-pdf">
                  <IconoDocumento tamano={26} />
                  <span>{nombreSeguro(e.archivo.name)}</span>
                </span>
              )}
              <button type="button" className="adjunto-quitar" aria-label="Quitar este archivo" onClick={() => quitar(e.id)} disabled={!!subiendo}>
                <IconoCerrar tamano={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(nota || subiendo) && (
        <p className={`escribir-nota${nota?.error && !subiendo ? " error" : ""}`} role="status">
          {subiendo ?? nota?.texto}
        </p>
      )}

      <div className="escribir-fila">
        <input type="hidden" name="conversacion" value={conversacion} />
        {envio && <input type="hidden" name="envio" value={envio} />}
        <input
          ref={selector}
          type="file"
          accept={ACEPTA_ADJUNTOS}
          multiple
          hidden
          onChange={(e) => {
            elegir(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="escribir-caja" hidden={grabando}>
          <button
            type="button"
            className="adjuntar"
            aria-label="Adjuntar fotos o PDF"
            title="Adjuntar fotos o PDF"
            onClick={() => selector.current?.click()}
            disabled={!!subiendo || elegidos.length >= MAX_ADJUNTOS_CHAT}
          >
            <IconoClip tamano={24} />
          </button>
          <label htmlFor="texto-nuevo" className="oculto">
            Escribirle
          </label>
          <textarea
            ref={caja}
            id="texto-nuevo"
            name="texto"
            rows={1}
            required={!conArchivos}
            placeholder={conArchivos ? "Agrega un mensaje (opcional)" : "Escribe un mensaje"}
            onInput={(e) => setHayTexto(e.currentTarget.value.trim().length > 0)}
            onKeyDown={(e) => {
              // En computadora, Enter envía y Shift+Enter baja de línea (como WhatsApp Web).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            onPaste={(e) => {
              if (e.clipboardData.files.length) {
                e.preventDefault();
                elegir(e.clipboardData.files);
              }
            }}
          />
        </div>
        {hayTexto || conArchivos ? (
          <BotonMandar ocupado={!!subiendo} />
        ) : (
          <NotaDeVoz
            conversacion={conversacion}
            alCambiar={alCambiarVoz}
            alTerminar={(r) => {
              setNota(r);
              if (!r.error) empezar(() => router.refresh());
            }}
          />
        )}
      </div>
    </form>
  );
}
