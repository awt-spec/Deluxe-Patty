import Link from "next/link";
import { notFound } from "next/navigation";
import type { Foto, Propiedad } from "@/lib/datos/tipos";
import { fotosPropias } from "@/lib/fotos/origen";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { opcionesDeFoto } from "@/lib/redes/fotos";
import { TAMANOS, textoPublicacion, type Formato } from "@/lib/redes/texto";
import { Volver } from "../../../volver";
import { CopiarTexto } from "./copiar";

// Imagen para redes de una casa: se elige la foto y sale lista en cuadrado (publicación) y vertical
// (historia), con el texto para copiar. La arma el código con los datos de la ficha.

export default async function Redes({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ img?: string }> }) {
  const { id } = await params;
  const { img } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("propiedades")
    .select("id, codigo, titulo, operacion, tipo, precio, moneda, zona, canton, habitaciones, banos, m2_construccion, m2_terreno, amenidades, fotos")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as Propiedad & { fotos: Foto[] };
  const opciones = opcionesDeFoto(fotosPropias(p.fotos ?? [], corredor.id));
  const elegida = opciones.find((o) => o.url === img) ?? opciones[0];
  const enlace = (formato: Formato, descargar = false) =>
    `/panel/propiedades/${p.id}/redes/imagen?formato=${formato}${elegida ? `&img=${encodeURIComponent(elegida.url)}` : ""}${descargar ? "&descargar=1" : ""}`;
  const texto = textoPublicacion(p, { nombre: corredor.nombre_contacto, whatsapp: corredor.whatsapp_numero });

  return (
    <>
      <Volver href={`/panel/propiedades/${p.id}`} texto={p.titulo} />
      <header className="encabezado">
        <h1>Imagen para redes</h1>
      </header>
      {opciones.length === 0 ? (
        <p className="vacio">
          Primero sube fotos de la casa. <Link href={`/panel/propiedades/${p.id}#fotos`}>Ir a las fotos</Link>
        </p>
      ) : (
        <>
          <p className="suave">Elige la foto. El precio y los datos salen de la ficha de la casa.</p>
          <div className="redes-fotos" role="list">
            {opciones.map((o) => (
              <Link
                key={o.url}
                role="listitem"
                href={`/panel/propiedades/${p.id}/redes?img=${encodeURIComponent(o.url)}`}
                className={o.url === elegida.url ? "elegida" : undefined}
                aria-current={o.url === elegida.url ? "true" : undefined}
                title={o.nombre}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.url} alt={o.nombre} loading="lazy" />
                {o.ilustrativa && <span>Ilustrativa</span>}
              </Link>
            ))}
          </div>
          {elegida.ilustrativa && (
            <p className="aviso">Esta foto está hecha con IA: la imagen dice “Imagen ilustrativa” para que nadie la tome como real.</p>
          )}
          <div className="redes-vistas">
            {(Object.keys(TAMANOS) as Formato[]).map((f) => (
              <figure key={f} className={`redes-vista ${f}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enlace(f)} alt={TAMANOS[f].nombre} />
                <figcaption>
                  <span>{TAMANOS[f].nombre}</span>
                  <a href={enlace(f, true)} className="boton primario chico" download>
                    Descargar
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
          <section className="tarjeta pila">
            <h2>Texto para acompañarla</h2>
            <textarea readOnly value={texto} rows={10} aria-label="Texto para la publicación" />
            <CopiarTexto texto={texto} />
          </section>
        </>
      )}
    </>
  );
}
