"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BotonCopiar } from "../../../pasos/asistente-pasos";

// Piezas con estado del asistente "Publicar en Encuentra24": copiar cada parte en español o inglés y vigilar si el
// anuncio ya pasó a activo (consulta ligera cada 15 s mientras la pestaña está a la vista).

export interface Partes {
  titulo: string;
  descripcion: string;
}

export function CopiarAnuncio({ es, en, fotos }: { es: Partes; en: Partes | null; fotos: string }) {
  const [idioma, setIdioma] = useState<"es" | "en">("es");
  const t = idioma === "en" && en ? en : es;
  return (
    <>
      {en && (
        <div className="pap-idioma" role="group" aria-label="Idioma del anuncio">
          <button type="button" aria-pressed={idioma === "es"} onClick={() => setIdioma("es")} data-patty="anuncio-espanol">
            Español
          </button>
          <button type="button" aria-pressed={idioma === "en"} onClick={() => setIdioma("en")} data-patty="anuncio-ingles">
            Inglés
          </button>
        </div>
      )}
      <div className="pap-copiable">
        <div className="pap-copiable-cabeza">
          <strong>Título</strong>
          <BotonCopiar texto={t.titulo} etiqueta="Copiar el título" patty="anuncio-copiar-titulo" principal />
        </div>
        <pre>{t.titulo}</pre>
      </div>
      <div className="pap-copiable">
        <div className="pap-copiable-cabeza">
          <strong>Descripción</strong>
          <BotonCopiar texto={t.descripcion} etiqueta="Copiar la descripción" patty="anuncio-copiar-descripcion" principal />
        </div>
        <pre>{t.descripcion}</pre>
      </div>
      {fotos && (
        <div className="pap-copiable">
          <div className="pap-copiable-cabeza">
            <strong>Orden de fotos</strong>
            <BotonCopiar texto={fotos} etiqueta="Copiar el orden" patty="anuncio-copiar-fotos" />
          </div>
        </div>
      )}
    </>
  );
}

/** Mientras el anuncio no esté activo: vuelve a leer la página cada 15 s con la pestaña a la vista, y un botón. */
export function Comprobar({ activo }: { activo: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [revisado, setRevisado] = useState(false);
  useEffect(() => {
    if (activo) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15_000);
    return () => window.clearInterval(id);
  }, [activo, router]);
  if (activo) return null;
  return (
    <div className="pap-acciones">
      <button
        type="button"
        className="primario pap-accion"
        disabled={pendiente}
        aria-busy={pendiente}
        onClick={() =>
          empezar(() => {
            router.refresh();
            setRevisado(true);
          })
        }
        data-patty="anuncio-comprobar"
      >
        {pendiente ? "Comprobando…" : "Ya lo leí, comprobar"}
      </button>
      <span className="solo-lector" aria-live="polite">
        {revisado && !pendiente ? "Todavía no llega. Revisa que tocaste Leer este anuncio en tu anuncio publicado." : ""}
      </span>
      {revisado && !pendiente && (
        <p className="pap-nota" style={{ margin: 0, flexBasis: "100%" }}>
          Todavía no llega. Revisa que abriste <strong>tu anuncio ya publicado</strong> y tocaste <strong>Leer este anuncio</strong>. Esta página revisa
          sola cada 15 segundos.
        </p>
      )}
    </div>
  );
}
