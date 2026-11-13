import Link from "next/link";
import { notFound } from "next/navigation";
import { enlaceWhatsApp } from "@/lib/anuncios/atribucion";
import type { Foto } from "@/lib/datos/tipos";
import { clavePasos } from "@/lib/panel/pasos";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { EncabezadoPagina } from "../../../piezas";
import { AsistentePasos, type PasoGuia } from "../../../pasos/asistente-pasos";
import { IlusCopiarCampos, IlusFormularioE24, IlusLeerAnuncio } from "../../../pasos/ilustraciones";
import { Comprobar, CopiarAnuncio, type Partes } from "./piezas";

// Publicar un anuncio en Encuentra24 paso a paso: el texto ya preparado (con su referencia en el enlace de WhatsApp),
// copiar cada parte, publicarlo en Encuentra24 y leerlo con la extensión. Avanza solo al final cuando el anuncio pasa
// a activo (anuncios_e24.estado), que es lo que hace "Leer este anuncio".

type Texto = {
  es?: { titulo: string; descripcion: string };
  en?: { titulo: string; descripcion: string };
  orden_fotos?: { foto: number; muestra: string }[];
};

export default async function Publicar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("anuncios_e24")
    .select("id, referencia, estado, titulo, url, texto_preparado, propiedad_id")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const a = data as { id: string; referencia: string; estado: string; titulo: string | null; url: string | null; texto_preparado: Texto | null; propiedad_id: string | null };
  const texto = a.texto_preparado ?? {};
  const [{ data: casa }, { data: conexiones }] = await Promise.all([
    a.propiedad_id
      ? supabase.from("propiedades").select("id, titulo, fotos").eq("corredor_id", corredor.id).eq("id", a.propiedad_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("extension_conexiones")
      .select("conectada_at")
      .eq("corredor_id", corredor.id)
      .not("conectada_at", "is", null)
      .is("revocada_at", null)
      .limit(1),
  ]);
  const demo = corredor.activo === false;
  const extension = !demo && (conexiones?.length ?? 0) > 0;
  const activo = a.estado === "activo";
  // Ya no está por publicar (publicado, vencido o pausado): la guía va al final.
  const hecho = a.estado !== "borrador";
  const asistente = corredor.nombre_asistente ?? "Patty";

  const enlace = corredor.whatsapp_numero ? enlaceWhatsApp(corredor.whatsapp_numero, a.referencia) : null;
  const partes = (t: { titulo: string; descripcion: string } | undefined, invitacion: string): Partes | null =>
    t ? { titulo: t.titulo, descripcion: `${t.descripcion}${enlace ? `\n\n${invitacion}: ${enlace}` : ""}` } : null;
  const es = partes(texto.es, "Escríbeme por WhatsApp");
  const en = partes(texto.en, "Message me on WhatsApp");
  // Las fotos en el mismo orden en que se las mostró a Claude al preparar el anuncio (lib/asistente/cerebro.ts).
  const fotosCasa = [...(((casa as { fotos?: Foto[] } | null)?.fotos ?? []) as Foto[])].sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0));
  const orden = (texto.orden_fotos ?? []).map((o) => ({ ...o, url: fotosCasa[o.foto - 1]?.url ?? null }));
  const ordenTexto = orden.map((o, i) => `${i + 1}. Foto ${o.foto}: ${o.muestra}`).join("\n");
  const nombre = a.titulo ?? (casa as { titulo?: string } | null)?.titulo ?? `ref. ${a.referencia}`;

  const pasos: PasoGuia[] = [
    {
      id: "preparar",
      nombre: "Preparado",
      titulo: "El texto ya está listo",
      ilustracion: <IlusCopiarCampos />,
      contenido: (
        <>
          <p className="pap-instruccion">
            {asistente} escribió el título y la descripción{texto.en ? " en español e inglés" : ""}. La descripción termina con tu enlace de WhatsApp con la
            referencia <strong>{a.referencia}</strong>: así sabes qué clientes llegan por este anuncio.
          </p>
        </>
      ),
    },
    {
      id: "copiar",
      nombre: "Copiar",
      titulo: "Copia cada parte",
      ilustracion: <IlusCopiarCampos />,
      contenido: es ? (
        <>
          <p className="pap-instruccion">Toca Copiar y pégalo en Encuentra24. Haz una parte a la vez.</p>
          <CopiarAnuncio es={es} en={en} fotos={ordenTexto} />
          {orden.length > 0 && (
            <ol className="pap-fotos" aria-label="Orden de las fotos">
              {orden.map((o, i) => (
                <li key={`${o.foto}-${i}`}>
                  {o.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura de una foto propia del bucket
                    <img src={o.url} alt="" loading="lazy" />
                  ) : null}
                  <b>{i + 1}</b>
                  {o.muestra}
                </li>
              ))}
            </ol>
          )}
          {!enlace && <p className="pap-nota pap-nota-ambar">Falta el número de la asistente: el texto no lleva el enlace de WhatsApp. Pídeselo a soporte.</p>}
        </>
      ) : (
        <p className="pap-nota pap-nota-ambar">Este anuncio no tiene texto preparado. Prepáralo otra vez desde la ficha de la casa.</p>
      ),
    },
    {
      id: "publicar",
      nombre: "Publicar",
      titulo: "Publícalo en Encuentra24",
      ilustracion: <IlusFormularioE24 />,
      contenido: (
        <>
          <ol className="pap-subpasos">
            <li>
              Abre Encuentra24, entra con tu cuenta y toca <strong>Publicar anuncio</strong>.
            </li>
            <li>
              Pega el <strong>título</strong> y la <strong>descripción</strong> donde corresponden.
            </li>
            <li>Sube las fotos en el orden sugerido, completa precio y datos, y publica.</li>
          </ol>
          <p className="pap-nota pap-nota-ambar">
            <strong>No borres el enlace de WhatsApp</strong> del final de la descripción: trae la referencia {a.referencia}, que dice de cuál anuncio viene
            cada cliente.
          </p>
          <a href="https://www.encuentra24.com/costa-rica-es" target="_blank" rel="noreferrer" className="boton primario pap-accion" data-patty="anuncio-abrir-e24">
            Abrir Encuentra24
          </a>
          <p className="pap-nota">Se abre en otra pestaña. Deja esta abierta para volver.</p>
        </>
      ),
      ayuda: [
        { p: "Encuentra24 no deja poner enlaces", r: <>Si lo quita al publicar, edita el anuncio y pégalo otra vez al final de la descripción.</> },
        { p: "¿Español o inglés?", r: <>Si Encuentra24 deja un solo texto, usa el español. El inglés sirve para un segundo anuncio o para redes.</> },
      ],
    },
    {
      id: "leer",
      nombre: "Leer",
      titulo: "Léelo con la extensión",
      ilustracion: <IlusLeerAnuncio />,
      siguiente: null,
      contenido: (
        <>
          <ol className="pap-subpasos">
            <li>
              En Chrome de tu computadora, abre <strong>tu anuncio ya publicado</strong>.
            </li>
            <li>
              Toca la <strong>pieza de rompecabezas</strong> de arriba a la derecha, luego <strong>Buscador de dueños</strong> y{" "}
              <strong>Leer este anuncio</strong>.
            </li>
          </ol>
          {extension ? (
            <p className="pap-nota pap-nota-verde">Tu extensión está conectada.</p>
          ) : (
            <p className="pap-nota pap-nota-ambar">
              {demo ? "En la demo no hay extensión conectada." : "Todavía no tienes la extensión conectada."}{" "}
              <Link href="/panel/duenos/extension" data-patty="anuncio-instalar-extension">
                Instálala paso a paso
              </Link>
              .
            </p>
          )}
          <p className="pap-instruccion">Cuando la leas, esta página se da cuenta sola y sigue.</p>
          <Comprobar activo={hecho} />
        </>
      ),
      ayuda: [
        { p: "La extensión dice que no es un anuncio tuyo", r: <>Revisa que la descripción publicada tenga el enlace de WhatsApp con la referencia {a.referencia}.</> },
        { p: "Lo publiqué desde el teléfono", r: <>Está bien: después ábrelo en Chrome de tu computadora para leerlo.</> },
      ],
    },
  ];

  return (
    <div className="pasos-pagina">
      <EncabezadoPagina titulo="Publicar en Encuentra24" apoyo={nombre} atras={{ href: "/panel/anuncios", texto: "Anuncios" }} />
      <AsistentePasos
        id="anuncio"
        etiqueta="Pasos para publicar el anuncio"
        pasos={pasos}
        cumplidos={hecho ? pasos.map((p) => p.id) : ["preparar"]}
        clave={clavePasos("anuncio", a.id)}
        final={{
          titulo: activo ? "Listo: tu anuncio está publicado" : "Este anuncio ya no está por publicar",
          contenido: (
            <>
              <p>
                {activo
                  ? "Cada cliente que escriba por el enlace del anuncio queda contado en Anuncios, y en su ficha verás de cuál anuncio vino."
                  : "Míralo en Anuncios."}
              </p>
              <div className="pap-acciones" style={{ justifyContent: "center" }}>
                <Link href="/panel/anuncios" className="boton primario">
                  Ver mis anuncios
                </Link>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer" className="boton">
                    Verlo en Encuentra24
                  </a>
                )}
              </div>
            </>
          ),
        }}
      />
    </div>
  );
}
