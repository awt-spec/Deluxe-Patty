import { IconoAbajo, IconoArriba, IconoDocumento, IconoEstrella, IconoMegafono } from "../../iconos";
import { Volver } from "../../volver";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Foto } from "@/lib/datos/tipos";
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

function BotonFoto({
  id,
  url,
  accion,
  texto,
  etiqueta,
  peligro,
}: {
  id: string;
  url: string;
  accion: string;
  texto: React.ReactNode;
  etiqueta?: string;
  peligro?: boolean;
}) {
  return (
    <form action={ordenarFoto}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="url" value={url} />
      <input type="hidden" name="accion" value={accion} />
      <button type="submit" className={`chico ${peligro ? "peligro" : ""}`} aria-label={etiqueta}>
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
      <Volver href="/panel/propiedades" texto="Mis casas" />
      <header className="encabezado">
        <div style={{ minWidth: 0 }}>
          <h1>{p.titulo}</h1>
          <p className="suave">{p.codigo}</p>
        </div>
      </header>
      <Aviso texto={aviso} />

      <section className="pila" style={{ marginBottom: 8 }}>
        <form action={generarFicha}>
          <input type="hidden" name="id" value={p.id} />
          <BotonEnviar texto={<><IconoDocumento tamano={24} /> Ficha para mandar a un cliente</>} pendiente="Armando la ficha…" className="primario grande" />
        </form>
        <form action={prepararAnuncioPanel}>
          <input type="hidden" name="id" value={p.id} />
          <BotonEnviar texto={<><IconoMegafono tamano={24} /> Escribir el anuncio de Encuentra24</>} pendiente="Escribiendo el anuncio…" className="grande" />
        </form>
      </section>

      <h2 id="fotos">Fotos</h2>
      <p className="suave">
        La primera es la que se ve en la ficha y en el anuncio.
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
              {i === 0 ? <><IconoEstrella tamano={16} /> Principal</> : `Foto ${i + 1}`}
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
              {i > 0 && <BotonFoto id={p.id} url={f.url} accion="principal" texto={<><IconoEstrella tamano={18} /> Principal</>} />}
              {i > 0 && <BotonFoto id={p.id} url={f.url} accion="subir" texto={<IconoArriba tamano={20} />} etiqueta="Subir" />}
              {i < fotos.length - 1 && <BotonFoto id={p.id} url={f.url} accion="bajar" texto={<IconoAbajo tamano={20} />} etiqueta="Bajar" />}
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
            Mejora la luz y el color de las fotos. Tarda unos minutos. Tus fotos originales no se tocan: revisa las
            mejoradas antes de usarlas.
          </p>
          <BotonEnviar texto="Mejorar fotos" pendiente="Mejorando… puede tardar unos minutos" />
        </form>
      )}

      <h2>¿Sigue disponible?</h2>
      {p.estado !== "activa" ? (
        <form action={cambiarEstado}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="estado" value="activa" />
          <p className="suave">La asistente no la está ofreciendo.</p>
          <button type="submit" className="grande">
            Volver a ofrecerla
          </button>
        </form>
      ) : (
        <div className="botones">
          <form action={cambiarEstado}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="estado" value={p.operacion === "alquiler" ? "alquilada" : "vendida"} />
            <button type="submit">{p.operacion === "alquiler" ? "Ya se alquiló" : "Ya se vendió"}</button>
          </form>
          <form action={cambiarEstado}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="estado" value="inactiva" />
            <button type="submit">Pausarla</button>
          </form>
        </div>
      )}

      <details style={{ marginTop: 20 }}>
        <summary>Ver o cambiar todos los datos</summary>
        <FormularioPropiedad p={p} accion={guardarPropiedad} boton="Guardar cambios" />
      </details>
    </>
  );
}
