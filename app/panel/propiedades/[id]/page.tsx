import Link from "next/link";
import { notFound } from "next/navigation";
import type { Foto } from "@/lib/datos/tipos";
import { MAX_FOTOS } from "@/lib/fotos/mejorar";
import { MAX_FOTOS_PROPIEDAD, ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { Aviso } from "../../aviso";
import { BotonEnviar } from "../../boton-enviar";
import {
  cambiarEstado,
  generarFicha,
  guardarPropiedad,
  mejorarFotosPanel,
  ordenarFoto,
  prepararAnuncioPanel,
} from "../acciones";
import { FormularioPropiedad, type PropiedadFormulario } from "../formulario";
import { SubirFotos } from "../subir-fotos";

// La mejora de fotos con IA puede tardar varios minutos.
export const maxDuration = 300;

function BotonFoto({ id, url, accion, texto, peligro }: { id: string; url: string; accion: string; texto: string; peligro?: boolean }) {
  return (
    <form action={ordenarFoto}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="accion" value={accion} />
      <button type="submit" className={`chico ${peligro ? "peligro" : ""}`}>
        {texto}
      </button>
    </form>
  );
}

export default async function Propiedad({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { id } = await params;
  const { aviso } = await searchParams;
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("propiedades")
    .select(
      "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado, fotos",
    )
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const p = data as PropiedadFormulario & { id: string; fotos: Foto[] };
  const fotos = ordenarFotos(p.fotos);
  const fotosActivas = !!process.env.OPENAI_API_KEY;

  return (
    <>
      <p>
        <Link href="/panel/propiedades" className="suave">
          ← Propiedades
        </Link>
      </p>
      <header className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1>{p.titulo}</h1>
          <p className="suave">{p.codigo}</p>
        </div>
      </header>
      <Aviso texto={aviso} />

      <section className="pila">
        <div className="botones">
          <form action={generarFicha}>
            <input type="hidden" name="id" value={p.id} />
            <BotonEnviar texto="Ficha PDF" pendiente="Armando la ficha…" />
          </form>
          <form action={prepararAnuncioPanel}>
            <input type="hidden" name="id" value={p.id} />
            <BotonEnviar texto="Preparar anuncio" pendiente="Escribiendo el anuncio…" />
          </form>
        </div>
        <div className="botones">
          {p.estado !== "activa" ? (
            <form action={cambiarEstado}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="estado" value="activa" />
              <button type="submit">Volver a ofrecerla</button>
            </form>
          ) : (
            <form action={cambiarEstado}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="estado" value="inactiva" />
              <button type="submit">Pausar: que la asistente no la ofrezca</button>
            </form>
          )}
        </div>
      </section>

      <h2 id="fotos">Fotos</h2>
      <p className="suave">
        La primera es la principal: va en la ficha y en el anuncio. Hasta {MAX_FOTOS_PROPIEDAD} fotos.
      </p>
      {fotos.length === 0 && <p className="vacio">Todavía no tiene fotos.</p>}
      <div className="galeria">
        {fotos.map((f, i) => (
          <figure key={f.url} className="tarjeta pila">
            <a href={f.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Foto ${i + 1}`} loading="lazy" />
            </a>
            <figcaption className="suave">
              {i === 0 ? "Principal" : `Foto ${i + 1}`}
              {f.mejorada_url && (
                <>
                  {" · "}
                  <a href={f.mejorada_url} target="_blank" rel="noreferrer">
                    ver mejorada
                  </a>
                </>
              )}
            </figcaption>
            <div className="botones">
              {i > 0 && <BotonFoto id={p.id} url={f.url} accion="principal" texto="Principal" />}
              {i > 0 && <BotonFoto id={p.id} url={f.url} accion="subir" texto="↑" />}
              {i < fotos.length - 1 && <BotonFoto id={p.id} url={f.url} accion="bajar" texto="↓" />}
              <BotonFoto id={p.id} url={f.url} accion="quitar" texto="Quitar" peligro />
            </div>
          </figure>
        ))}
      </div>
      {fotos.length < MAX_FOTOS_PROPIEDAD && <SubirFotos propiedadId={p.id} />}
      {fotosActivas && fotos.length > 0 && (
        <form action={mejorarFotosPanel} className="pila tarjeta">
          <input type="hidden" name="id" value={p.id} />
          <p className="suave">
            Mejora con IA la luz y el color de las primeras {Math.min(MAX_FOTOS, fotos.length)} fotos. Tarda unos minutos.
            La original no se toca: revisa cada mejorada antes de publicarla, porque la IA puede cambiar detalles.
          </p>
          <BotonEnviar texto="Mejorar fotos" pendiente="Mejorando… puede tardar unos minutos" />
        </form>
      )}

      <h2>Ficha</h2>
      <FormularioPropiedad p={p} accion={guardarPropiedad} boton="Guardar cambios" />
    </>
  );
}
