"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { AsistentePasos, BotonCopiar, usePasos, type PasoGuia } from "../../../../pasos/asistente-pasos";
import { IlusGaleria, IlusNuevaPublicacion, IlusPegarTexto } from "../../../../pasos/ilustraciones";

// Después de "Descargar video" en el estudio de redes: cómo subirlo a Instagram (Reels o Historias), al Estado de
// WhatsApp o a TikTok. Todo pasa fuera del panel, así que no hay nada que detectar: la guía solo explica, con el
// texto de la casa (lib/redes/texto.ts) listo para copiar.

type Destino = "reels" | "historias" | "estado" | "tiktok";
type Telefono = "iphone" | "android";

const DESTINOS: Record<Destino, { nombre: string; app: string; detalle: string; boton: string; abrir: string; texto: boolean; musica: boolean }> = {
  reels: {
    nombre: "Instagram Reels",
    app: "Instagram",
    detalle: "Video en tu perfil",
    boton: "el +",
    abrir: "Toca el + de abajo, elige Reel y toca tu video (el más reciente).",
    texto: true,
    musica: true,
  },
  historias: {
    nombre: "Instagram Historias",
    app: "Instagram",
    detalle: "Dura 24 horas",
    boton: "el +",
    abrir: "Toca el + de abajo, elige Historia y toca tu video (el más reciente).",
    texto: false,
    musica: true,
  },
  estado: {
    nombre: "Estado de WhatsApp",
    app: "WhatsApp",
    detalle: "Lo ven tus contactos 24 horas",
    boton: "la cámara",
    abrir: "Ve a Novedades (o Estados), toca la cámara o el lápiz de Mi estado y elige tu video.",
    texto: true,
    musica: false,
  },
  tiktok: {
    nombre: "TikTok",
    app: "TikTok",
    detalle: "Video corto",
    boton: "el +",
    abrir: "Toca el + del centro, luego Subir (o Galería) y elige tu video.",
    texto: true,
    musica: true,
  },
};

const sinCambios = () => () => {};
const telefonoDelNavegador = (): Telefono =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? "iphone" : "android";

function Elegir({ destino, elegir }: { destino: Destino; elegir: (d: Destino) => void }) {
  const { siguiente } = usePasos();
  return (
    <div className="pasos-opciones" role="group" aria-label="Dónde lo vas a subir">
      {(Object.keys(DESTINOS) as Destino[]).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={destino === d}
          onClick={() => {
            elegir(d);
            siguiente();
          }}
          data-patty={`subir-${d}`}
        >
          {DESTINOS[d].nombre}
          <small>{DESTINOS[d].detalle}</small>
        </button>
      ))}
    </div>
  );
}

export function GuiaSubir({ propiedadId, texto }: { propiedadId: string; texto: string }) {
  const [destino, setDestino] = useState<Destino>("reels");
  // El teléfono se adivina en el navegador (en el servidor no se sabe); lo que la persona toque manda.
  const detectado = useSyncExternalStore(sinCambios, telefonoDelNavegador, () => "android" as Telefono);
  const [elegido, setTel] = useState<Telefono | null>(null);
  const tel = elegido ?? detectado;
  const d = DESTINOS[destino];

  const pasos: PasoGuia[] = [
    {
      id: "destino",
      nombre: "Dónde",
      titulo: "¿Dónde lo vas a subir?",
      contenido: (
        <>
          <p className="pasos-instruccion">Toca uno. Si lo vas a poner en varios, empieza por uno y después vuelves.</p>
          <Elegir destino={destino} elegir={setDestino} />
        </>
      ),
    },
    {
      id: "encontrar",
      nombre: "Tu video",
      titulo: tel === "iphone" ? "Pásalo a tus Fotos" : "Búscalo en tu Galería",
      ilustracion: <IlusGaleria android={tel === "android"} />,
      contenido: (
        <>
          <div className="pasos-idioma" role="group" aria-label="Tu teléfono">
            <button type="button" aria-pressed={tel === "iphone"} onClick={() => setTel("iphone")} data-patty="subir-iphone">
              iPhone
            </button>
            <button type="button" aria-pressed={tel === "android"} onClick={() => setTel("android")} data-patty="subir-android">
              Android
            </button>
          </div>
          {tel === "iphone" ? (
            <ol className="pasos-subpasos">
              <li>
                Abre la app <strong>Archivos</strong> y entra a <strong>Descargas</strong>.
              </li>
              <li>
                Toca el video, luego el botón de <strong>compartir</strong> (el cuadro con la flecha) y <strong>Guardar video</strong>.
              </li>
              <li>
                Ya está en <strong>Fotos</strong>, al final.
              </li>
            </ol>
          ) : (
            <ol className="pasos-subpasos">
              <li>
                Abre la <strong>Galería</strong> (o Google Fotos).
              </li>
              <li>
                Está arriba, entre lo más reciente, o en el álbum <strong>Descargas</strong>.
              </li>
            </ol>
          )}
        </>
      ),
      ayuda: [
        { p: "No lo encuentro", r: <>Vuelve al estudio y toca «Bajarlo otra vez». Se llama con el código de la casa y la palabra video.</> },
        { p: "Lo bajé en la computadora", r: <>Mándatelo por WhatsApp a ti misma o súbelo desde la computadora en instagram.com.</> },
      ],
    },
    {
      id: "subir",
      nombre: "Abrir la app",
      titulo: `Ábrelo en ${d.app}`,
      ilustracion: <IlusNuevaPublicacion app={d.app} boton={d.boton} />,
      contenido: (
        <>
          <p className="pasos-instruccion">
            Abre <strong>{d.app}</strong>. {d.abrir}
          </p>
          <p className="pasos-nota">El video ya trae el precio, los datos y tu marca: no hace falta ponerle texto encima.</p>
        </>
      ),
      ayuda: [{ p: `${d.app} no muestra el video`, r: <>Revisa que esté en {tel === "iphone" ? "Fotos (paso 2)" : "la Galería"} y vuelve a abrir la app.</> }],
    },
    {
      id: "texto",
      nombre: "Texto",
      titulo: d.texto ? "Pega el texto y publica" : "Agrega lo que quieras y publica",
      ilustracion: <IlusPegarTexto musica={d.musica} />,
      contenido: (
        <>
          {d.texto ? (
            <>
              <p className="pasos-instruccion">
                Copia el texto de la casa y pégalo donde dice <strong>{destino === "estado" ? "Añade un comentario" : "descripción"}</strong>: deja apretado
                el dedo y toca <strong>Pegar</strong>.
              </p>
              <div className="pasos-copiable">
                <div className="pasos-copiable-cabeza">
                  <strong>Texto de la casa</strong>
                  <BotonCopiar texto={texto} etiqueta="Copiar el texto" patty="subir-copiar" principal />
                </div>
                <pre>{texto}</pre>
              </div>
            </>
          ) : (
            <p className="pasos-instruccion">
              Las Historias no llevan descripción. Si quieres, agrega un sticker de <strong>Enlace</strong> con tu WhatsApp.
            </p>
          )}
          {d.musica && (
            <p className="pasos-nota">
              <strong>¿Sin música?</strong> Si al hacer el video no le pusiste una canción, toca el botón de <strong>música</strong> en {d.app} y elige una.
            </p>
          )}
          <p className="pasos-instruccion">
            Toca <strong>{destino === "reels" || destino === "tiktok" ? "Compartir" : "Enviar"}</strong>.
          </p>
        </>
      ),
    },
  ];

  return (
    <AsistentePasos
      id="subir"
      etiqueta="Pasos para subir el video"
      pasos={pasos}
      final={{
        titulo: "¡Publicado!",
        contenido: (
          <>
            <p>Si te escriben por el video, la asistente les contesta con los datos de la casa.</p>
            <div className="pasos-acciones" style={{ justifyContent: "center" }}>
              <Link href={`/panel/propiedades/${propiedadId}/redes?ver=video`} className="boton primario" data-patty="subir-volver-video">
                Volver al video
              </Link>
              <Link href={`/panel/propiedades/${propiedadId}`} className="boton">
                Volver a la casa
              </Link>
            </div>
          </>
        ),
      }}
    />
  );
}
